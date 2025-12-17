import { openai, deploymentName } from "../config/openaiClient";
import { AIResponse } from "../types";
import { calculateRisk, getCategoryForType } from "../utils/riskCalculator";

export class AIPIIDetector {

    async detect(value: string, fieldName: string): Promise<AIResponse> {
        if (!openai) {
            return this.mockDetect(value, fieldName);
        }

        const prompt = `You are a PII classifier for Indian DPDP Act compliance. Based on the column name "${fieldName}" and sample value "${value}", classify the data.

Rules:
1. Ignore if value looks like a standard database ID (integer/uuid) unless it implies personal identity (e.g. Employee ID).
2. Do NOT classify Aadhaar, PAN, or specific Bank Account numbers if they look like simple numbers (Regex handles them). BUT if it is unstructured text containing them, identify them.
3. Return the specific PII TYPE from this list if applicable:
   - identity: full_name, username, gender
   - contact: email, phone, mobile, address
   - financial: credit_card, debit_card, bank_details, salary
   - health: medical_record, diagnosis, insurance, health_data
   - children: child_name, school, age_of_minor
   - digital: ip_address, device_id, cookies
   - other: religion, caste, political_opinion
   - none: if no PII found.

Return JSON only:
{
  "is_pii": boolean,
  "type": "string (one of the above or similar specific type)",
  "confidence": number (0-1)
}`;

        try {
            const completion = await openai.chat.completions.create({
                model: deploymentName,
                response_format: { type: "json_object" },
                messages: [{ role: "user", content: prompt }],
                temperature: 0,
            });

            const content = completion.choices[0]?.message?.content;

            if (!content) return { is_pii: false, type: "none", confidence: 0 };

            const parsed = JSON.parse(content);
            if (parsed.is_pii && parsed.type !== 'none') {
                // Map to DPDP Category and Risk
                const category = getCategoryForType(parsed.type);
                const risk = calculateRisk(category);
                return {
                    is_pii: true,
                    type: parsed.type,
                    category,
                    risk,
                    confidence: parsed.confidence
                };
            }

            return { is_pii: false, type: "none", confidence: 0 };
        } catch (err) {
            console.error("Azure AI failed:", err);
            // Fallback to mock if AI fails
            return this.mockDetect(value, fieldName);
        }
    }

    private mockDetect(value: string, fieldName: string): AIResponse {
        const lowerField = fieldName.toLowerCase();

        if (lowerField.includes("dob")) {
            return { is_pii: true, type: "dob", category: "IDENTITY", risk: "Low", confidence: 0.8 };
        }
        if (lowerField.includes("patient") || lowerField.includes("diagnosis")) {
            return { is_pii: true, type: "medical_record", category: "HEALTH", risk: "High", confidence: 0.85 };
        }
        if (lowerField.includes("child") || lowerField.includes("student")) {
            return { is_pii: true, type: "child_name", category: "CHILDREN", risk: "High", confidence: 0.85 };
        }

        return { is_pii: false, type: "none", confidence: 0 };
    }
}
