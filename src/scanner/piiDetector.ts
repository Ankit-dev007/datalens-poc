import { PIIResult } from '../types';
import { calculateRisk, getCategoryForType } from '../utils/riskCalculator';

export class PIIDetector {

    detect(value: string, fieldName: string): PIIResult | null {
        const lowerField = fieldName.toLowerCase();
        const cleanValue = value.replace(/\s+/g, '');

        let type: string | null = null;
        let confidence = 0;

        // 1. Aadhaar (12 digits) - prioritizing specific column names to reduce false positives
        if (/^\d{12}$/.test(cleanValue)) {
            const isAadhaarCol = ['aadhaar', 'uidai', 'adhaar'].some(k => lowerField.includes(k));
            if (isAadhaarCol) {
                type = 'aadhaar';
                confidence = 0.95;
            }
        }

        // 2. Bank Account (9-18 digits)
        if (!type && /^\d{9,18}$/.test(cleanValue)) {
            const isBankAccountCol = ['account', 'ac_no', 'bank_account', 'acc_no'].some(k => lowerField.includes(k) && !lowerField.includes('id'));
            if (isBankAccountCol) {
                type = 'bank_account';
                confidence = 0.95;
            }
        }

        // 3. PAN (5 letters, 4 digits, 1 letter)
        if (!type && /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value)) {
            type = 'pan';
            confidence = 0.95;
        }

        // 4. Credit/Debit Card (16 digits)
        if (!type && /^\d{16}$/.test(cleanValue)) {
            // Simple check, in prod use Luhn algorithm
            const isCardCol = ['card', 'credit', 'debit', 'cc_no'].some(k => lowerField.includes(k));
            if (isCardCol) {
                type = 'credit_card';
                confidence = 0.95;
            }
        }

        // 5. Phone (10 digits starting with 6-9)
        if (!type && /^[6-9]\d{9}$/.test(cleanValue)) {
            // stricter check for column name to avoid random 10 digit numbers
            if (['phone', 'mobile', 'contact', 'cell'].some(k => lowerField.includes(k))) {
                type = 'phone';
                confidence = 0.9;
            } else {
                // if value looks like phone but column is unknown, lower confidence
                type = 'phone';
                confidence = 0.7;
            }
        }

        // 6. Email
        if (!type && /\S+@\S+\.\S+/.test(value)) {
            type = 'email';
            confidence = 0.9;
        }

        // 7. Address (Keywords)
        if (!type) {
            const addressKeywords = ['road', 'street', 'nagar', 'lane', 'colony', 'apartment', 'marg', 'sector', 'pincode', 'zip'];
            if (addressKeywords.some(keyword => value.toLowerCase().includes(keyword)) || ['address', 'residence', 'location'].some(k => lowerField.includes(k))) {
                // Heuristic: length check to avoid single words being flagged
                if (value.length > 10) {
                    type = 'address';
                    confidence = 0.8;
                }
            }
        }

        // 8. DOB / Date
        if (!type && (lowerField.includes('dob') || lowerField.includes('birth'))) {
            if (/^\d{4}-\d{2}-\d{2}$|^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
                type = 'dob';
                confidence = 0.9;
            }
        }

        // 9. Name (Low confidence regex, relying heavily on column name)
        if (!type && lowerField.includes('name') && !lowerField.includes('file') && !lowerField.includes('prod')) {
            if (/^[a-zA-Z\s\.]+$/.test(value) && value.length > 2) {
                type = 'name';
                confidence = 0.7;
            }
        }

        if (type) {
            const category = getCategoryForType(type);
            const risk = calculateRisk(category);
            return {
                field: fieldName,
                type,
                category,
                risk,
                source: 'regex',
                confidence
            };
        }

        return null;
    }
}
