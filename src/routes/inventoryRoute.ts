import express from 'express';
import { InventoryImportService } from '../services/inventoryImportService';
import bodyParser from 'body-parser';

const router = express.Router();
const importService = new InventoryImportService();

// Configure body parser for text/csv
router.use(bodyParser.text({ type: 'text/csv', limit: '10mb' }));

router.post('/upload', async (req, res) => {
    try {
        const csvContent = req.body;
        const defaultOwner = req.query.owner as string || 'admin';

        if (!csvContent || typeof csvContent !== 'string') {
            return res.status(400).json({ error: "Invalid CSV content. Send as text/csv body." });
        }

        const count = await importService.importCsv(csvContent, defaultOwner);
        res.json({ success: true, imported: count, message: `Successfully imported ${count} items.` });

    } catch (e: any) {
        console.error("Import Error:", e);
        res.status(500).json({ error: e.message });
    }
});

export default router;
