
export class DsarComplianceService {

    /**
     * Validate a DSAR request against collected data.
     * Returns a status report with Red/Amber/Green flags.
     */
    validateRequest(requestType: string, collectedData: any) {
        const issues: any[] = [];
        let canProceed = true;

        const { assets } = collectedData;

        // Rule 1: Empty Collection
        if (assets.length === 0) {
            issues.push({
                severity: 'INFO',
                message: 'No linked data found for this subject. Nothing to process.'
            });
        }

        // Rule 2: Lawful Basis Check (Critical for Erasure)
        for (const asset of assets) {
            for (const activity of asset.processingActivities) {
                if (!activity.lawfulBasis) {
                    issues.push({
                        severity: 'WARNING',
                        message: `Asset '${asset.name}' processed by '${activity.name}' has NO Lawful Basis defined. Risk of illegal processing.`
                    });
                }

                // If Erasure Request
                if (requestType === 'ERASURE') {
                    // Cannot erase if 'Legal Obligation' or 'Public Interest'
                    const blockingBases = ['Legal Obligation', 'Public Interest', 'Vital Interests'];
                    if (blockingBases.includes(activity.lawfulBasis)) {
                        issues.push({
                            severity: 'BLOCKER',
                            message: `Cannot erase data in Asset '${asset.name}'. Processed under '${activity.lawfulBasis}'.`
                        });
                        canProceed = false;
                    }
                }
            }
        }

        return {
            canProceed,
            issues
        };
    }
}
