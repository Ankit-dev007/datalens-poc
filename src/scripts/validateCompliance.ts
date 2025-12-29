import { getNeo4jDriver } from '../config/neo4j';
import dotenv from 'dotenv';

dotenv.config();

const queries = {
    // 1. Where is Email stored and why? (PII -> Purpose)
    emailLineage: `
        MATCH (p:PII {type: 'EMAIL'})<-[:HAS_PII]-(f:File)
        MATCH (f)-[:PART_OF_DATA_ASSET]->(d:DataAsset)
        MATCH (d)-[:USED_IN]->(a:ProcessingActivity)
        RETURN f.name as File, d.name as Asset, a.purpose as Purpose, a.ownerUserId as Owner
    `,

    // 2. Which processes use Aadhaar?
    aadhaarProcesses: `
        MATCH (p:PII {type: 'AADHAAR'})<-[]-(source)
        MATCH (source)-[:PART_OF_DATA_ASSET]->(d:DataAsset)
        MATCH (d)-[:USED_IN]->(a:ProcessingActivity)
        RETURN DISTINCT a.name as Process, a.businessProcess as BusinessProcess
    `,

    // 3. Unmapped Assets (Governance Gap)
    unmappedAssets: `
        MATCH (source) WHERE (source:File OR source:Table)
        OPTIONAL MATCH (source)-[:PART_OF_DATA_ASSET]->(da)
        OPTIONAL MATCH (source)-[:AUTO_LINKED_TO]->(al)
        WHERE da IS NULL AND al IS NULL
        RETURN source.name as UnmappedEntity, labels(source) as Type
    `,

    // 4. Auto-Linked Assets (Review Needed)
    autoLinkedAssets: `
        MATCH (source)-[r:AUTO_LINKED_TO]->(d:DataAsset)
        RETURN source.name as Entity, d.name as SuggestedAsset, r.confidence as Confidence
    `,

    // 5. PII with no Lawful Basis
    illegalPII: `
        MATCH (p:PII)<-[]-(source)-[:PART_OF_DATA_ASSET]->(d)-[:USED_IN]->(a:ProcessingActivity)
        WHERE a.permittedPurpose IS NULL OR a.permittedPurpose = ''
        RETURN p.type as PII, source.name as Location, a.name as Activity
    `
};

async function runValidation() {
    console.log("Starting DPDP Validation...");
    const driver = getNeo4jDriver();
    if (!driver) {
        console.error("Neo4j Driver not initialized.");
        return;
    }
    const session = driver.session();

    try {
        for (const [name, query] of Object.entries(queries)) {
            console.log(`\n--- Running Check: ${name} ---`);
            const result = await session.run(query);
            if (result.records.length === 0) {
                console.log("No records found (Safe or Empty).");
            } else {
                result.records.forEach(r => {
                    console.log(r.toObject());
                });
            }
        }
    } catch (e) {
        console.error("Validation failed:", e);
    } finally {
        await session.close();
        await driver.close();
    }
}

runValidation();
