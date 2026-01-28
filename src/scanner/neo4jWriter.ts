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
                        // Always delete old IS_PII relationship to avoid stale data
                        await tx.run(
                            `
                            MATCH (c:Column {name: $column, table: $table})-[r:IS_PII]->()
                            DELETE r
                            `,
                            { table: tableResult.table, column: pii.field }
                        );

                        // ✅ CHECK STATUS
                        if (pii.status === 'needs_confirmation') {
                            // Store as Pending Confirmation
                            await tx.run(
                                `
                                MATCH (c:Column {name: $column, table: $table})
                                MERGE (cr:ConfirmationRequest {column: $column, table: $table})
                                 SET cr.suggestedType = $piiType,
                                    cr.confidence = $confidence,
                                    cr.reason = $reason,
                                    cr.status = 'pending_user_confirmation',
                                    cr.createdAt = datetime()
                                MERGE (cr)-[:FOR_COLUMN]->(c)
                                `,
                                {
                                    table: tableResult.table,
                                    column: pii.field,
                                    piiType: pii.type,
                                    confidence: pii.confidence,
                                    reason: pii.reason || 'Low confidence detection'
                                }
                            );
                            console.log(`⚠️ Confirmation required for ${tableResult.table}.${pii.field} (${pii.confidence})`);

                        } else {
                            // ✅ 4. COLUMN → PII WITH METADATA (Confirmed or Auto-Classified)
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
                                  r.status = $status,
                                  r.reason = $reason,
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
                                    source: pii.source ?? 'unknown',
                                    status: pii.status || 'auto_classified',
                                    reason: pii.reason || 'AI classification'
                                }
                            );

                            // Also cleanup any pending confirmation if it exists (since now it is decided)
                            await tx.run(
                                `
                                MATCH (c:Column {name: $column, table: $table})<-[:FOR_COLUMN]-(cr:ConfirmationRequest)
                                DETACH DELETE cr
                                `,
                                { table: tableResult.table, column: pii.field }
                            );
                        }
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
