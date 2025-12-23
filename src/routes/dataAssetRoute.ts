import express from 'express';
import { DataAssetService } from '../services/dataAssetService';

const router = express.Router();
const dataAssetService = new DataAssetService();

// List All Data Assets
router.get('/', async (req, res) => {
    try {
        const assets = await dataAssetService.listDataAssets();
        res.json(assets);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Create Data Asset
router.post('/', async (req, res) => {
    try {
        const asset = await dataAssetService.createDataAsset(req.body);
        res.json(asset);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Get Data Assets by Activity ID
router.get('/activity/:activityId', async (req, res) => {
    try {
        const assets = await dataAssetService.getDataAssetsByActivity(req.params.activityId);
        res.json(assets);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
