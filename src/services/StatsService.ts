import { getNeo4jDriver } from '../config/neo4j';

export class StatsService {
    async getSummary() {
        const driver = getNeo4jDriver();
        if (!driver) throw new Error('Neo4j driver not initialized');
        const session = driver.session();

        try {
            const result = await session.run(`
                MATCH ()-[:IS_PII]->(p:PII)
                RETURN p.type AS type
            `);

            const types = result.records.map(record => record.get('type'));
            const totalPii = types.length;

            const highRisk = ['aadhaar', 'pan', 'credit_card'];
            const mediumRisk = ['phone', 'email'];
            // low risk: others (name, address, etc.)

            let high = 0;
            let medium = 0;
            let low = 0;

            types.forEach((t: string) => {
                const type = t.toLowerCase();
                if (highRisk.includes(type)) high++;
                else if (mediumRisk.includes(type)) medium++;
                else low++;
            });

            return {
                totalPii,
                riskDistribution: { high, medium, low }
            };
        } finally {
            await session.close();
        }
    }

    async getPiiTypes() {
        const driver = getNeo4jDriver();
        if (!driver) throw new Error('Neo4j driver not initialized');
        const session = driver.session();

        try {
            const result = await session.run(`
                MATCH ()-[:IS_PII]->(p:PII)
                RETURN p.type AS type, count(*) AS count
            `);

            const labels: string[] = [];
            const data: number[] = [];

            // Fixed colors map for consistent UI
            const colorMap: Record<string, string> = {
                'Email': '#3b82f6',
                'Phone': '#10b981',
                'Aadhaar': '#f59e0b',
                'PAN': '#ef4444',
                'Credit Card': '#8b5cf6'
            };
            const defaultColors = ['#6366f1', '#ec4899', '#14b8a6', '#f97316'];
            const backgroundColor: string[] = [];

            result.records.forEach((record, index) => {
                const type = record.get('type') as string;
                const count = record.get('count').toNumber();
                labels.push(type);
                data.push(count);
                backgroundColor.push(colorMap[type] || defaultColors[index % defaultColors.length]);
            });

            return {
                labels,
                datasets: [{
                    label: 'Count',
                    data,
                    backgroundColor
                }]
            };
        } finally {
            await session.close();
        }
    }

    async getSourceSplit() {
        const driver = getNeo4jDriver();
        if (!driver) throw new Error('Neo4j driver not initialized');
        const session = driver.session();

        try {
            const result = await session.run(`
                MATCH (c:Column)-[:IS_PII]->(p) RETURN "Database" AS src, count(*) AS count
                UNION
                MATCH (f:File)-[:IS_PII]->(p) RETURN "Files" AS src, count(*) AS count
            `);

            // Default to 0 if not found
            let dbCount = 0;
            let fileCount = 0;

            result.records.forEach(record => {
                const src = record.get('src');
                const count = record.get('count').toNumber();
                if (src === 'Database') dbCount = count;
                if (src === 'Files') fileCount = count;
            });

            return {
                labels: ['Database', 'Files'],
                datasets: [{
                    label: 'Count',
                    data: [dbCount, fileCount],
                    backgroundColor: ['#6366f1', '#ec4899']
                }]
            };
        } finally {
            await session.close();
        }
    }

    async getTopTables() {
        const driver = getNeo4jDriver();
        if (!driver) throw new Error('Neo4j driver not initialized');
        const session = driver.session();

        try {
            const result = await session.run(`
                MATCH (t:Table)-[:HAS_COLUMN]->(:Column)-[:IS_PII]->(p)
                RETURN t.name AS table, count(p) AS count
                ORDER BY count DESC LIMIT 10
            `);

            const labels: string[] = [];
            const data: number[] = [];

            result.records.forEach(record => {
                labels.push(record.get('table'));
                data.push(record.get('count').toNumber());
            });

            return {
                labels,
                datasets: [{
                    label: 'PII Count',
                    data,
                    backgroundColor: '#3b82f6'
                }]
            };
        } finally {
            await session.close();
        }
    }

    async getTopFiles() {
        const driver = getNeo4jDriver();
        if (!driver) throw new Error('Neo4j driver not initialized');
        const session = driver.session();

        try {
            const result = await session.run(`
                MATCH (f:File)-[:IS_PII]->(p)
                RETURN f.name AS file, count(p) AS count
                ORDER BY count DESC LIMIT 10
            `);

            const labels: string[] = [];
            const data: number[] = [];

            result.records.forEach(record => {
                labels.push(record.get('file'));
                data.push(record.get('count').toNumber());
            });

            return {
                labels,
                datasets: [{
                    label: 'PII Count',
                    data,
                    backgroundColor: '#ec4899'
                }]
            };
        } finally {
            await session.close();
        }
    }
}
