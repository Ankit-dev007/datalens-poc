import { getNeo4jDriver } from '../config/neo4j';
import { Session } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import { DataAsset } from '../types/dataAsset';

export class DataAssetService {

    // Create Data Asset and Link to Activity
    async createDataAsset(asset: Partial<DataAsset>): Promise<DataAsset> {
        const driver = getNeo4jDriver();
        if (!driver) throw new Error("Neo4j driver not available");

        const session: Session = driver.session();
        const assetId = asset.id || uuidv4();
        const createdAt = new Date().toISOString();

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
                        createdAt
                    },
                    activityId: asset.processingActivityId,
                    ownerId: asset.ownerUserId
                }
            );

            return {
                ...asset,
                id: assetId,
                createdAt
            } as DataAsset;

        } finally {
            await session.close();
        }
    }

    // Get All Data Assets
    async listDataAssets(): Promise<DataAsset[]> {
        const driver = getNeo4jDriver();
        if (!driver) return [];
        const session = driver.session();

        try {
            const result = await session.run(
                `MATCH (d:DataAsset) RETURN d`
            );
            return result.records.map(r => r.get('d').properties as DataAsset);
        } finally {
            await session.close();
        }
    }

    // Get Data Assets for a specific Activity
    async getDataAssetsByActivity(activityId: string): Promise<DataAsset[]> {
        const driver = getNeo4jDriver();
        if (!driver) return [];
        const session = driver.session();

        try {
            const result = await session.run(
                `
                MATCH (d:DataAsset)-[:USED_IN]->(a:ProcessingActivity {activityId: $activityId})
                RETURN d
                `,
                { activityId }
            );
            return result.records.map(r => r.get('d').properties as DataAsset);
        } finally {
            await session.close();
        }
    }
}
