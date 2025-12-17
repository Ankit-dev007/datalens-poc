import express from 'express';
import { ActivityService } from '../services/activityService';

const router = express.Router();
const activityService = new ActivityService();

// List Activities
router.get('/', async (req, res) => {
    try {
        const activities = await activityService.listActivities();
        res.json(activities);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Save (Create/Update) Activity
router.post('/', async (req, res) => {
    try {
        const activity = await activityService.saveActivity(req.body);
        res.json(activity);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Get Single Activity
router.get('/:id', async (req, res) => {
    try {
        const activity = await activityService.getActivity(req.params.id);
        if (!activity) return res.status(404).json({ error: "Activity not found" });
        res.json(activity);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
