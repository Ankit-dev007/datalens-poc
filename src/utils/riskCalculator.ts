import { DPDP_PERSONAL_DATA, DPDP_CATEGORY } from '../config/dpdpPersonalData';

export type RiskLevel = 'High' | 'Medium' | 'Low';
export type SensitivityLevel = 'Public' | 'Internal' | 'Sensitive' | 'Critical';
export type ProtectionStatus = 'Encrypted' | 'Cleartext' | 'Masked';

export const RISK_MAPPING: Record<DPDP_CATEGORY, RiskLevel> = {
    GOVERNMENT_ID: 'High',
    FINANCIAL: 'High',
    HEALTH: 'High',
    CHILDREN: 'High',
    CONTACT: 'Medium',
    LOCATION: 'Medium',
    DIGITAL: 'Medium',
    IDENTITY: 'Low',
    EMPLOYEE: 'Low',
    BEHAVIORAL: 'Low'
};

export interface RiskInput {
    category: string;
    volume?: number;
    protection?: ProtectionStatus;
    processCount?: number;
}

export function calculateRisk(input: string | RiskInput): RiskLevel {
    // Backward compatibility for string input
    const category = typeof input === 'string' ? input : input.category;
    let baseRisk: RiskLevel = 'Low';

    if (category in RISK_MAPPING) {
        baseRisk = RISK_MAPPING[category as DPDP_CATEGORY];
    } else {
        // Fallbacks
        const upperCat = category.toUpperCase();
        if (['AADHAAR', 'PAN', 'BANK', 'HEALTH', 'CHILDREN', 'PASSWORD'].some(k => upperCat.includes(k))) baseRisk = 'High';
        else if (['EMAIL', 'PHONE', 'ADDRESS'].some(k => upperCat.includes(k))) baseRisk = 'Medium';
    }

    if (typeof input === 'string') return baseRisk;

    // Advanced Calculation
    let score = 0;
    if (baseRisk === 'High') score += 50;
    if (baseRisk === 'Medium') score += 30;
    if (baseRisk === 'Low') score += 10;

    // Volume Multiplier
    if (input.volume) {
        if (input.volume > 10000) score += 20;
        else if (input.volume > 1000) score += 10;
    }

    // Protection Reducer
    if (input.protection === 'Encrypted' || input.protection === 'Masked') score -= 20;

    // Process Usage
    if (input.processCount && input.processCount > 5) score += 10;

    if (score >= 60) return 'High';
    if (score >= 30) return 'Medium';
    return 'Low';
}

export function calculateSensitivity(risk: RiskLevel, volume: number = 0): SensitivityLevel {
    if (risk === 'High') {
        return volume > 100000 ? 'Critical' : 'Sensitive';
    }
    if (risk === 'Medium') return 'Internal';
    return 'Public'; // Or Internal depending on policy
}

export function getCategoryForType(type: string): string {
    const lowerType = type.toLowerCase();

    // Reverse lookup from the taxonomy
    for (const [category, keywords] of Object.entries(DPDP_PERSONAL_DATA)) {
        if (keywords.some(k => lowerType.includes(k) || k.includes(lowerType))) {
            return category;
        }
    }

    // Default fallbacks
    if (['aadhaar', 'pan'].includes(lowerType)) return 'GOVERNMENT_ID';
    if (['bank', 'credit', 'debit', 'ifsc'].some(k => lowerType.includes(k))) return 'FINANCIAL';
    if (['email', 'phone'].includes(lowerType)) return 'CONTACT';
    if (['address', 'city', 'state', 'pincode'].includes(lowerType)) return 'LOCATION';
    if (['name'].includes(lowerType)) return 'IDENTITY';
    if (['dob', 'birth'].includes(lowerType)) return 'IDENTITY';

    return 'OTHER';
}
