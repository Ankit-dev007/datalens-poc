import { getNeo4jDriver } from '../config/neo4j';

export class GraphService {
    async getGraphData() {
        const driver = getNeo4jDriver();
        if (!driver) throw new Error('Neo4j driver not initialized');
        const session = driver.session();

        try {
            const result = await session.run(`
                MATCH (t:Table)-[:HAS_COLUMN]->(c:Column)
                OPTIONAL MATCH (c)-[:IS_PII]->(p:PII)
                OPTIONAL MATCH (f:File)-[:IS_PII]->(p)
                // [NEW] Fetch Data Assets and linked Activities
                OPTIONAL MATCH (da:DataAsset)
                OPTIONAL MATCH (da)-[:USED_IN]->(pa:ProcessingActivity)
                RETURN t, c, p, f, da, pa
            `);

            const nodesMap = new Map<string, any>();
            const links: any[] = [];

            result.records.forEach(record => {
                const t = record.get('t');
                const c = record.get('c');
                const p = record.get('p');
                const f = record.get('f');
                const da = record.get('da');
                const pa = record.get('pa');

                // Process Table
                if (t && !nodesMap.has(t.properties.name)) { // Using name as Unique ID helper for now, but should ideally use a unique ID
                    nodesMap.set(t.properties.name, {
                        id: `Table:${t.properties.name}`,
                        group: 'Table',
                        val: 20,
                        color: '#3b82f6'
                    });
                }
                const tableId = `Table:${t.properties.name}`;

                // Process Column
                if (c) {
                    const colKey = `Col:${t.properties.name}.${c.properties.name}`;
                    if (!nodesMap.has(colKey)) {
                        nodesMap.set(colKey, {
                            id: colKey,
                            group: 'Column',
                            val: 10,
                            color: '#60a5fa'
                        });
                        // Link Table -> Column
                        links.push({ source: tableId, target: colKey });
                    }
                    const colId = colKey;

                    // Process PII
                    if (p) {
                        const piiKey = `PII:${p.properties.type}`;
                        if (!nodesMap.has(piiKey)) {
                            nodesMap.set(piiKey, {
                                id: piiKey,
                                group: 'PII',
                                val: 5,
                                color: '#ef4444'
                            });
                        }
                        // Link Column -> PII
                        links.push({ source: colId, target: piiKey });

                        // Process File (only if linked to PII)
                        if (f) {
                            const fileKey = `File:${f.properties.name}`;
                            if (!nodesMap.has(fileKey)) {
                                nodesMap.set(fileKey, {
                                    id: fileKey,
                                    group: 'File',
                                    val: 15,
                                    color: '#ec4899'
                                });
                            }
                            // Link File -> PII
                            links.push({ source: fileKey, target: piiKey });
                        }
                    }
                }

                // Process Data Asset [NEW]
                if (da) {
                    const daKey = `DataAsset:${da.properties.id}`;
                    if (!nodesMap.has(daKey)) {
                        nodesMap.set(daKey, {
                            id: daKey,
                            group: 'DataAsset',
                            val: 15,
                            color: '#8b5cf6' // Violet
                        });
                    }

                    // Process ProcessingActivity [NEW]
                    if (pa) {
                        const paKey = `Activity:${pa.properties.activityId}`;
                        if (!nodesMap.has(paKey)) {
                            nodesMap.set(paKey, {
                                id: paKey,
                                group: 'ProcessingActivity',
                                val: 25,
                                color: '#10b981' // Green
                            });
                        }
                        // Link Data Asset -> Activity
                        links.push({ source: daKey, target: paKey });
                    }
                }
            });

            // If there are files not connected to PII (unlikely in this query but possible if changed), they won't show.
            // Let's add independent File -> PII links query if needed, but the current query assumes connected structure via PII or Table structure.
            // The logic above handles the provided query structure.

            // Remove duplicates from links
            const uniqueLinks = Array.from(new Set(links.map(l => JSON.stringify(l)))).map(s => JSON.parse(s));

            return {
                nodes: Array.from(nodesMap.values()),
                links: uniqueLinks
            };
        } finally {
            await session.close();
        }
    }

    async linkActivityToTable(activityId: string, tableName: string) {
        const driver = getNeo4jDriver();
        if (!driver) return;
        const session = driver.session();
        try {
            await session.run(
                `
                MATCH (a:ProcessingActivity {activityId: $activityId})
                MATCH (t:Table {name: $tableName})
                MERGE (a)-[:USES]->(t)
                `,
                { activityId, tableName }
            );
        } finally {
            await session.close();
        }
    }

    async linkActivityToFile(activityId: string, filePath: string) {
        const driver = getNeo4jDriver();
        if (!driver) return;
        const session = driver.session();
        try {
            await session.run(
                `
                MATCH (a:ProcessingActivity {activityId: $activityId})
                MATCH (f:File {path: $filePath})
                MERGE (a)-[:USES]->(f)
                `,
                { activityId, filePath }
            );
        } finally {
            await session.close();
        }
    }

    async linkActivityToPII(activityId: string, piiType: string) {
        const driver = getNeo4jDriver();
        if (!driver) return;
        const session = driver.session();
        try {
            await session.run(
                `
                MATCH (a:ProcessingActivity {activityId: $activityId})
                MATCH (p:PII {type: $piiType})
                MERGE (a)-[:USES_DATA_TYPE]->(p)
                `,
                { activityId, piiType }
            );
        } finally {
            await session.close();
        }
    }

    async linkActivityToDPIA(activityId: string, dpiaReference: string, status: string) {
        const driver = getNeo4jDriver();
        if (!driver) return;
        const session = driver.session();
        try {
            await session.run(
                `
                MATCH (a:ProcessingActivity {activityId: $activityId})
                MERGE (dpia:DPIA {referenceId: $dpiaReference})
                SET dpia.status = $status, dpia.updatedAt = datetime()
                MERGE (a)-[:LINKED_TO]->(dpia)
                `,
                { activityId, dpiaReference, status }
            );
        } finally {
            await session.close();
        }
    }

    async updateBusinessProcessOwner(processName: string, newOwnerId: string) {
        const driver = getNeo4jDriver();
        if (!driver) return;
        const session = driver.session();
        try {
            await session.run(
                `
                MATCH (bp:BusinessProcess {name: $processName})
                MERGE (u:User {userId: $newOwnerId})
                
                OPTIONAL MATCH (bp)-[r:OWNED_BY]->()
                DELETE r
                MERGE (bp)-[:OWNED_BY]->(u)

                WITH bp, u
                MATCH (a:ProcessingActivity)-[:PART_OF]->(bp)
                OPTIONAL MATCH (a)-[ra:OWNED_BY]->()
                DELETE ra
                MERGE (a)-[:OWNED_BY]->(u)

                WITH a, u
                MATCH (a)-[:USES]->(d:DataItem)
                OPTIONAL MATCH (d)-[rd:OWNED_BY]->()
                DELETE rd
                MERGE (d)-[:OWNED_BY]->(u)
                `,
                { processName, newOwnerId }
            );
        } finally {
            await session.close();
        }
    }
}
