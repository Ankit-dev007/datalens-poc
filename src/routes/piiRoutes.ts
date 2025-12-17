import express from 'express';
import { getNeo4jDriver } from '../config/neo4j';

const router = express.Router();

// GET /pii/files?type=pan
router.get('/files', async (req, res) => {
    const piiType = req.query.type as string; // Explicitly cast to string

    if (!piiType) {
        res.status(400).json({ error: 'Query param "type" is required' });
        return;
    }

    const driver = getNeo4jDriver();
    if (!driver) {
        res.status(500).json({ error: 'DB Connection Error' });
        return;
    }

    const session = driver.session();
    try {
        const result = await session.run(
            `
            MATCH (f:File)-[:IS_PII]->(p:PII {type: $type})
            OPTIONAL MATCH (f)-[:STORED_IN]->(s:Storage)
            RETURN f.name as fileName, f.path as path, s.type as storage
            `,
            { type: piiType }
        );

        const files = result.records.map(r => ({
            fileName: r.get('fileName'),
            path: r.get('path'),
            storage: r.get('storage')
        }));

        res.json({
            piiType,
            files
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    } finally {
        await session.close();
    }
});

// GET /pii/summary
router.get('/summary', async (req, res) => {
    const driver = getNeo4jDriver();
    if (!driver) {
        res.status(500).json({ error: 'DB Connection Error' });
        return;
    }

    const session = driver.session();
    try {
        const result = await session.run(
            `
            MATCH (p:PII)<-[:IS_PII]-(f:File)
            RETURN p.type as type, count(f) as count
            ORDER BY count DESC
            `
        );

        const summary = result.records.map(r => ({
            type: r.get('type'),
            // Neo4j integers need to be handled carefully if large, but count is usually okay
            count: r.get('count').toNumber()
        }));

        res.json({ summary });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    } finally {
        await session.close();
    }
});

export default router;
