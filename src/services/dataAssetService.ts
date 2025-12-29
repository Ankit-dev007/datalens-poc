import { getNeo4jDriver } from '../config/neo4j';
import { query } from '../config/pg';
import { Session } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import { DataAsset } from '../types/dataAsset';

export class DataAssetService {

    // Create Data Asset and Link to Activity
    // Create Data Asset and Link to Activity
    async createDataAsset(asset: Partial<DataAsset>): Promise<DataAsset> {
        const assetId = asset.id || uuidv4();

        // 1. Save to PostgreSQL
        await query(
            `INSERT INTO data_assets (
                id, name, description, data_type, dpdp_category, volume,
                protection_method, owner_user_id, processing_activity_id, personal_data_categories, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
             ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                data_type = EXCLUDED.data_type,
                dpdp_category = EXCLUDED.dpdp_category,
                volume = EXCLUDED.volume,
                protection_method = EXCLUDED.protection_method,
                owner_user_id = EXCLUDED.owner_user_id,
                processing_activity_id = EXCLUDED.processing_activity_id,
                personal_data_categories = EXCLUDED.personal_data_categories`,
            [
                assetId, asset.name, asset.description || '', asset.dataType || '',
                asset.dpdpCategory, asset.volume || 0, asset.protectionMethod || 'Cleartext',
                asset.ownerUserId, asset.processingActivityId, asset.personalDataCategories || []
            ]
        );

        // 2. Mirror to Neo4j
        await this.syncToNeo4j(assetId, asset);

        return {
            ...asset,
            id: assetId,
            createdAt: new Date().toISOString() // Approximate for return
        } as DataAsset;
    }

    private async syncToNeo4j(assetId: string, asset: any) {
        const driver = getNeo4jDriver();
        if (!driver) return;
        const session = driver.session();

        try {
            await session.run(
                `
                MERGE (d:DataAsset {id: $assetId})
                SET d += $props
                
                // Link to Processing Activity
                WITH d
                MATCH (a:ProcessingActivity {activityId: $activityId})
                MERGE (d)-[:USED_IN]->(a)

                // Link to Owner
                WITH d
                MERGE (u:User {userId: $ownerId})
                MERGE (d)-[:OWNED_BY]->(u)
                `,
                {
                    assetId,
                    props: {
                        name: asset.name,
                        description: asset.description || '',
                        dataType: asset.dataType || '',
                        dpdpCategory: asset.dpdpCategory,
                        volume: asset.volume || 0,
                        protectionMethod: asset.protectionMethod || 'Cleartext',
                        ownerUserId: asset.ownerUserId,
                        processingActivityId: asset.processingActivityId,
                        personalDataCategories: asset.personalDataCategories || []
                    },
                    activityId: asset.processingActivityId,
                    ownerId: asset.ownerUserId
                }
            );
        } catch (e) {
            console.error("Neo4j Sync Failed (DataAsset):", e);
        } finally {
            await session.close();
        }
    }

    // Get All Data Assets
    async listDataAssets(): Promise<DataAsset[]> {
        const res = await query('SELECT * FROM data_assets ORDER BY created_at DESC');
        return res.rows.map(this.mapRowToAsset);
    }

    // Get Data Assets for a specific Activity
    async getDataAssetsByActivity(activityId: string): Promise<DataAsset[]> {
        const res = await query('SELECT * FROM data_assets WHERE processing_activity_id = $1 ORDER BY created_at', [activityId]);
        return res.rows.map(this.mapRowToAsset);
    }

    private mapRowToAsset(row: any): DataAsset {
        return {
            id: row.id,
            name: row.name,
            description: row.description,
            dataType: row.data_type,
            dpdpCategory: row.dpdp_category,
            volume: row.volume,
            protectionMethod: row.protection_method,
            ownerUserId: row.owner_user_id,
            processingActivityId: row.processing_activity_id,
            personalDataCategories: row.personal_data_categories || [],
            createdAt: row.created_at
        };
    }

    // Link Discovered Entity (File/Table) to Data Asset
    async linkDiscoveryToAsset(assetId: string, discoveryName: string, type: 'File' | 'Table'): Promise<void> {
        const driver = getNeo4jDriver();
        if (!driver) return;
        const session = driver.session();

        try {
            await session.run(
                `
                MATCH (d:DataAsset {id: $assetId})
                MATCH (target) WHERE (target:File OR target:Table) AND target.name = $discoveryName
                MERGE (target)-[:PART_OF_DATA_ASSET]->(d)
                
                // [FIX] Remove any potential "AUTO_LINKED_TO" relationship since we now have a manual confirmation
                WITH target
                OPTIONAL MATCH (target)-[r:AUTO_LINKED_TO]->()
                DELETE r
                `,
                { assetId, discoveryName }
            );
            console.log(`Linked ${type} '${discoveryName}' to DataAsset '${assetId}'`);
        } catch (e) {
            console.error("Failed to link discovery to asset:", e);
            throw e;
        } finally {
            await session.close();
        }
    }
}
