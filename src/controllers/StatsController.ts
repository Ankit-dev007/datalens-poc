import { Request, Response } from 'express';
import { StatsService } from '../services/StatsService';

const statsService = new StatsService();

export class StatsController {
    async getSummary(req: Request, res: Response) {
        try {
            const result = await statsService.getSummary();
            res.json(result);
        } catch (error: any) {
            console.error('getSummary error:', error);
            res.status(500).json({ error: 'Failed to fetch summary' });
        }
    }

    async getPiiTypes(req: Request, res: Response) {
        try {
            const result = await statsService.getPiiTypes();
            res.json(result);
        } catch (error: any) {
            console.error('getPiiTypes error:', error);
            res.status(500).json({ error: 'Failed to fetch PII types' });
        }
    }

    async getSourceSplit(req: Request, res: Response) {
        try {
            const result = await statsService.getSourceSplit();
            res.json(result);
        } catch (error: any) {
            console.error('getSourceSplit error:', error);
            res.status(500).json({ error: 'Failed to fetch source split' });
        }
    }

    async getTopTables(req: Request, res: Response) {
        try {
            const result = await statsService.getTopTables();
            res.json(result);
        } catch (error: any) {
            console.error('getTopTables error:', error);
            res.status(500).json({ error: 'Failed to fetch top tables' });
        }
    }

    async getTopFiles(req: Request, res: Response) {
        try {
            const result = await statsService.getTopFiles();
            res.json(result);
        } catch (error: any) {
            console.error('getTopFiles error:', error);
            res.status(500).json({ error: 'Failed to fetch top files' });
        }
    }
}
