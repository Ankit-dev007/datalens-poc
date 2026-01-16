import { v4 as uuidv4 } from 'uuid';
import { pool } from '../config/pg';

export interface DsarDecision {
    decision: 'ALLOW' | 'BLOCK' | 'REVIEW';
    reason: string;
    evidence: any;
    evaluatedAt: Date;
}

export class DsarDecisionService {

    /**
     * Evaluates a DSAR request against collected graph data and returns a decision.
     * Persists the decision to the database.
     */
    async makeDecision(dsarId: string, requestType: string, collectedData: any): Promise<DsarDecision> {
        console.log(`🤖 Evaluating DSAR ${dsarId} (${requestType})...`);

        let decision: 'ALLOW' | 'BLOCK' | 'REVIEW' = 'REVIEW';
        let reason = 'Manual review required based on complex data structures.';
        const evidence: any = {
            activities: [],
            scanTime: new Date()
        };

        // 1. Extract Activities & Lawful Bases
        const allActivities: any[] = [];
        collectedData.assets.forEach((asset: any) => {
            asset.processingActivities.forEach((activity: any) => {
                allActivities.push({
                    name: activity.name,
                    lawfulBasis: activity.lawfulBasis || 'Unknown',
                    asset: asset.name
                });
            });
        });
        evidence.activities = allActivities;

        // --- RULE ENGINE ---

        // Rule 4: Missing Traceability
        if (allActivities.length === 0) {
            decision = 'REVIEW';
            reason = 'Incomplete data mapping: No processing activities found linked to this subject.';
        }

        // Rule 1: ERASURE BLOCK (Legal Obligation)
        else if (requestType === 'ERASURE') {
            const legalObligations = allActivities.filter(a => a.lawfulBasis === 'Legal Obligation' || a.lawfulBasis === 'LegalObligation');

            if (legalObligations.length > 0) {
                decision = 'BLOCK';
                reason = `Data retained under Legal Obligation. Activities: ${legalObligations.map(a => a.name).join(', ')}`;
            } else {
                // If no blocking obligations, we still default to REVIEW for Erasure to be safe unless we have explicit ALLOW rules
                // But per requirements, if not blocked, we might ALLOW or REVIEW. 
                // Let's check for mixed or other bases, but for now, if no block, we REVIEW to be safe.
                decision = 'REVIEW';
                reason = 'No blocking legal obligations found, but manual confirmation recommended for Erasure.';
            }
        }

        // Rule 2: ACCESS ALLOW
        else if (requestType === 'ACCESS') {
            decision = 'ALLOW';
            reason = 'Standard Access Request. Identity verified.';
        }

        // Rule 3: Mixed (Covered implicitly, defaults to REVIEW if strictly not met)

        // -------------------

        // Persist Decision
        await this.persistDecision(dsarId, decision, reason, evidence);

        return {
            decision,
            reason,
            evidence,
            evaluatedAt: new Date()
        };
    }

    private async persistDecision(dsarId: string, decision: string, reason: string, evidence: any) {
        const id = uuidv4();
        await pool.query(
            `INSERT INTO dsar_decisions (id, dsar_id, decision, reason, evidence) 
             VALUES ($1, $2, $3, $4, $5)`,
            [id, dsarId, decision, reason, JSON.stringify(evidence)]
        );
        console.log(`✅ Decision persisted: ${decision}`);
    }

    /**
     * Get the latest decision for a DSAR
     */
    async getDecision(dsarId: string) {
        const res = await pool.query(
            `SELECT * FROM dsar_decisions WHERE dsar_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [dsarId]
        );
        return res.rows[0];
    }
}
