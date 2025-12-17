export type ActivityStatus = 'Active' | 'Archived' | 'Draft';
export type LawfulBasis = 'Consent' | 'LegitimateUse' | 'Contractual' | 'LegalObligation' | 'VitalInterests' | 'PublicInterest';
export type DPIAStatus = 'NotRequired' | 'Required' | 'Completed';

export interface ProcessingActivity {
    activityId: string;
    name: string;
    businessProcess: string;
    ownerUserId: string;
    status: ActivityStatus;
    purpose: string;
    permittedPurpose: LawfulBasis; // mapped to DPDP Lawful Basis
    personalDataTypes: string[]; // List of DPDP Categories
    retentionPeriod: string; // e.g. "2 Years", "Permanent"

    // Optional / Computed
    dpiaStatus?: DPIAStatus;
    dpiaReferenceId?: string;
    riskScore?: number;
    sensitivity?: 'Public' | 'Internal' | 'Sensitive' | 'Critical';
    createdAt?: Date;
    updatedAt?: Date;
}
