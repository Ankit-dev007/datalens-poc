import express from 'express';
import bodyParser from 'body-parser';
import { DBScanner } from './scanner/dbScanner';
import { UnifiedScanner } from './scanner/unifiedScanner';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import cors from 'cors';
import scanRoutes from './routes/fileScanRoute';
import piiRoutes from './routes/piiRoutes';
import statsRoutes from './routes/statsRoutes';
import graphRoutes from './routes/graphRoutes';
import askRoutes from './routes/askRoutes';
import questionnaireRoutes from './routes/questionnaireRoute';
import inventoryRoutes from './routes/inventoryRoute';
import exportRoutes from './routes/exportRoute';
import activityRoutes from './routes/activityRoute';
import dataAssetRoutes from './routes/dataAssetRoute'; // [NEW]
import hierarchyRoutes from './routes/hierarchyRoutes'; // [NEW]

dotenv.config();

const app = express();
app.use(cors());
const PORT = process.env.PORT || 5000;

app.use(bodyParser.json());

// Register API Routes
app.use('/api/scan', scanRoutes);
app.use('/api/pii', piiRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/graph', graphRoutes);
app.use('/api/ask', askRoutes);
app.use('/api/manual', questionnaireRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/data-assets', dataAssetRoutes); // [NEW]
app.use('/api/hierarchy', hierarchyRoutes); // [NEW]
import discoveryRoutes from './routes/discoveryRoutes';
import complianceRoutes from './routes/complianceRoutes'; // [NEW]
import configRoutes from './routes/configRoutes'; // [NEW]
app.use('/api/discovery', discoveryRoutes);
app.use('/api/compliance', complianceRoutes); // [NEW]
app.use('/api/config', configRoutes); // [NEW]

import dataSubjectRoutes from './routes/dataSubjectRoutes'; // [NEW]
app.use('/api/data-subjects', dataSubjectRoutes); // [NEW]

import dsarRoutes from './routes/dsarRoutes'; // [NEW]
app.use('/api/dsar', dsarRoutes); // [NEW]
// app.use('/api/graph', graphRoutes); 


app.post('/db-scan', async (req, res) => {
    try {
        const { dbType, host, port, username, password, database } = req.body;

        if (!dbType || !host || !username || !password || !database) {
            return res.status(400).json({
                error: "Missing required DB details (dbType, host, username, password, database)"
            });
        }
        console.log(`Starting DB scan for: ${dbType}`);
        const scanner = new UnifiedScanner();
        const rawResults = await scanner.scan({
            dbType,
            host,
            port,
            username,
            password,
            database
        });
        const flatResults = rawResults.flatMap(table =>
            table.pii.map(item => ({
                table: table.table,
                field: item.field,
                piiType: item.type,
                category: item.category,
                risk: item.risk,
                source: item.source,
                confidence: item.confidence
            }))
        );
        const pdfBuffer: any = await generateScanPdf({
            dbType,
            database,
            timestamp: new Date().toISOString(),
            totalTables: rawResults.length,
            totalPii: flatResults.length,
            items: flatResults
        });

        const pdfBase64 = pdfBuffer.toString("base64");
        res.json({
            success: true,
            summary: {
                dbType,
                database,
                scannedTables: rawResults.length,
                piiFound: flatResults.length
            },
            results: rawResults,
            fileName: `db_scan_report_${Date.now()}.pdf`,
            pdfBase64: pdfBase64
        });

    } catch (error: any) {
        console.error("DB Scan Error:", error);
        res.status(500).json({
            error: "Scan failed",
            details: error.message
        });
    }
});


app.get('/results', async (req, res) => {
    try {
        const resultsPath = path.join(__dirname, 'storage/results.json');
        const data = await fs.readFile(resultsPath, 'utf-8');
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(500).json({ error: 'Failed to read results' });
    }
});

import { AnalystService } from './services/analystService';
import { generateScanPdf } from './utils/generateScanPdf';
const analystService = new AnalystService();

app.post('/api/analyze', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) {
            res.status(400).json({ error: 'Query is required' });
            return;
        }
        const result = await analystService.analyze(query);
        res.json(result);
    } catch (error: any) {
        console.error('Analysis failed:', error);
        res.status(500).json({ error: 'Analysis failed', details: error.message });
    }
});

app.listen(PORT, (error: any) => {
    if (error) {
        console.error(`Failed to start server: ${error}`);
        return;
    }
    console.log(`Server is running on port ${PORT}`);

    // Start Background Jobs
    const { startAutoLinkJob } = require('./jobs/autoLinkDiscovery.job');
    startAutoLinkJob();
});
