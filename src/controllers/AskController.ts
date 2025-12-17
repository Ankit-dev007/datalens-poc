import { Request, Response } from 'express';
import { AskService } from '../services/AskService';

const askService = new AskService();

export class AskController {
    async ask(req: Request, res: Response) {
        try {
            const { query } = req.body;
            if (!query) {
                return res.status(400).json({ error: 'Query is required' });
            }
            const result = await askService.askQuestion(query);
            res.json(result);
        } catch (error: any) {
            console.error('ask error:', error);
            res.status(500).json({ error: 'Failed to process question' });
        }
    }
}
