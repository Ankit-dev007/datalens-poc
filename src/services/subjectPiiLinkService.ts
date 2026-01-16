import { getNeo4jDriver } from '../config/neo4j';

export class SubjectPiiLinkService {

    /**
     * Link a Data Subject to a PII node (represented as :PII:Identifier) with a specific value.
     * This creates the missing (:PII)-[:BELONGS_TO]->(:DataSubject) relationship.
     * 
     * @param dataSubjectId The UUID of the Data Subject
     * @param identifierType The type of PII (e.g., EMAIL, PHONE)
     * @param identifierValue The actual value (e.g., user@example.com)
     */
    async linkPiiToDataSubject(dataSubjectId: string, identifierType: string, identifierValue: string) {
        const driver = getNeo4jDriver();
        if (!driver) throw new Error("Neo4j driver not initialized");
        const session = driver.session();

        try {
            await session.executeWrite(async (tx: any) => {
                // 1. Ensure DataSubject exists
                // 2. Merge PII node with Label :PII AND :Identifier (for backward compatibility and meeting requirement)
                // 3. Create BELONGS_TO relationship
                // 4. Ensure PII instance is linked to PII Type (for Discovery graph connectivity)

                await tx.run(`
                    MATCH (ds:DataSubject {id: $dataSubjectId})
                    
                    // Merge node with both labels to satisfy "Match PII" and existing "Identifier" usage
                    MERGE (p:PII:Identifier {value: $identifierValue})
                    ON CREATE SET p.type = $identifierType, p.created_at = datetime()
                    
                    // Create the requested relationship
                    MERGE (p)-[:BELONGS_TO]->(ds)
                    
                    // Ensure lineage to generic PII Type node (Discovery Graph)
                    WITH p
                    MERGE (t:PII {type: $identifierType})
                    MERGE (p)-[:INSTANCE_OF]->(t)
                `, {
                    dataSubjectId,
                    identifierType,
                    identifierValue
                });
            });

            return { success: true, message: `Linked ${identifierType} '${identifierValue}' to Subject ${dataSubjectId}` };

        } catch (error) {
            console.error("Failed to link PII to Subject:", error);
            throw error;
        } finally {
            await session.close();
        }
    }
}
