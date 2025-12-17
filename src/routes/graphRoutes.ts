import { Router } from 'express';
import { GraphController } from '../controllers/GraphController';

const router = Router();
const controller = new GraphController();

// IMPORTANT: This route corresponds to /graph (if mounted at root) or /api/graph (if mounted at api).
// The user prompt asked for `GET /graph`. I will mount this at `/` in this file, and mount this router at `/graph` in server.ts.
// Wait, if I mount it at `/graph`, then `router.get('/')` inside this router becomes `/graph/` (with trailing slash often optional).
// To be safe and exact, I'll stick to `router.get('/')` here and mount at `/graph`.

router.get('/', controller.getGraph);

export default router;
