import { getNeo4jDriver } from '../config/neo4j';

export class DiscoveryService {
    async getUnmappedDiscoveries() {
        const driver = getNeo4jDriver();
        if (!driver) throw new Error("Neo4j driver not initialized");
        const session = driver.session();

        try {
            const result = await session.executeRead(async tx => {
                return await tx.run(`
                    MATCH (n) 
                    WHERE (n:File OR n:Table) 
                    AND NOT EXISTS { (n)-[:PART_OF_DATA_ASSET]->() }
                    OPTIONAL MATCH (n)-[r:AUTO_LINKED_TO]->(d:DataAsset)
                    RETURN n.name as name, labels(n) as labels, n.storage as storage, d.name as autoLinkedAsset, d.id as autoLinkedAssetId
                `);
            });

            return result.records.map(record => ({
                name: record.get('name'),
                type: record.get('labels').filter((l: string) => l !== 'File' && l !== 'Table' ? false : true)[0],
                storage: record.get('storage') || 'Unknown',
                autoLinkedAsset: record.get('autoLinkedAsset'),
                autoLinkedAssetId: record.get('autoLinkedAssetId')
            }));
        } finally {
            await session.close();
        }
    }
}
