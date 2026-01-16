import cron from 'node-cron';
import { getNeo4jDriver } from '../config/neo4j';

/**
 * Auto-Link Discovery Job
 * - ADDITIVE only (never touches manual links)
 * - DPDP-safe
 * - Neo4j syntax safe
 */
export const startAutoLinkJob = () => {
    // Every 2 minutes for demo; change to '0 0 * * *' for daily
    cron.schedule('*/2 * * * *', async () => {
        console.log('[AutoLinkJob] Starting auto-link process...');
        await runAutoLinkLogic();
    });

    console.log('[AutoLinkJob] Auto-link job scheduled.');
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

        /**
         * STEP 1: Find unmapped File / Table nodes
         * IMPORTANT: Use OPTIONAL MATCH (Neo4j-safe)
         */
        const unmappedResult = await session.executeRead(tx =>
            tx.run(`
                MATCH (n)
                WHERE n:File OR n:Table
                OPTIONAL MATCH (n)-[:PART_OF_DATA_ASSET]->(manual)
                OPTIONAL MATCH (n)-[:AUTO_LINKED_TO]->(auto)
                WHERE manual IS NULL AND auto IS NULL
                RETURN elementId(n) AS nodeId, n.name AS name
            `)
        );

        const unmappedItems = unmappedResult.records.map(r => ({
            nodeId: r.get('nodeId'),
            name: r.get('name') as string
        }));

        console.log(`[AutoLinkJob] Found ${unmappedItems.length} unmapped items.`);

        let linkedCount = 0;

        /**
         * STEP 2: Attempt safe auto-linking
         */
        for (const item of unmappedItems) {
            await session.executeWrite(async tx => {
                /**
                 * Strategy: PII-based match (preferred)
                 */
                const piiMatch = await tx.run(
                    `
                    MATCH (n)-[:HAS_PII]->(p:PII)
                    WHERE elementId(n) = $nodeId
                    WITH collect(DISTINCT p.type) AS discoveredPII
                    MATCH (d:DataAsset)
                    WHERE any(pii IN discoveredPII WHERE pii IN d.personalDataCategories)
                    WITH d,
                         size([x IN discoveredPII WHERE x IN d.personalDataCategories]) AS score
                    WHERE score > 0
                    RETURN d.id AS assetId, d.name AS assetName, score
                    ORDER BY score DESC
                    `,
                    { nodeId: item.nodeId }
                );

                /**
                 * Multiple matches → review required (DO NOTHING)
                 */
                if (piiMatch.records.length > 1) {
                    console.log(
                        `[AutoLinkJob] Multiple matches found for '${item.name}'. Flagged for review.`
                    );
                    return;
                }

                /**
                 * No PII match → try name match
                 */
                let assetId: string | null = null;
                let assetName: string | null = null;
                let confidence: 'Medium' | 'High' | null = null;
                let method: 'PIITypeMatch' | 'NameMatch' | null = null;

                if (piiMatch.records.length === 1) {
                    const r = piiMatch.records[0];
                    assetId = r.get('assetId');
                    assetName = r.get('assetName');
                    confidence = r.get('score') >= 2 ? 'High' : 'Medium';
                    method = 'PIITypeMatch';
                } else {
                    const nameMatch = await tx.run(
                        `
                        MATCH (d:DataAsset)
                        WHERE toLower($name) CONTAINS toLower(d.name)
                           OR toLower(d.name) CONTAINS toLower($name)
                        RETURN d.id AS assetId, d.name AS assetName
                        LIMIT 2
                        `,
                        { name: item.name }
                    );

                    if (nameMatch.records.length === 1) {
                        assetId = nameMatch.records[0].get('assetId');
                        assetName = nameMatch.records[0].get('assetName');
                        confidence = 'Medium';
                        method = 'NameMatch';
                    }
                }

                /**
                 * LOW confidence or no match → skip auto-link
                 */
                if (!assetId || !confidence) {
                    return;
                }

                /**
                 * STEP 3: Create AUTO_LINKED_TO (safe & additive)
                 */
                await tx.run(
                    `
                    MATCH (n), (d:DataAsset { id: $assetId })
                    WHERE elementId(n) = $nodeId
                    MERGE (n)-[r:AUTO_LINKED_TO]->(d)
                    SET r.createdAt = datetime(),
                        r.confidence = $confidence,
                        r.method = $method
                    `,
                    {
                        nodeId: item.nodeId,
                        assetId,
                        confidence,
                        method
                    }
                );

                console.log(
                    `[AutoLinkJob] Auto-linked '${item.name}' → '${assetName}' (${confidence}, ${method})`
                );

                linkedCount++;
            });
        }

        console.log(`[AutoLinkJob] Job complete. Auto-linked ${linkedCount} items.`);
    } catch (err) {
        console.error('[AutoLinkJob] Error:', err);
    } finally {
        await session.close();
    }
};
