import { Request, Response } from 'express';
import { GraphService } from '../services/GraphService';

const graphService = new GraphService();

export class GraphController {
    async getGraph(req: Request, res: Response) {
        try {
            const result = await graphService.getGraphData();
            res.json(result);
        } catch (error: any) {
            console.error('getGraph error:', error);
            res.status(500).json({ error: 'Failed to fetch graph data' });
        }
    }
}
