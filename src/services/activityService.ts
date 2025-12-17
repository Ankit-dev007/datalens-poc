import { ProcessingActivity } from '../types/processingActivity';
import { getNeo4jDriver } from '../config/neo4j';
import { Session } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';

export class ActivityService {

    // Create or Update Activity
    async saveActivity(activity: Partial<ProcessingActivity>): Promise<ProcessingActivity> {
        // Validation for Active status
        if (activity.status === 'Active') {
            const requiredFields: (keyof ProcessingActivity)[] = ['name', 'businessProcess', 'ownerUserId', 'purpose', 'permittedPurpose', 'personalDataTypes', 'retentionPeriod'];
            const missing = requiredFields.filter(field => !activity[field] || (Array.isArray(activity[field]) && (activity[field] as any[]).length === 0));
            if (missing.length > 0) {
                throw new Error(`Cannot mark Active. Missing fields: ${missing.join(', ')}`);
            }
        }

        const driver = getNeo4jDriver();
        if (!driver) throw new Error("Neo4j driver not available");

        const session: Session = driver.session();
        const activityId = activity.activityId || uuidv4();

        try {
            await session.run(
                `
                MERGE (a:ProcessingActivity {activityId: $activityId})
                SET a += $props, a.updatedAt = datetime()
                
                // Link Owner
                WITH a
                MERGE (u:User {userId: $ownerId})
                MERGE (a)-[:OWNED_BY]->(u)
                
                // Link Business Process (Implicit Node)
                MERGE (bp:BusinessProcess {name: $processName})
                MERGE (a)-[:PART_OF]->(bp)
                
                // Link Owner to Business Process too? (As per requirement: Owner derived from Process)
                MERGE (bp)-[:OWNED_BY]->(u)
                
                // Link Categories
                WITH a
                UNWIND $categories AS cat
                MERGE (c:Category {name: cat})
                MERGE (a)-[:USES_DATA_TYPE]->(c)
                `,
                {
                    activityId,
                    props: {
                        name: activity.name,
                        businessProcess: activity.businessProcess,
                        ownerUserId: activity.ownerUserId,
                        status: activity.status || 'Draft',
                        purpose: activity.purpose,
                        permittedPurpose: activity.permittedPurpose,
                        retentionPeriod: activity.retentionPeriod,
                        dpiaStatus: activity.dpiaStatus || 'NotRequired',
                        dpiaReferenceId: activity.dpiaReferenceId || '',
                        riskScore: activity.riskScore || 0,
                        sensitivity: activity.sensitivity || 'Internal'
                    },
                    ownerId: activity.ownerUserId,
                    processName: activity.businessProcess,
                    categories: activity.personalDataTypes || []
                }
            );

            return {
                ...activity,
                activityId
            } as ProcessingActivity;

        } finally {
            await session.close();
        }
    }

    async getActivity(activityId: string): Promise<ProcessingActivity | null> {
        const driver = getNeo4jDriver();
        if (!driver) return null;
        const session = driver.session();

        try {
            const result = await session.run(
                `MATCH (a:ProcessingActivity {activityId: $activityId}) RETURN a`,
                { activityId }
            );
            if (result.records.length === 0) return null;
            return result.records[0].get('a').properties as ProcessingActivity;
        } finally {
            await session.close();
        }
    }

    async listActivities(): Promise<ProcessingActivity[]> {
        const driver = getNeo4jDriver();
        if (!driver) return [];
        const session = driver.session();

        try {
            const result = await session.run(
                `MATCH (a:ProcessingActivity) RETURN a`
            );
            return result.records.map(r => r.get('a').properties as ProcessingActivity);
        } finally {
            await session.close();
        }
    }
}
