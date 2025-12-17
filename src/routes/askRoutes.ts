import { Router } from 'express';
import { AskController } from '../controllers/AskController';

const router = Router();
const controller = new AskController();

router.post('/', controller.ask);

export default router;
