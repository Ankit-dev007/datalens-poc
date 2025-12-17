import express from 'express';
import { getNeo4jDriver } from '../config/neo4j';
import { Session } from 'neo4j-driver';

const router = express.Router();

interface GraphNode {
    id: string;
    group: string;
    val: number;
    color: string;
}

interface GraphLink {
    source: string;
    target: string;
}

const COLOR_MAP: Record<string, string> = {
    'Table': '#3b82f6',     // Blue
    'Column': '#60a5fa',    // Light Blue
    'PII': '#ef4444',       // Red
    'File': '#ec4899',      // Pink
    'Folder': '#eab308',    // Yellow
    'Storage': '#a855f7',   // Purple
    'Database': '#22c55e',  // Green
    'Unknown': '#9ca3af'    // Gray
};

router.get('/', async (req, res) => {
    const driver = getNeo4jDriver();
    if (!driver) {
        res.status(500).json({ error: 'Neo4j driver not connected' });
        return;
    }

    const session: Session = driver.session();
    try {
        const result = await session.run(`
            MATCH (n)-[r]->(m)
            RETURN n, r, m
            LIMIT 300
        `);

        const nodesMap = new Map<string, GraphNode>();
        const links: GraphLink[] = [];

        result.records.forEach(record => {
            const sourceNode = record.get('n');
            const targetNode = record.get('m');

            const processNode = (node: any): string => {
                const label = node.labels[0] || 'Unknown';
                const name = node.properties.name || node.properties.type || node.identity.toString();
                const id = `${label}:${name}`;

                if (!nodesMap.has(id)) {
                    nodesMap.set(id, {
                        id,
                        group: label,
                        val: label === 'PII' ? 5 : (label === 'Table' ? 20 : 10), // Simple sizing
                        color: COLOR_MAP[label] || COLOR_MAP['Unknown']
                    });
                }
                return id;
            };

            const sourceId = processNode(sourceNode);
            const targetId = processNode(targetNode);

            links.push({
                source: sourceId,
                target: targetId
            });
        });

        const nodes = Array.from(nodesMap.values());
        res.json({ nodes, links });

    } catch (error: any) {
        console.error('Graph fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch graph data', details: error.message });
    } finally {
        await session.close();
    }
});

export default router;
