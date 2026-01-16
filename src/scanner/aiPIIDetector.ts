import { openai, deploymentName } from "../config/openaiClient";
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
        // If OpenAI not configured → fallback
        if (!openai) {
            return this.mockDetect(value, fieldName);
        }

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

Return JSON only:
{
  "is_pii": boolean,
  "type": "string",
  "confidence": number
}
`;

        try {
            const completion = await openai.chat.completions.create({
                model: deploymentName,
                response_format: { type: "json_object" },
                messages: [{ role: "user", content: prompt }],
                temperature: 0,
            });

            const content = completion.choices[0]?.message?.content;

            if (!content) {
                return this.mockDetect(value, fieldName);
            }

            const parsed = safeParseJSON(content);

            // 🚨 Guard against broken AI responses
            if (
                !parsed ||
                typeof parsed.is_pii !== "boolean" ||
                typeof parsed.type !== "string"
            ) {
                console.warn("⚠️ Invalid AI response, fallback used:", content);
                return this.mockDetect(value, fieldName);
            }

            if (parsed.is_pii && parsed.type !== "none") {
                const category = getCategoryForType(parsed.type);
                const risk = calculateRisk(category);

                return {
                    is_pii: true,
                    type: parsed.type,
                    category,
                    risk,
                    confidence: Number(parsed.confidence ?? 0.5),
                };
            }

            return { is_pii: false, type: "none", confidence: 0 };

        } catch (err) {
            console.error("❌ Azure AI failed, fallback used:", err);
            return this.mockDetect(value, fieldName);
        }
    }

    /**
     * Deterministic fallback for reliability
     */
    private mockDetect(value: string, fieldName: string): AIResponse {
        const lower = fieldName.toLowerCase();

        if (lower.includes("email")) {
            return { is_pii: true, type: "email", category: "CONTACT", risk: "Medium", confidence: 0.9 };
        }
        if (lower.includes("phone") || lower.includes("mobile")) {
            return { is_pii: true, type: "phone", category: "CONTACT", risk: "Medium", confidence: 0.9 };
        }
        if (lower.includes("aadhaar")) {
            return { is_pii: true, type: "aadhaar", category: "IDENTITY", risk: "High", confidence: 0.95 };
        }
        if (lower.includes("pan")) {
            return { is_pii: true, type: "pan", category: "IDENTITY", risk: "High", confidence: 0.95 };
        }
        if (lower.includes("salary")) {
            return { is_pii: true, type: "salary", category: "FINANCIAL", risk: "High", confidence: 0.9 };
        }

        return { is_pii: false, type: "none", confidence: 0 };
    }
}
