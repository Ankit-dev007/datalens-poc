import { Driver, Session } from 'neo4j-driver';
import { getNeo4jDriver } from '../config/neo4j';

export class FileNeo4jWriter {
    private driver: Driver | null = null;

    constructor() {
        this.driver = getNeo4jDriver();
        if (!this.driver) {
            console.warn('Neo4j driver not available in FileNeo4jWriter.');
        }
    }

    async writeCypherQueries(queries: string[]) {
        if (!this.driver) {
            console.warn('Neo4j driver not initialized. Skipping graph write.');
            return;
        }

        const session: Session = this.driver.session();
        const tx = session.beginTransaction();

        try {
            console.log(`Writing ${queries.length} queries to Neo4j...`);
            for (const query of queries) {
                // Queries from FileAnalystService are raw strings.
                // It's safer if they were parameterized, but the service constructs them.
                // We rely on the internal service being safe for now.
                // Ensure we don't have empty queries.
                if (query.trim()) {
                    await tx.run(query);
                }
            }
            await tx.commit();
            console.log('✅ File PII Graph written successfully');
        } catch (error) {
            await tx.rollback();
            console.error('❌ Error writing File PII graph to Neo4j:', error);
        } finally {
            await session.close();
        }
    }

    async close() {
        if (this.driver) {
            // We generally share the driver, so maybe we don't close it here if it's a singleton pattern intended to stay alive?
            // As per instructions: "Do NOT close Neo4j driver per request (singleton only)"
        }
    }
}
