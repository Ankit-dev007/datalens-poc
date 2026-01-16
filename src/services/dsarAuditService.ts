import { pool } from '../config/pg';
import { v4 as uuidv4 } from 'uuid';

export class DsarAuditService {

    /**
     * Log an action related to a DSAR request
     */
    async logAction(dsarId: string, action: string, details: any = {}) {
        const id = uuidv4();
        const query = `
            INSERT INTO dsar_audit_logs (id, dsar_id, action, details, performed_at)
            VALUES ($1, $2, $3, $4, NOW())
        `;
        try {
            await pool.query(query, [id, dsarId, action, JSON.stringify(details)]);
        } catch (error) {
            console.error(`Failed to audit log for DSAR ${dsarId}:`, error);
            // Non-blocking failure for audit logs? 
            // Better to log to console than crash the request usually, but strict compliance might differ.
        }
    }

    /**
     * Get audit history for a DSAR
     */
    async getAuditLog(dsarId: string) {
        const query = `
            SELECT * FROM dsar_audit_logs 
            WHERE dsar_id = $1 
            ORDER BY performed_at DESC
        `;
        const result = await pool.query(query, [dsarId]);
        return result.rows;
    }
}
