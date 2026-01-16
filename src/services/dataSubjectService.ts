import { pool } from '../config/pg';
import { getNeo4jDriver } from '../config/neo4j';
import { v4 as uuidv4 } from 'uuid';

export interface DataSubject {
    id: string;
    display_name: string;
    email?: string;
    phone?: string;
    is_verified: boolean;
    created_at: Date;
}

export class DataSubjectService {

    /**
     * Create a new Data Subject in Postgres and Neo4j
     */
    async createDataSubject(data: { displayName: string, email?: string, phone?: string }): Promise<DataSubject> {
        const client = await pool.connect();
        const neoDriver = getNeo4jDriver();
        const neoSession = neoDriver?.session();

        try {
            await client.query('BEGIN');

            const id = uuidv4();
            const query = `
                INSERT INTO data_subjects (id, display_name, email, phone)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `;
            const result = await client.query(query, [id, data.displayName, data.email, data.phone]);
            const subject = result.rows[0];

            // Sync to Neo4j
            if (neoSession) {
                await neoSession.run(`
                    MERGE (ds:DataSubject {id: $id})
                    SET ds.displayName = $displayName, ds.createdAt = datetime()
                `, { id: subject.id, displayName: subject.display_name });

                // If email provided, link it immediately
                if (data.email) {
                    await this.linkIdentifierInGraph(neoSession, subject.id, data.email, 'EMAIL');
                }
                // If phone provided, link it
                if (data.phone) {
                    await this.linkIdentifierInGraph(neoSession, subject.id, data.phone, 'PHONE');
                }
            }

            await client.query('COMMIT');
            return subject;

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
            if (neoSession) await neoSession.close();
        }
    }

    /**
     * Get all data subjects
     */
    async getAllSubjects(): Promise<DataSubject[]> {
        const result = await pool.query('SELECT * FROM data_subjects ORDER BY created_at DESC');
        return result.rows;
    }

    /**
     * Get subject by ID with their Graph Lineage
     */
    async getSubjectDetails(id: string) {
        // Get Basic Info
        const pgResult = await pool.query('SELECT * FROM data_subjects WHERE id = $1', [id]);
        if (pgResult.rows.length === 0) throw new Error('Subject not found');
        const subject = pgResult.rows[0];

        // Get Graph Data
        const driver = getNeo4jDriver();
        if (!driver) return { subject, graph: {} };

        const session = driver.session();
        try {
            // Find all identifiers, linked PII types, Assets, and Activities
            const result = await session.run(`
                MATCH (ds:DataSubject {id: $id})<-[:BELONGS_TO]-(idNode:Identifier)
                OPTIONAL MATCH (idNode)-[:INSTANCE_OF]->(p:PII)
                OPTIONAL MATCH (p)<-[:HAS_PII]-(source) // File or Table
                OPTIONAL MATCH (source)-[:PART_OF_DATA_ASSET]->(da:DataAsset)
                OPTIONAL MATCH (da)-[:USED_IN]->(pa:ProcessingActivity)
                RETURN 
                    idNode.value as identifier,
                    p.type as piiType,
                    da.name as assetName,
                    da.id as assetId,
                    pa.name as activityName,
                    pa.activityId as activityId,
                    pa.purpose as purpose,
                    pa.lawfulBasis as lawfulBasis
            `, { id });

            const lineage = result.records.map(r => ({
                identifier: r.get('identifier'),
                piiType: r.get('piiType'),
                assetName: r.get('assetName'),
                assetId: r.get('assetId'),
                activityName: r.get('activityName'),
                activityId: r.get('activityId'),
                purpose: r.get('purpose'),
                lawfulBasis: r.get('lawfulBasis')
            }));

            return { subject, lineage };
        } finally {
            await session.close();
        }
    }

    /**
     * Add a new identifier to an existing subject
     */
    async addIdentifier(subjectId: string, identifierValue: string, piiType: string) {
        const driver = getNeo4jDriver();
        if (!driver) throw new Error("Neo4j not connected");
        const session = driver.session();

        try {
            await this.linkIdentifierInGraph(session, subjectId, identifierValue, piiType);
            return { success: true };
        } finally {
            await session.close();
        }
    }

    /**
     * Helper to link identifier in Graph
     */
    private async linkIdentifierInGraph(session: any, subjectId: string, value: string, piiType: string) {
        // 1. Create Identifier Node linked to Subject
        // 2. Link Identifier to the PII Type node (Schema: Identifier IS_INSTANCE_OF PII Type)
        await session.run(`
            MATCH (ds:DataSubject {id: $subjectId})
            MERGE (id:Identifier {value: $value})
            MERGE (id)-[:BELONGS_TO]->(ds)
            
            // Try to link to generic PII Type node if it exists
            WITH id
            MATCH (p:PII {type: $piiType})
            MERGE (id)-[:INSTANCE_OF]->(p)
        `, { subjectId, value, piiType });
    }
}
