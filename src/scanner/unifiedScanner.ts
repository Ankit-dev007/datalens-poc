import { DBScanner } from './dbScanner';
import { MongoScanner } from './mongoScanner';
import { DatabaseConnector } from './databaseConnector';
import { Neo4jWriter } from './neo4jWriter';
import { ScanRequest, TableResult } from '../types';

export class UnifiedScanner {
    private dbScanner: DBScanner;
    private mongoScanner: MongoScanner;
    private connector: DatabaseConnector;
    private neo4jWriter: Neo4jWriter;

    constructor() {
        this.dbScanner = new DBScanner();
        this.mongoScanner = new MongoScanner();
        this.connector = new DatabaseConnector();
        this.neo4jWriter = new Neo4jWriter();
    }

    async scan(request: ScanRequest): Promise<TableResult[]> {
        let results: TableResult[] = [];
        try {
            console.log(`Starting scan for ${request.dbType} on ${request.host}`);
            const connection = await this.connector.connect(request);
            if (request.dbType === 'mongo') {
                results = await this.mongoScanner.scan(connection as any);
            } else {
                results = await this.dbScanner.scan(connection as any, request.dbType);
            }
            if (results.length > 0) {
                const dbName = request.database || `${request.dbType}_db`;
                await this.neo4jWriter.writeResults(results, dbName);
            }
            return results;
        } catch (error) {
            console.error('Unified Scan failed:', error);
            throw error;
        } finally {
            await this.connector.close();
        }
    }
}
