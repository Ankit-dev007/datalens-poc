import express from 'express';
import { ExportService } from '../services/exportService';

const router = express.Router();
const exportService = new ExportService();

router.get('/csv', async (req, res) => {
    try {
        const csv = await exportService.exportActivitiesToCSV();
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=processing_activities.csv');
        res.send(csv);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/pdf', async (req, res) => {
    try {
        const pdfBuffer = await exportService.exportActivitiesToPDF();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=processing_activities.pdf');
        res.send(pdfBuffer);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
