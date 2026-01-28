import { pool } from '../config/pg';
import { getNeo4jDriver } from '../config/neo4j';
import { RuleEngine } from '../scanner/ruleEngine';
import { Session } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';

export class ConfirmationService {
    private ruleEngine: RuleEngine;

    constructor() {
        this.ruleEngine = new RuleEngine();
    }

    // [MODIFIED] Fetch from Postgres (Unified)
    async getPendingConfirmations() {
        try {
            const res = await pool.query(`
                SELECT 
                    id, 
                    source_type,
                    source_subtype,
                    database_name,
                    schema_name,
                    table_name, 
                    column_name, 
                    file_path,
                    file_type,
                    file_section,
                    suggested_pii_type, 
                    confidence, 
                    reason, 
                    status, 
                    created_at 
                FROM confirmation_requests 
                WHERE status = 'PENDING' 
                AND confidence >= 0.50
                ORDER BY confidence DESC
            `);
            return res.rows;
        } catch (error) {
            console.error("Failed to fetch confirmation requests from Postgres:", error);
            throw error;
        }
    }

    // [MODIFIED] Resolve in Postgres -> Update Neo4j Rules (DB Only)
    async resolveConfirmation(id: string, decision: 'YES' | 'NO' | 'NOT_SURE') {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Get Request Details
            const res = await client.query('SELECT * FROM confirmation_requests WHERE id = $1 FOR UPDATE', [id]);
            if (res.rows.length === 0) throw new Error("Confirmation request not found");

            const request = res.rows[0];

            if (decision === 'NOT_SURE') {
                await client.query('ROLLBACK');
                return { success: true, status: 'SKIPPED' };
            }

            const newStatus = decision === 'YES' ? 'CONFIRMED' : 'REJECTED';

            // 2. Update Postgres Status
            await client.query(`
                UPDATE confirmation_requests 
                SET status = $1, resolved_at = NOW(), resolved_by = 'user' 
                WHERE id = $2
            `, [newStatus, id]);

            // 3. Apply Rule (Learned Knowledge) - ONLY for Database scans
            if (request.source_type === 'database') {
                if (decision === 'YES') {
                    await this.ruleEngine.addRule(request.column_name, true, request.suggested_pii_type);
                    // Also update Neo4j Graph to reflect PII status
                    await this.updateNeo4jGraph(request.table_name, request.column_name, request.suggested_pii_type);
                } else {
                    await this.ruleEngine.addRule(request.column_name, false, 'none');
                }
            } else {
                // For Files: We might want to update the specific file node in Neo4j to mark it as confirmed PII?
                // The requirements say: "Neo4j stores ONLY learned rules", but also "UI must show WHERE the data came from".
                // And "Neo4j stores ONLY learned rules" implies we shouldn't clutter it with workflow state.
                // However, if a file scan detected PII and user Confirmed it, the graph should probably show that PII relationship as 'confirmed'.
                // I will add a helper to update the File-PII relationship if needed, but for now I'll respect "Neo4j stores ONLY learned rules" 
                // as "Don't create global rules from files". 
                // Updating the specific edge in Neo4j seems valid for "Data Discovery". 
                // I'll add a simple specific-file update if possible, or skip to stay strictly compliant with "Only DB column confirmations create Neo4j UserRule".
                if (decision === 'YES' && request.file_path) {
                    // update file specific edge? Leaving out to be safe unless needed.
                }
            }

            await client.query('COMMIT');
            return { success: true, decision };

        } catch (error) {
            await client.query('ROLLBACK');
            console.error("Failed to resolve confirmation:", error);
            throw error;
        } finally {
            client.release();
        }
    }

    // [NEW] Fetch Discarded Confirmations (History/Audit)
    async getDiscardedConfirmations() {
        try {
            const res = await pool.query(`
                SELECT 
                    id, 
                    source_type,
                    source_subtype,
                    database_name,
                    schema_name,
                    table_name, 
                    column_name, 
                    file_path,
                    file_type,
                    file_section,
                    suggested_pii_type, 
                    confidence, 
                    reason, 
                    status, 
                    created_at 
                FROM confirmation_requests 
                WHERE status = 'discarded' 
                OR (status = 'PENDING' AND confidence < 0.50) -- Technically these should be cleaned up, but safety check
                ORDER BY created_at DESC
            `);
            return res.rows;
        } catch (error) {
            console.error("Failed to fetch discarded confirmations:", error);
            throw error;
        }
    }

    // [NEW] Fetch Resolved Confirmations (History)
    async getResolvedConfirmations() {
        try {
            const res = await pool.query(`
                SELECT 
                    id, 
                    source_type,
                    source_subtype,
                    database_name,
                    schema_name,
                    table_name, 
                    column_name, 
                    file_path,
                    file_type,
                    file_section,
                    suggested_pii_type, 
                    confidence, 
                    reason, 
                    status, 
                    resolved_at,
                    resolved_by,
                    override_reason
                FROM confirmation_requests 
                WHERE status IN ('CONFIRMED', 'REJECTED') OR status = 'OVERRIDDEN'
                ORDER BY resolved_at DESC
            `);
            return res.rows;
        } catch (error) {
            console.error("Failed to fetch resolved confirmations:", error);
            throw error;
        }
    }

    // [NEW] Emergency Override
    async overrideDecision(id: string, newDecision: 'YES' | 'NO', overrideReason: string, overriddenBy: string) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Fetch Previous Record
            const res = await client.query('SELECT * FROM confirmation_requests WHERE id = $1 FOR UPDATE', [id]);
            if (res.rows.length === 0) throw new Error("Decision not found");
            const prev = res.rows[0];

            if (prev.status === 'PENDING') throw new Error("Cannot override a pending request. Use resolving instead.");

            const newStatus = newDecision === 'YES' ? 'CONFIRMED' : 'REJECTED';
            const newId = uuidv4();

            // 2. Insert NEW Audit Record
            await client.query(`
                INSERT INTO confirmation_requests 
                (id, source_type, source_subtype, database_name, schema_name, table_name, column_name, file_path, file_type, file_section, suggested_pii_type, confidence, reason, status, dataset_id, created_at, resolved_at, resolved_by, override_reason, overridden_by, overridden_at, previous_decision_id)
                VALUES
                ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1.0, $12, $13, $14, NOW(), NOW(), $15, $16, $17, NOW(), $18)
            `, [
                newId,
                prev.source_type,
                prev.source_subtype,
                prev.database_name,
                prev.schema_name,
                prev.table_name,
                prev.column_name,
                prev.file_path,
                prev.file_type,
                prev.file_section,
                prev.suggested_pii_type,
                `Override: ${overrideReason}`,
                newStatus,
                prev.dataset_id,
                overriddenBy, // resolved_by is the overrider
                overrideReason,
                overriddenBy,
                prev.id
            ]);

            // 3. Mark Old Record as Overridden
            await client.query(`UPDATE confirmation_requests SET status = 'OVERRIDDEN' WHERE id = $1`, [id]);

            // 4. Update Neo4j Rule
            if (prev.source_type === 'database') {
                if (newDecision === 'YES') {
                    await this.ruleEngine.addRule(prev.column_name, true, prev.suggested_pii_type);
                    await this.updateNeo4jGraph(prev.table_name, prev.column_name, prev.suggested_pii_type);
                } else {
                    await this.ruleEngine.addRule(prev.column_name, false, 'none');
                    await this.removeNeo4jPiiLink(prev.table_name, prev.column_name);
                }
            }

            await client.query('COMMIT');
            return { success: true };

        } catch (error) {
            await client.query('ROLLBACK');
            console.error("Override failed:", error);
            throw error;
        } finally {
            client.release();
        }
    }

    private async removeNeo4jPiiLink(tableName: string, columnName: string) {
        const driver = getNeo4jDriver();
        if (!driver) return;
        const session = driver.session();
        try {
            await session.run(`
                MATCH (c:Column {name: $columnName, table: $tableName})-[r:IS_PII]->(p:PII)
                DELETE r
            `, { tableName, columnName });
        } catch (e) {
            console.error("Neo4j relationship removal failed:", e);
        } finally {
            await session.close();
        }
    }

    // Helper: Update Neo4j Graph on confirmation
    private async updateNeo4jGraph(tableName: string, columnName: string, piiType: string) {
        const driver = getNeo4jDriver();
        if (!driver) return;
        const session = driver.session();
        try {
            await session.run(`
                MATCH (c:Column {name: $columnName, table: $tableName})
                MERGE (p:PII {type: $piiType})
                MERGE (cat:Category {name: 'OTHER'})
                MERGE (p)-[:BELONGS_TO]->(cat)
                MERGE (c)-[r:IS_PII]->(p)
                SET r.confidence = 1.0, r.status = 'confirmed', r.source = 'user_correction'
            `, { tableName, columnName, piiType });
        } catch (e) {
            console.error("Neo4j update failed:", e);
        } finally {
            await session.close();
        }
    }

    // [NEW] Unified Request Creation
    async createRequest(
        params: {
            source_type: 'database' | 'file',
            source_subtype: string,
            database_name?: string,
            table_name?: string,
            column_name?: string,
            file_path?: string,
            file_type?: string,
            file_section?: string,
            suggested_pii_type: string,
            confidence: number,
            reason: string
        }
    ) {
        // Validation handled by caller or basic checks here
        const client = await pool.connect();
        try {
            // Check for duplicate pending request to avoid spam
            let checkSql = '';
            let checkParams: any[] = [];

            if (params.source_type === 'database') {
                checkSql = `SELECT id FROM confirmation_requests WHERE table_name = $1 AND column_name = $2 AND status = 'PENDING'`;
                checkParams = [params.table_name, params.column_name];
            } else {
                checkSql = `SELECT id FROM confirmation_requests WHERE file_path = $1 AND file_section = $2 AND status = 'PENDING'`;
                checkParams = [params.file_path, params.file_section];
            }

            const existing = await client.query(checkSql, checkParams);
            if (existing.rows.length > 0) return; // Already exists

            await client.query(`
                INSERT INTO confirmation_requests 
                (
                    source_type, source_subtype, 
                    database_name, table_name, column_name, 
                    file_path, file_type, file_section, 
                    suggested_pii_type, confidence, reason, status
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PENDING')
             `, [
                params.source_type, params.source_subtype,
                params.database_name || null, params.table_name || null, params.column_name || null,
                params.file_path || null, params.file_type || null, params.file_section || null,
                params.suggested_pii_type, params.confidence, params.reason
            ]);
        } catch (error) {
            console.error("Failed to create confirmation request:", error);
        } finally {
            client.release();
        }
    }
}
