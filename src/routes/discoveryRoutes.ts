import express from 'express';
import { DiscoveryService } from '../services/discoveryService';
import { runAutoLinkLogic } from '../jobs/autoLinkDiscovery.job';

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

// Manual trigger for auto-linking job
router.post('/trigger-auto-link', async (req, res) => {
    try {
        console.log('[API] Manual auto-link trigger requested');
        await runAutoLinkLogic();
        res.json({ message: 'Auto-linking job completed successfully' });
    } catch (e: any) {
        console.error('[API] Auto-link trigger failed:', e);
        res.status(500).json({ error: e.message });
    }
});

export default router;
