import cron from 'node-cron';
import { getNeo4jDriver } from '../config/neo4j';

export const startAutoLinkJob = () => {
    cron.schedule('*/2 * * * *', async () => {
        console.log('[AutoLinkJob] Starting daily auto-link process...');
        await runAutoLinkLogic();
    });

    console.log('[AutoLinkJob] Scheduled to run daily at midnight.');
};

export const runAutoLinkLogic = async () => {
    const driver = getNeo4jDriver();
    if (!driver) {
        console.error('[AutoLinkJob] Neo4j driver not ready.');
        return;
    }
    const session = driver.session();

    try {
        console.log('[AutoLinkJob] Scanning for unmapped discoveries...');

        // 1. Find Unmapped Files/Tables
        // Match nodes that are NOT part of a data asset
        const result = await session.executeRead(async tx => {
            return await tx.run(`
                MATCH (n) 
                WHERE (n:File OR n:Table) 
                AND NOT EXISTS { (n)-[:PART_OF_DATA_ASSET]->() }
                AND NOT EXISTS { (n)-[:AUTO_LINKED_TO]->() }
                RETURN n.name as name, labels(n) as labels, elementId(n) as id
            `);
        });

        const unmappedItems = result.records.map(r => ({
            name: r.get('name') as string,
            labels: r.get('labels') as string[],
            id: r.get('id')
        }));

        console.log(`[AutoLinkJob] Found ${unmappedItems.length} unmapped items.`);

        let linkedCount = 0;

        // 2. Try to match each item
        for (const item of unmappedItems) {
            let matchedAssetId: string | null = null;
            let matchedAssetName: string | null = null;
            let confidence: string = 'Low';
            let method: string = 'Unknown';

            // Strategy A: Name Match (Case-insensitive fuzzy contains)
            await session.executeRead(async tx => {
                const nameMatchResult = await tx.run(`
                    MATCH (d:DataAsset)
                    WHERE toLower($fileName) CONTAINS toLower(d.name)
                       OR toLower(d.name) CONTAINS toLower($fileName)
                    RETURN d.id as assetId, d.name as assetName
                    LIMIT 1
                `, { fileName: item.name });

                if (nameMatchResult.records.length > 0) {
                    const asset = nameMatchResult.records[0];
                    matchedAssetId = asset.get('assetId');
                    matchedAssetName = asset.get('assetName');
                    confidence = 'Medium';
                    method = 'NameMatch';
                }
            });

            // Strategy B: PII Type Match (Higher confidence)
            // Check if discovered PII types overlap with asset's personal_data_categories
            await session.executeRead(async tx => {
                const piiMatchResult = await tx.run(`
                    MATCH (n)-[:HAS_PII]->(p:PII)
                    WHERE elementId(n) = $nodeId
                    WITH collect(DISTINCT p.type) as discoveredPII
                    MATCH (d:DataAsset)
                    WHERE any(pii IN discoveredPII WHERE pii IN d.personalDataCategories)
                    WITH d, discoveredPII, 
                         size([x IN discoveredPII WHERE x IN d.personalDataCategories]) as matchScore
                    RETURN d.id as assetId, d.name as assetName, matchScore
                    ORDER BY matchScore DESC
                    LIMIT 1
                `, { nodeId: item.id });

                if (piiMatchResult.records.length > 0) {
                    const piiAsset = piiMatchResult.records[0];
                    const piiMatchScore = piiAsset.get('matchScore');

                    // If PII match exists and has good score, prefer it over name match
                    if (piiMatchScore > 0) {
                        matchedAssetId = piiAsset.get('assetId');
                        matchedAssetName = piiAsset.get('assetName');
                        confidence = piiMatchScore >= 2 ? 'High' : 'Medium';
                        method = 'PIITypeMatch';
                    }
                }
            });

            // If we found a match, create AUTO_LINKED_TO relationship
            if (matchedAssetId && matchedAssetName) {
                await session.executeWrite(async tx => {
                    await tx.run(`
                        MATCH (n), (d:DataAsset {id: $assetId})
                        WHERE elementId(n) = $nodeId
                        MERGE (n)-[r:AUTO_LINKED_TO]->(d)
                        SET r.createdAt = datetime(), r.confidence = $confidence, r.method = $method
                    `, { nodeId: item.id, assetId: matchedAssetId, confidence, method });
                });

                console.log(`[AutoLinkJob] Auto-linked '${item.name}' -> Asset '${matchedAssetName}' (${confidence} confidence, ${method})`);
                linkedCount++;
            }
        }

        console.log(`[AutoLinkJob] Job complete. Auto-linked ${linkedCount} items.`);

    } catch (error) {
        console.error('[AutoLinkJob] Error:', error);
    } finally {
        await session.close();
    }
};
