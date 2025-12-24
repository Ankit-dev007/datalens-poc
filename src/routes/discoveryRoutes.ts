import express from 'express';
import { DiscoveryService } from '../services/discoveryService';

const router = express.Router();
const discoveryService = new DiscoveryService();

router.get('/unmapped', async (req, res) => {
    try {
        const results = await discoveryService.getUnmappedDiscoveries();
        res.json(results);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
