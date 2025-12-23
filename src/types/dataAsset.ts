export interface DataAsset {
    id: string;
    name: string;
    description?: string;
    dataType?: string; // e.g. PDF, Excel, Physical
    dpdpCategory: string; // e.g. FINANCIAL, HEALTH
    personalDataCategories?: string[]; // [NEW] e.g. ["Name", "Email"]
    volume?: number;
    protectionMethod?: 'Cleartext' | 'Encrypted' | 'Masked' | 'PhysicalLock';
    ownerUserId: string;
    processingActivityId: string; // ID of the linked activity
    createdAt: string;
}
