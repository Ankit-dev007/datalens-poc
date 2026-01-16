import neo4j, { Driver, Session } from 'neo4j-driver';
import dotenv from 'dotenv';
import { TableResult } from '../types';
import { getNeo4jDriver } from '../config/neo4j';

dotenv.config();

export class Neo4jWriter {
    private driver: Driver | null = null;

    constructor() {
        this.driver = getNeo4jDriver();
        if (!this.driver) {
            console.warn('Neo4j driver not available in Neo4jWriter.');
        }
    }

    async writeResults(results: TableResult[], databaseName = 'primary_db') {
        if (!this.driver) {
            console.warn('Neo4j driver not initialized. Skipping graph write.');
            return;
        }

        const session: Session = this.driver.session();
        try {
            await session.executeWrite(async tx => {
                for (const tableResult of results) {
                    // ✅ 1. DATABASE → TABLE
                    await tx.run(
                        `
                        MERGE (d:Database {name: $db})
                        MERGE (t:Table {name: $table})
                        MERGE (d)-[:HAS_TABLE]->(t)
                        `,
                        { db: databaseName, table: tableResult.table }
                    );

                    for (const pii of tableResult.pii) {
                        // ✅ 2. IGNORE type = "none"
                        if (pii.type === 'none') continue;

                        // ✅ 3. TABLE → COLUMN
                        await tx.run(
                            `
                            MERGE (t:Table {name: $table})
                            MERGE (c:Column {name: $column, table: $table})
                            MERGE (t)-[:HAS_COLUMN]->(c)
                            `,
                            {
                                table: tableResult.table,
                                column: pii.field
                            }
                        );

                        // ✅ 3.5 CLEANUP EXISTING PII (Fixes Misclassifications)
                        // Ensure a column has only ONE PII type. Delete old relationships.
                        await tx.run(
                            `
                            MATCH (c:Column {name: $column, table: $table})-[r:IS_PII]->()
                            DELETE r
                            `,
                            { table: tableResult.table, column: pii.field }
                        );

                        // ✅ 4. COLUMN → PII WITH METADATA
                        // Create PII node, Category node, and link them.
                        await tx.run(
                            `
                            MERGE (p:PII {type: $piiType})
                            
                            // Link PII Type to Category
                            MERGE (cat:Category {name: $category})
                            MERGE (p)-[:BELONGS_TO]->(cat)
                            
                            // Link PII Type to Risk
                            SET p.defaultRisk = $risk
                            MERGE (risk:RiskLevel {level: $risk})
                            MERGE (p)-[:HAS_RISK]->(risk)

                            WITH p
                            MATCH (c:Column {name: $column, table: $table})
                            MERGE (c)-[r:IS_PII]->(p)
                            SET 
                              r.confidence = $confidence,
                              r.source = $source,
                              r.risk = $risk, 
                              r.detectedAt = datetime()
                            `,
                            {
                                table: tableResult.table,
                                column: pii.field,
                                piiType: pii.type,
                                category: pii.category || 'OTHER',
                                risk: pii.risk || 'Low',
                                confidence: pii.confidence ?? 0,
                                source: pii.source ?? 'unknown'
                            }
                        );
                    }
                }
            });
            console.log('✅ DPDP Compliance Graph written successfully');

        } catch (error) {
            console.error('❌ Error writing DPDP graph to Neo4j:', error);
        } finally {
            await session.close();
        }
    }

    async close() {
        if (this.driver) {
            await this.driver.close();
        }
    }
}
