import { LLMFactory } from '../llm/LLMFactory';
import { calculateRisk, getCategoryForType } from '../utils/riskCalculator';

interface PIIResult {
    type: string;
    category?: string;
    risk?: string;
    value_sample: string;
    confidence: number;
    reason: string;
}

interface FileAnalysisResult {
    pii_detected: PIIResult[];
    neo4j_mapping: string[];
    recommendations: string[];
}

import { ConfirmationService } from './confirmationService';

export class FileAnalystService {
    private confirmationService: ConfirmationService;

    constructor() {
        this.confirmationService = new ConfirmationService();
    }

    async analyzeFile(fileName: string, filePath: string, storageType: string, fileText: string): Promise<FileAnalysisResult> {
        const strictPII: PIIResult[] = [];

        // --- STRICT RULE IMPLEMENTATION ---

        // RULE 2 (Prioritize Bank over Aadhaar): Bank Account
        // 10-18 digits AND context (account, bank, ifsc)
        const bankAccountRegex = /\b\d{10,18}\b/g;
        const bankKeywords = ['account', 'bank', 'ifsc', 'ac no', 'acc no'];

        const bankMatches = fileText.match(bankAccountRegex);
        if (bankMatches && bankKeywords.some(kw => fileText.toLowerCase().includes(kw))) {
            [...new Set(bankMatches)].slice(0, 3).forEach(match => {
                strictPII.push({
                    type: 'bank_account',
                    category: getCategoryForType('bank_account'),
                    risk: calculateRisk(getCategoryForType('bank_account')),
                    value_sample: match.replace(/(\d{4})\d+(\d{4})/, '$1****$2'),
                    confidence: 0.99,
                    reason: "Matches 10-18 digits and context keywords (account, bank)"
                });
            });
        }

        // RULE 1: Aadhaar
        // Exactly 12 digits AND context "aadhaar"
        const aadhaarRegex = /\b\d{12}\b/g;
        const aadhaarMatches = fileText.match(aadhaarRegex);
        const hasAadhaarKeyword = fileText.toLowerCase().includes('aadhaar');

        if (aadhaarMatches && hasAadhaarKeyword) {
            [...new Set(aadhaarMatches)].slice(0, 3).forEach(match => {
                strictPII.push({
                    type: 'aadhaar',
                    category: 'GOVERNMENT_ID',
                    risk: 'High',
                    value_sample: match.replace(/^\d{8}/, '********'),
                    confidence: 0.99,
                    reason: "Matches 12 digits and explicit 'aadhaar' keyword"
                });
            });
        }

        // RULE 3: PAN
        const panRegex = /\b[A-Za-z]{5}\d{4}[A-Za-z]{1}\b/g;
        const panMatches = fileText.match(panRegex);
        if (panMatches) {
            [...new Set(panMatches)].slice(0, 3).forEach(match => {
                strictPII.push({
                    type: 'pan',
                    category: 'GOVERNMENT_ID',
                    risk: 'High',
                    value_sample: match.replace(/^.{5}/, '*****'),
                    confidence: 0.99,
                    reason: "Matches strict PAN regex format AAAAA9999A"
                });
            });
        }


        // --- AI PHASE for Soft PII ---
        const aiPrompt = `
You are a DPDP Compliance AI. Analyze this text snippet from file "${fileName}" and find PII.
Text Snippet: "${fileText.substring(0, 3000)}..." (truncated)

STRICT RULES:
1. DO NOT classify Aadhaar, PAN, or Bank Account numbers if they look like simple numbers (regex handles them).
2. FIND these DPDP categories if present:
   - identity: name, username, gender
   - contact: email, phone, address
   - health: medical_record, diagnosis, insurance
   - children: child_name, school, age
   - financial: salary, credit_card
3. Return JSON with type (from list above), value_sample, and confidence.
4. If unsure, return "none".
5. Return format:
{
  "pii": [
    { "type": "string", "value_sample": "string", "confidence": number }
  ]
}
`;
        let aiPII: PIIResult[] = [];
        try {
            const llm = LLMFactory.getProvider();
            if (llm) {
                const response = await llm.chat({
                    model: 'model-ignored',
                    messages: [{ role: "user", content: aiPrompt }], // Changed system to user to be safe with some models
                    response_format: { type: "json_object" },
                    temperature: 0
                });
                const content = response.choices[0]?.message?.content;
                if (content) {
                    const parsed = JSON.parse(content);

                    // Process AI Results
                    if (parsed.pii && Array.isArray(parsed.pii)) {
                        for (const p of parsed.pii) {
                            if (p.type === 'none') continue;

                            const category = getCategoryForType(p.type);
                            const risk = calculateRisk(category);

                            // LOGIC: Deterministic Thresholds
                            // < 0.50 : Discard
                            // >= 0.50 && < 0.80 : Confirmation
                            // >= 0.80 : Auto-Classified

                            if (p.confidence < 0.50) {
                                // Discarded
                                continue;
                            }

                            if (p.confidence >= 0.50 && p.confidence < 0.80) {
                                await this.confirmationService.createRequest({
                                    source_type: 'file',
                                    source_subtype: storageType, // e.g. 'local', 'azure_blob'
                                    file_path: filePath,
                                    file_type: fileName.split('.').pop() || 'unknown',
                                    file_section: 'Text Content', // Could be refined if we had page numbers
                                    suggested_pii_type: p.type,
                                    confidence: p.confidence,
                                    reason: `AI detected ${p.type} in file content (Medium Confidence)`
                                });
                                console.log(`Created confirmation request for file ${fileName} (${p.type})`);
                                // Do NOT add to strictPII/aiPII so it doesn't get written to Graph/Report as confirmed yet.
                                continue;
                            }

                            // High confidence (>= 0.80) -> Add to results
                            aiPII.push({
                                type: p.type,
                                category: category,
                                risk: calculateRisk(category),
                                value_sample: p.value_sample,
                                confidence: p.confidence,
                                reason: "AI detected via context analysis (High Confidence)"
                            });
                        }
                    }
                }
            }
        } catch (e) {
            console.warn("AI detection failed, proceeding with regex only.", e);
        }

        // --- MERGE RESULTS ---
        const allPII = [...strictPII, ...aiPII];

        // --- RECOMMENDATIONS & NEO4J ---
        const recommendations: string[] = [];
        const neo4jQueries: string[] = [];

        // De-duplicate by type for graph to avoid explosion, but keep counts if needed.
        // For graph, we map File -> PII Type.
        const uniquePII = new Map<string, PIIResult>();
        allPII.forEach(p => {
            if (!uniquePII.has(p.type)) {
                uniquePII.set(p.type, p);
            }
        });

        if (uniquePII.has('aadhaar')) {
            recommendations.push("Critical: Aadhaar detected. Apply strict access control and masking.");
        }
        if (uniquePII.has('pan')) {
            recommendations.push("Sensitive: PAN detected. Encrypt at rest.");
        }
        if (uniquePII.has('medical_record') || uniquePII.has('diagnosis')) {
            recommendations.push("Health Data: Strict DPDP processing restrictions apply.");
        }
        if (allPII.some(p => p.category === 'CHILDREN')) {
            recommendations.push("Children's Data: Requires verifiable parental consent.");
        }
        if (allPII.length > 0) {
            recommendations.push("Audit log all access to this file.");
        } else {
            recommendations.push("No PII detected. Periodic generic review recommended.");
        }

        // Generate Neo4j Queries
        // File Node
        neo4jQueries.push(`
MERGE (s:Storage {type: "${storageType}"})
MERGE (f:File {path: "${filePath}"})
SET f.name = "${fileName}", f.scannedAt = datetime()
MERGE (f)-[:STORED_IN]->(s)
`);

        // PII Relationships
        uniquePII.forEach(p => {
            neo4jQueries.push(`
MATCH (f:File {path: "${filePath}"})
MERGE (p:PII {type: "${p.type}"})
MERGE (cat:Category {name: "${p.category}"})
MERGE (p)-[:BELONGS_TO]->(cat)

SET p.defaultRisk = "${p.risk}"
MERGE (risk:RiskLevel {level: "${p.risk}"})
MERGE (p)-[:HAS_RISK]->(risk)

MERGE (f)-[r:IS_PII]->(p)
SET r.sample = "${p.value_sample}"
`);
        });

        return {
            pii_detected: allPII,
            neo4j_mapping: neo4jQueries,
            recommendations: recommendations
        };
    }
}
