import express from 'express';
import { DsarService } from '../services/dsarService';

const router = express.Router();
const service = new DsarService();

// Create Request
router.post('/', async (req, res) => {
    try {
        const { subjectId, type, description, dueDate } = req.body;
        if (!subjectId || !type) {
            return res.status(400).json({ error: 'Subject ID and Request Type are required' });
        }
        const request = await service.createRequest({ subjectId, type, description, dueDate });
        res.json(request);
    } catch (error: any) {
        console.error("Create DSAR Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// List Requests
router.get('/', async (req, res) => {
    try {
        const requests = await service.getRequests(req.query as any);
        res.json(requests);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get Request Details
router.get('/:id', async (req, res) => {
    try {
        const request = await service.getRequestById(req.params.id);
        if (!request) return res.status(404).json({ error: 'Request not found' });
        res.json(request);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Update Status
router.patch('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'Status is required' });
        const request = await service.updateStatus(req.params.id, status);
        res.json(request);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get Guided Checklist & Compliance Status
router.get('/:id/checklist', async (req, res) => {
    try {
        const checklist = await service.generateChecklist(req.params.id);
        res.json(checklist);
    } catch (error: any) {
        console.error("Generate Checklist Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get Audit Logs
router.get('/:id/audit', async (req, res) => {
    try {
        // Lazy load audit service
        const { DsarAuditService } = await import('../services/dsarAuditService');
        const auditService = new DsarAuditService();
        const logs = await auditService.getAuditLog(req.params.id);
        res.json(logs);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get Decision
router.get('/:id/decision', async (req, res) => {
    try {
        const decision = await service.getDecision(req.params.id);
        res.json(decision || { decision: null });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
