import express from 'express';
import { HierarchyService } from '../services/HierarchyService';

const router = express.Router();
const hierarchyService = new HierarchyService();

router.get('/sectors', async (req, res) => {
    try {
        const data = await hierarchyService.getSectors();
        res.json(data);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/processes', async (req, res) => {
    try {
        const sectorId = parseInt(req.query.sectorId as string);
        if (!sectorId) return res.status(400).json({ error: 'sectorId is required' });
        const data = await hierarchyService.getProcesses(sectorId);
        res.json(data);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/sub-processes', async (req, res) => {
    try {
        const processId = parseInt(req.query.processId as string);
        if (!processId) return res.status(400).json({ error: 'processId is required' });
        const data = await hierarchyService.getSubProcesses(processId);
        res.json(data);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/activity-templates', async (req, res) => {
    try {
        const subProcessId = parseInt(req.query.subProcessId as string);
        if (!subProcessId) return res.status(400).json({ error: 'subProcessId is required' });
        const data = await hierarchyService.getActivityTemplates(subProcessId);
        res.json(data);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
