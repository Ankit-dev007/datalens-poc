import express from 'express';
import { ConfirmationService } from '../services/confirmationService';

const router = express.Router();
const service = new ConfirmationService();

router.get('/pending', async (req, res) => {
    try {
        const items = await service.getPendingConfirmations();
        res.json(items);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/resolve', async (req, res) => {
    try {
        const { id, decision } = req.body;
        if (!id || !['YES', 'NO', 'NOT_SURE'].includes(decision)) {
            return res.status(400).json({ error: "Invalid parameters. Require id and decision (YES|NO|NOT_SURE)" });
        }
        const result = await service.resolveConfirmation(id, decision);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/resolved', async (req, res) => {
    try {
        const items = await service.getResolvedConfirmations();
        res.json(items);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/discarded', async (req, res) => {
    try {
        const items = await service.getDiscardedConfirmations();
        res.json(items);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/override', async (req, res) => {
    try {
        const { id, decision, reason, user } = req.body;
        if (!id || !['YES', 'NO'].includes(decision) || !reason || !user) {
            return res.status(400).json({ error: "Invalid parameters. Require id, decision (YES|NO), reason, user" });
        }
        const result = await service.overrideDecision(id, decision, reason, user);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
