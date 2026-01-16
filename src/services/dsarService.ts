import { pool } from '../config/pg';
import { v4 as uuidv4 } from 'uuid';

export interface DSARRequest {
    id: string;
    data_subject_id: string;
    request_type: 'ACCESS' | 'CORRECTION' | 'ERASURE';
    status: 'OPEN' | 'IN_PROGRESS' | 'REJECTED' | 'COMPLETED';
    description?: string;
    due_date?: Date;
    created_at: Date;
    updated_at: Date;
}

export class DsarService {

    async createRequest(data: { subjectId: string, type: string, description?: string, dueDate?: string }) {
        const id = uuidv4();
        // Default due date: 7 days from now if not provided
        const dueDate = data.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        const query = `
            INSERT INTO dsar_requests (id, data_subject_id, request_type, status, description, due_date)
            VALUES ($1, $2, $3, 'OPEN', $4, $5)
            RETURNING *
        `;
        const result = await pool.query(query, [id, data.subjectId, data.type, data.description || '', dueDate]);
        return result.rows[0];
    }

    async getRequests(filters?: { status?: string, subjectId?: string }) {
        let query = `
            SELECT r.*, s.display_name as subject_name 
            FROM dsar_requests r
            JOIN data_subjects s ON r.data_subject_id = s.id
            WHERE 1=1
        `;
        const params: any[] = [];
        let pIdx = 1;

        if (filters?.status) {
            query += ` AND r.status = $${pIdx++}`;
            params.push(filters.status);
        }
        if (filters?.subjectId) {
            query += ` AND r.data_subject_id = $${pIdx++}`;
            params.push(filters.subjectId);
        }

        query += ` ORDER BY r.due_date ASC`;

        const result = await pool.query(query, params);
        return result.rows;
    }

    async getRequestById(id: string) {
        const query = `
            SELECT r.*, s.display_name as subject_name, s.email as subject_email
            FROM dsar_requests r
            JOIN data_subjects s ON r.data_subject_id = s.id
            WHERE r.id = $1
        `;
        const result = await pool.query(query, [id]);
        return result.rows[0];
    }

    async updateStatus(id: string, status: string) {
        const query = `
            UPDATE dsar_requests 
            SET status = $1, updated_at = NOW()
            WHERE id = $2
            RETURNING *
        `;
        const result = await pool.query(query, [status, id]);

        // Audit Log
        const { DsarAuditService } = await import('./dsarAuditService');
        const auditService = new DsarAuditService();
        await auditService.logAction(id, 'STATUS_CHANGE', { newStatus: status });

        return result.rows[0];
    }

    /**
     * Generate a guided checklist for a Human Operator
     */
    async generateChecklist(dsarId: string) {
        // 1. Get DSAR Details
        const dsar = await this.getRequestById(dsarId);
        if (!dsar) throw new Error("DSAR Request not found");

        // 2. Collect Data
        const { DsarCollectionService } = await import('./dsarCollectionService');
        const collectionService = new DsarCollectionService();
        const collectedData = await collectionService.collectDataForSubject(dsar.data_subject_id);

        // 3. Run Compliance Guardrails
        const { DsarComplianceService } = await import('./dsarComplianceService');
        const complianceService = new DsarComplianceService();
        const complianceStatus = complianceService.validateRequest(dsar.request_type, collectedData);

        // 4. [NEW] Auto-Decision Engine
        const { DsarDecisionService } = await import('./dsarDecisionService');
        const decisionService = new DsarDecisionService();
        const autoDecision = await decisionService.makeDecision(dsarId, dsar.request_type, collectedData);

        // 5. Audit this view
        const { DsarAuditService } = await import('./dsarAuditService');
        const auditService = new DsarAuditService();
        await auditService.logAction(dsarId, 'CHECKLIST_GENERATED', {
            canProceed: complianceStatus.canProceed,
            autoDecision: autoDecision.decision
        });

        return {
            dsarRequest: dsar,
            complianceStatus,
            autoDecision,
            checklist: collectedData
        };
    }
    /**
     * Get the latest automated decision for a DSAR
     */
    async getDecision(id: string) {
        const { DsarDecisionService } = await import('./dsarDecisionService');
        const decisionService = new DsarDecisionService();
        return await decisionService.getDecision(id);
    }
}
