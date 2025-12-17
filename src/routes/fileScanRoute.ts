import express from 'express';
import { FileScanner } from '../services/FileScanner';
import { generateFileScanPdf } from '../utils/generateFileScanPdf';

const router = express.Router();

router.post('/files', async (req, res) => {
    try {
        const { storageType, credentials } = req.body;

        if (!storageType || !credentials) {
            return res.status(400).json({
                error: "Missing storageType or credentials"
            });
        }

        const scanner = new FileScanner();
        const scanResults = await scanner.scan({ storageType, credentials });

        // -----------------------------
        // 1️⃣ Flatten for uniform PDF use
        // -----------------------------
        const flat = scanResults.flatMap(file =>
            file.pii.map(p => ({
                file: file.file,
                type: p.type,
                count: p.count,
                risk: p.risk
            }))
        );

        // -----------------------------
        // 2️⃣ Generate PDF
        // -----------------------------
        const pdfBuffer: any = await generateFileScanPdf({
            storageType,
            timestamp: new Date().toISOString(),
            totalFiles: scanResults.length,
            totalPii: flat.length,
            items: flat
        });

        const pdfBase64 = pdfBuffer.toString("base64");

        // -----------------------------
        // 3️⃣ Send Response
        // -----------------------------
        res.json({
            success: true,
            summary: {
                storageType,
                scannedFiles: scanResults.length,
                piiFound: flat.length
            },
            results: scanResults,   // original structure
            fileName: `file_scan_report_${Date.now()}.pdf`,
            pdfBase64: pdfBase64
        });

    } catch (error: any) {
        console.error("❌ File scan error:", error);
        res.status(500).json({
            error: "File scan failed",
            details: error.message
        });
    }
});


export default router;
