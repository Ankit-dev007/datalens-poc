import { LLMFactory } from "../llm/LLMFactory";
import { AIResponse } from "../types";
import { calculateRisk, getCategoryForType } from "../utils/riskCalculator";

/**
 * Safely parse JSON returned by LLMs.
 * Handles:
 * - Extra text around JSON
 * - Broken / partial JSON
 * - Invalid responses
 */
function safeParseJSON(text: string): any | null {
    try {
        return JSON.parse(text);
    } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) return null;

        try {
            return JSON.parse(match[0]);
        } catch {
            return null;
        }
    }
}

export class AIPIIDetector {

    async detect(value: string, fieldName: string): Promise<AIResponse> {
        // Use Factory to get provider
        const llm = LLMFactory.getProvider();

        const prompt = `
CRITICAL RULE:
- Return ONLY valid minified JSON
- No explanations
- No markdown
- No text outside JSON

You are a PII classifier for Indian DPDP Act compliance.

Based on:
Column Name: "${fieldName}"
Sample Value: "${value}"

Rules:
1. Ignore standard IDs (int/uuid) unless they identify a person.
2. Do NOT classify Aadhaar, PAN, or Bank numbers if they look like plain numbers.
3. If unstructured text contains them, identify them.
4. Allowed PII types:
   - identity: full_name, username, gender
   - contact: email, phone, mobile, address
   - financial: credit_card, debit_card, bank_details, salary
   - health: medical_record, diagnosis, insurance
   - children: child_name, school, age_of_minor
   - digital: ip_address, device_id
   - other: religion, caste, political_opinion
   - none

5. CONFIDENCE & STATUS:
   - confidence: 0.0 to 1.0
   - status: "auto_classified" | "needs_confirmation"
   - if confidence < 0.6, status MUST be "needs_confirmation"

Return JSON only:
{
  "type": "string",
  "confidence": number,
  "status": "auto_classified" | "needs_confirmation",
  "reason": "short explanation"
}
`;

        try {
            const completion = await llm.chat({
                model: 'model-ignored',
                response_format: { type: "json_object" },
                messages: [{ role: "user", content: prompt }],
                temperature: 0,
            });

            const content = completion.choices[0]?.message?.content;

            if (!content) {
                return this.mockDetect(value, fieldName);
            }

            const parsed = safeParseJSON(content);

            // 1. Validate structure (Relaxed: type/is_pii not strictly required to be non-null/true)
            if (
                !parsed ||
                typeof parsed.confidence !== "number" ||
                typeof parsed.status !== "string"
            ) {
                console.warn("⚠️ Invalid AI response structure (missing confidence/status), fallback used:", content);
                return this.mockDetect(value, fieldName);
            }

            // 2. Normalize Data
            let type = parsed.type || "none";
            let confidence = Number(parsed.confidence);
            let reason = parsed.reason || "AI classification";

            // 3. Centralized Backend Decision Logic
            // Helper for deterministic status
            const mapConfidenceToStatus = (conf: number): "auto_classified" | "needs_confirmation" | "discarded" => {
                if (conf >= 0.8) return "auto_classified";
                if (conf >= 0.50) return "needs_confirmation";
                return "discarded";
            };

            const status = mapConfidenceToStatus(confidence);

            // Determine is_pii authoritative status
            // PII is ONLY true if we are confident enough to auto-classify or it's implicitly confirmed (though LLM returns auto/needs_conf).
            // 'needs_confirmation' implies it MIGHT be PII, but is_pii flag is typically for "found and verified/confident" results in some contexts.
            // However, the requirement says: "- Set is_pii = true ONLY for: - auto_classified - confirmed"
            // So if status is 'needs_confirmation', is_pii MUST be false here.

            const is_pii = (status === "auto_classified");

            // 4. Calculate Derived Fields (Risk, Category)
            let category = undefined;
            let risk = undefined;

            if (type !== "none" && status !== "discarded") {
                category = getCategoryForType(type);
                risk = calculateRisk(category);
            }

            return {
                is_pii,
                type,
                category,
                risk,
                confidence,
                status,
                reason
            };

        } catch (err) {
            console.error("❌ AI failed, fallback used:", err);
            return this.mockDetect(value, fieldName);
        }
    }

    /**
     * Deterministic fallback for reliability
     */
    private mockDetect(value: string, fieldName: string): AIResponse {
        const lower = fieldName.toLowerCase();

        // Helper to construct consistent response
        const makeResponse = (type: string, category: string, risk: "High" | "Medium" | "Low", confidence: number): AIResponse => {
            // Apply same logic: >= 0.8 is auto_classified -> is_pii=true
            const status = confidence >= 0.8 ? "auto_classified" : "needs_confirmation";
            const is_pii = status === "auto_classified";
            return {
                is_pii,
                type,
                category,
                risk,
                confidence,
                status,
                reason: "Fallback regex match"
            };
        };

        if (lower.includes("email")) {
            return makeResponse("email", "CONTACT", "Medium", 0.9);
        }
        if (lower.includes("phone") || lower.includes("mobile")) {
            return makeResponse("phone", "CONTACT", "Medium", 0.9);
        }
        if (lower.includes("aadhaar")) {
            return makeResponse("aadhaar", "IDENTITY", "High", 0.95);
        }
        if (lower.includes("pan")) {
            return makeResponse("pan", "IDENTITY", "High", 0.95);
        }
        if (lower.includes("salary")) {
            return makeResponse("salary", "FINANCIAL", "High", 0.9);
        }

        return { is_pii: false, type: "none", confidence: 0, status: "auto_classified", reason: "Fallback: Not PII" };
    }
}
