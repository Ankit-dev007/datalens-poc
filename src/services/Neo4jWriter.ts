import { Driver, Session } from 'neo4j-driver';
import { getNeo4jDriver } from '../config/neo4j';
import { FileScanResult } from '../types';

export class Neo4jWriter {
    private driver: Driver | null;

    constructor() {
        this.driver = getNeo4jDriver();
    }

    async writeFileResults(results: FileScanResult, storageType: string) {
        if (!this.driver) return;

        const session = this.driver.session();
        try {
            await session.executeWrite(async (tx: any) => {
                // 1. Create File Node
                await tx.run(`
                    MERGE (f:File {name: $fileName})
                    SET f.scannedAt = datetime(), f.storage = $storageType
                `, { fileName: results.file, storageType });

                // 2. Link to Storage (simplified)
                await tx.run(`
                    MERGE (s:Storage {type: $storageType})
                    MERGE (f:File {name: $fileName})
                    MERGE (s)-[:CONTAINS_FILE]->(f)
                `, { storageType, fileName: results.file });

                // 3. Create PII Links
                for (const pii of results.pii) {
                    await tx.run(`
                       MERGE (f:File {name: $fileName})
                       MERGE (p:PII {type: $piiType})
                       MERGE (f)-[r:HAS_PII]->(p)
                       SET r.count = $count, r.risk = $risk
                   `, {
                        fileName: results.file,
                        piiType: pii.type,
                        count: pii.count,
                        risk: pii.risk
                    });
                }
            });
        } catch (error) {
            console.error('Neo4j write failed:', error);
        } finally {
            await session.close();
        }
    }
}
