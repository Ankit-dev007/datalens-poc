import express from 'express';
import { FileScanner } from '../scanner/fileScanner';

const router = express.Router();
const fileScanner = new FileScanner();

router.post('/files', async (req, res) => {
    try {
        const { source, folderPath, container, blobFolderPath } = req.body;
        const scanId = `scan_${Date.now()}`;

        if (source === 'local') {
            if (!folderPath) {
                res.status(400).json({ error: 'folderPath is required for local source' });
                return;
            }
            // Async execution
            fileScanner.scanLocalFolder(folderPath, scanId);
        } else if (source === 'azure_blob') {
            if (!container) {
                res.status(400).json({ error: 'container name is required for azure_blob source' });
                return;
            }
            // Async execution
            fileScanner.scanAzureBlob(container, blobFolderPath, scanId);
        } else {
            res.status(400).json({ error: 'Invalid source. Use "local" or "azure_blob"' });
            return;
        }

        res.json({
            status: 'scan_started',
            scanId: scanId
        });
    } catch (error: any) {
        console.error('Scan trigger failed:', error);
        res.status(500).json({ error: 'Failed to start scan', details: error.message });
    }
});

export default router;
