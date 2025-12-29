import { Router } from 'express';
import { ConfigService } from '../services/ConfigService';

const router = Router();
const configService = new ConfigService();

// --- Sectors ---

router.get('/sectors', async (req, res) => {
    try {
        const sectors = await configService.getSectors();
        res.json(sectors);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch sectors' });
    }
});

router.post('/sectors', async (req, res) => {
    try {
        const { name } = req.body;
        const sector = await configService.createSector(name);
        res.json(sector);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create sector' });
    }
});

router.put('/sectors/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { name } = req.body;
        const sector = await configService.updateSector(id, name);
        res.json(sector);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update sector' });
    }
});

router.delete('/sectors/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await configService.deleteSector(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete sector' });
    }
});

// --- Processes ---

router.get('/processes', async (req, res) => {
    try {
        const processes = await configService.getProcesses();
        res.json(processes);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch processes' });
    }
});

router.post('/processes', async (req, res) => {
    try {
        const { name, sector, description } = req.body;
        const process = await configService.createProcess(name, sector, description);
        res.json(process);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create process' });
    }
});

router.put('/processes/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { name, sector, description, is_active } = req.body;
        const process = await configService.updateProcess(id, name, sector, description, is_active);
        res.json(process);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update process' });
    }
});

router.delete('/processes/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await configService.deleteProcess(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete process' });
    }
});

// --- Sub-Processes ---

router.get('/sub-processes', async (req, res) => {
    try {
        const processId = req.query.processId ? parseInt(req.query.processId as string) : 0;
        if (!processId) {
            return res.status(400).json({ error: 'processId is required' });
        }
        const subProcesses = await configService.getSubProcesses(processId);
        res.json(subProcesses);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch sub-processes' });
    }
});

router.post('/sub-processes', async (req, res) => {
    try {
        const { processId, name, description } = req.body;
        const subProcess = await configService.createSubProcess(processId, name, description);
        res.json(subProcess);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create sub-process' });
    }
});

router.put('/sub-processes/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { name, description, is_active } = req.body;
        const subProcess = await configService.updateSubProcess(id, name, description, is_active);
        res.json(subProcess);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update sub-process' });
    }
});

router.delete('/sub-processes/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await configService.deleteSubProcess(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete sub-process' });
    }
});

// --- Activity Templates ---

router.get('/activity-templates', async (req, res) => {
    try {
        const subProcessId = req.query.subProcessId ? parseInt(req.query.subProcessId as string) : 0;
        if (!subProcessId) {
            return res.status(400).json({ error: 'subProcessId is required' });
        }
        const templates = await configService.getActivityTemplates(subProcessId);
        res.json(templates);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch activity templates' });
    }
});

router.post('/activity-templates', async (req, res) => {
    try {
        const { subProcessId, name, description } = req.body;
        const template = await configService.createActivityTemplate(subProcessId, name, description);
        res.json(template);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create activity template' });
    }
});

router.put('/activity-templates/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { name, description, is_active } = req.body;
        const template = await configService.updateActivityTemplate(id, name, description, is_active);
        res.json(template);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update activity template' });
    }
});

router.delete('/activity-templates/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await configService.deleteActivityTemplate(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete activity template' });
    }
});

export default router;
