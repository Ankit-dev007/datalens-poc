import { PIIDetector } from '../scanner/piiDetector';
import { AIPIIDetector } from '../scanner/aiPIIDetector';
import { PIIResult } from '../types';
import { calculateRisk, getCategoryForType } from '../utils/riskCalculator';

export class PIIPipeline {
    private regexDetector: PIIDetector;
    private aiDetector: AIPIIDetector;

    constructor() {
        this.regexDetector = new PIIDetector();
        this.aiDetector = new AIPIIDetector();
    }

    async detect(text: string): Promise<PIIResult[]> {
        const results: PIIResult[] = [];

        // Helper to add result
        const addResult = (type: string, count: number, confidence: number) => {
            const category = getCategoryForType(type);
            const risk = calculateRisk(category);
            results.push({
                field: 'content',
                type,
                category,
                risk,
                source: 'regex',
                confidence,
                count: count
            } as any);
        };

        // Emails
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const emails = text.match(emailRegex) || [];
        if (emails.length > 0) addResult('email', emails.length, 0.9);

        // Phone (Indian)
        const phoneRegex = /\b[6-9]\d{9}\b/g;
        const phones = text.match(phoneRegex) || [];
        if (phones.length > 0) addResult('phone', phones.length, 0.8);

        // Aadhaar (12 digits)
        const aadhaarRegex = /\b\d{12}\b/g;
        const aadhaars = text.match(aadhaarRegex) || [];
        if (aadhaars.length > 0) addResult('aadhaar', aadhaars.length, 0.85);

        // PAN
        const panRegex = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;
        const pans = text.match(panRegex) || [];
        if (pans.length > 0) addResult('pan', pans.length, 0.95);

        // Bank Account (Simple heuristic: 9-18 digits surrounding by keywords?)
        // Applying strict regex on large text is risky for false positives.
        // We look for 'Account' or 'Bank' keyword within a window? 
        // For POC, simple regex on digits if keywords present.
        if (text.match(/account|bank|ifsc|ac no/i)) {
            const bankRegex = /\b\d{9,18}\b/g;
            const banks = text.match(bankRegex) || [];
            if (banks.length > 0) addResult('bank_account', banks.length, 0.8);
        }

        // Credit Card
        const ccRegex = /\b\d{16}\b/g;
        const ccs = text.match(ccRegex) || [];
        if (ccs.length > 0) addResult('credit_card', ccs.length, 0.9);


        // AI SCANNING (Expanded to cover unstructured soft PII)
        // We always check AI to find other categories like Health, Children etc.
        const sample = text.substring(0, 3000);
        const aiRes = await this.aiDetector.detect(sample, 'document_content');

        if (aiRes.is_pii && aiRes.type !== 'none') {
            // Check if we already found this type via regex to avoid duplicate general types?
            // But AI might find "medical_record" which regex won't.
            const existing = results.find(r => r.type === aiRes.type);
            if (!existing) {
                results.push({
                    field: 'content',
                    type: aiRes.type,
                    category: aiRes.category,
                    risk: aiRes.risk,
                    source: 'ai',
                    confidence: aiRes.confidence,
                    count: 1
                } as any);
            }
        }

        return results;
    }
}
