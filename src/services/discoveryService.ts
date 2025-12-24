import { getNeo4jDriver } from '../config/neo4j';

export class DiscoveryService {
    async getUnmappedDiscoveries() {
        const driver = getNeo4jDriver();
        if (!driver) throw new Error("Neo4j driver not initialized");
        const session = driver.session();

        try {
            const result = await session.run(`
                MATCH (n) 
                WHERE (n:File OR n:Table) 
                AND NOT (n)-[:PART_OF_DATA_ASSET]->()
                RETURN n.name as name, labels(n) as labels, n.storage as storage
            `);

            return result.records.map(record => ({
                name: record.get('name'),
                type: record.get('labels').filter((l: string) => l !== 'File' && l !== 'Table' ? false : true)[0], // Simple label extraction
                storage: record.get('storage') || 'Unknown'
            }));
        } finally {
            await session.close();
        }
    }
}
