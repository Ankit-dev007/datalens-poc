import { ProcessingActivity } from '../types/processingActivity';
import { getNeo4jDriver } from '../config/neo4j';
import { query } from '../config/pg';
import { Session } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';

export class ActivityService {

    // Create or Update Activity
    async saveActivity(activity: Partial<ProcessingActivity> & { activityTemplateId?: number }): Promise<ProcessingActivity> {
        // Validation for Active status
        if (activity.status === 'Active') {
            const requiredFields: (keyof ProcessingActivity)[] = ['name', 'businessProcess', 'ownerUserId', 'purpose', 'permittedPurpose', 'retentionPeriod'];
            const missing = requiredFields.filter(field => !activity[field] || (Array.isArray(activity[field]) && (activity[field] as any[]).length === 0));
            if (missing.length > 0) {
                throw new Error(`Cannot mark Active. Missing fields: ${missing.join(', ')}`);
            }
        }

        const activityId = activity.activityId || uuidv4();

        // 1. Save to PostgreSQL (Single Source of Truth)
        await query(
            `INSERT INTO processing_activities (
                activity_id, name, business_process, owner_user_id, status, purpose,
                permitted_purpose, personal_data_types, retention_period, dpia_status,
                dpia_reference_id, risk_score, sensitivity, activity_template_id, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
            ON CONFLICT (activity_id) DO UPDATE SET
                name = EXCLUDED.name,
                business_process = EXCLUDED.business_process,
                owner_user_id = EXCLUDED.owner_user_id,
                status = EXCLUDED.status,
                purpose = EXCLUDED.purpose,
                permitted_purpose = EXCLUDED.permitted_purpose,
                personal_data_types = EXCLUDED.personal_data_types,
                retention_period = EXCLUDED.retention_period,
                dpia_status = EXCLUDED.dpia_status,
                dpia_reference_id = EXCLUDED.dpia_reference_id,
                risk_score = EXCLUDED.risk_score,
                sensitivity = EXCLUDED.sensitivity,
                activity_template_id = EXCLUDED.activity_template_id,
                updated_at = NOW()`,
            [
                activityId, activity.name, activity.businessProcess, activity.ownerUserId,
                activity.status || 'Draft', activity.purpose, activity.permittedPurpose,
                activity.personalDataTypes || [], activity.retentionPeriod,
                activity.dpiaStatus || 'NotRequired', activity.dpiaReferenceId || null,
                activity.riskScore || 0, activity.sensitivity || 'Internal',
                activity.activityTemplateId || null
            ]
        );

        // 2. Mirror to Neo4j (Read-only Mirror)
        await this.syncToNeo4j(activityId, activity);

        return { ...activity, activityId } as ProcessingActivity;
    }

    private async syncToNeo4j(activityId: string, activity: any) {
        const driver = getNeo4jDriver();
        if (!driver) return;
        const session = driver.session();
        try {
                await session.run(`
                MERGE (a:ProcessingActivity {activityId: $activityId})
                SET a += $props, a.updatedAt = datetime()
                
                // Link Owner
                WITH a
                MERGE (u:User {userId: $ownerId})
                MERGE (a)-[:OWNED_BY]->(u)
                
                // Link Business Process (Implicit Node for backward compat, or hierarchy if template used)
                MERGE (bp:BusinessProcess {name: $processName})
                MERGE (a)-[:PART_OF]->(bp)
                
                // Link Categories
                WITH a
                UNWIND $categories AS cat
                MERGE (c:Category {name: cat})
                MERGE (a)-[:USES_DATA_TYPE]->(c)

                // [NEW] Link to Activity Template if exists
                WITH a
                CALL {
                    WITH a
                    WITH a WHERE $templateId IS NOT NULL
                    MERGE (at:ActivityTemplate {id: $templateId})
                    MERGE (at)-[:INSTANCE_OF]->(a)
                }
                `, {
                    activityId,
                    props: {
                        name: activity.name,
                        businessProcess: activity.businessProcess,
                        ownerUserId: activity.ownerUserId,
                        status: activity.status || 'Draft',
                        purpose: activity.purpose,
                        permittedPurpose: activity.permittedPurpose, // [FIX] Sync Lawful Basis
                        lawfulBasis: activity.permittedPurpose, // [FIX] Alias for ComplianceService compatibility
                        retentionPeriod: activity.retentionPeriod,
                        riskScore: activity.riskScore || 0,
                        sensitivity: activity.sensitivity || 'Internal'
                    },
                    ownerId: activity.ownerUserId,
                    processName: activity.businessProcess,
                    categories: activity.personalDataTypes || [],
                    templateId: activity.activityTemplateId || null
                });
            } catch (e) {
                console.error("Neo4j Sync Failed:", e);
            } finally {
                await session.close();
            }
        }

    async getActivity(activityId: string): Promise < ProcessingActivity | null > {
            // Read from Postgres
            const res = await query('SELECT * FROM processing_activities WHERE activity_id = $1', [activityId]);
            if(res.rows.length === 0) return null;
            return this.mapRowToActivity(res.rows[0]);
        }

    async listActivities(): Promise < ProcessingActivity[] > {
            // Read from Postgres
            const res = await query('SELECT * FROM processing_activities ORDER BY created_at DESC');
            return res.rows.map(this.mapRowToActivity);
        }

    private mapRowToActivity(row: any): ProcessingActivity {
        return {
            activityId: row.activity_id,
            name: row.name,
            businessProcess: row.business_process,
            ownerUserId: row.owner_user_id,
            status: row.status,
            purpose: row.purpose,
            permittedPurpose: row.permitted_purpose,
            personalDataTypes: row.personal_data_types || [],
            retentionPeriod: row.retention_period,
            dpiaStatus: row.dpia_status,
            dpiaReferenceId: row.dpia_reference_id,
            riskScore: row.risk_score,
            sensitivity: row.sensitivity,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}
