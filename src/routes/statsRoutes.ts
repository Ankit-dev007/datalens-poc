import { Router } from 'express';
import { StatsController } from '../controllers/StatsController';

const router = Router();
const controller = new StatsController();

router.get('/summary', controller.getSummary);
router.get('/pii-types', controller.getPiiTypes);
router.get('/source-split', controller.getSourceSplit);
router.get('/top-tables', controller.getTopTables);
router.get('/top-files', controller.getTopFiles);

export default router;
