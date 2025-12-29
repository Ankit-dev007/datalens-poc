import { DataAssetService } from '../services/dataAssetService';
import { ComplianceService } from '../services/complianceService';
import { getNeo4jDriver } from '../config/neo4j';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
dotenv.config();

const verify = async () => {
    const driver = getNeo4jDriver();
    if (!driver) {
        console.error("Neo4j driver failed");
        return;
    }
    const session = driver.session();

    try {
        console.log("Starting Verification...");

        // Setup Test Data
        const testFile = `TestFile_${Date.now()}`;
        const testAssetId = `TestAsset_${Date.now()}`;
        const testAssetName = "Test Asset";

        // 1. Create Nodes and AUTO_LINKED_TO relationship
        await session.run(`
            MERGE (f:File {name: $testFile})
            MERGE (d:DataAsset {id: $testAssetId, name: $testAssetName, ownerUserId: 'test'})
            MERGE (f)-[:AUTO_LINKED_TO]->(d)
        `, { testFile, testAssetId, testAssetName });
        console.log("Created test nodes with AUTO_LINKED_TO relationship.");

        // 2. Verify Validation Logic for Auto-Linked Assets
        const complianceService = new ComplianceService();
        const initialChecks = await complianceService.checkAutoLinkedAssets();
        const foundAutoLink = initialChecks.items.find((i: any) => i.entity === testFile);

        if (foundAutoLink) {
            console.log("PASS: Compliance check detected auto-linked item.");
        } else {
            console.error("FAIL: Compliance check missed auto-linked item.", initialChecks);
        }

        // 3. Verify Orphan Assets (Expect the test asset to be an orphan)
        const orphanCheck = await complianceService.checkOrphanAssets();
        const foundOrphan = orphanCheck.items.find((i: any) => i.id === testAssetId);
        if (foundOrphan) {
            console.log("PASS: Compliance check detected orphan asset.");
        } else {
            console.error("FAIL: Compliance check missed orphan asset.");
        }

        // 4. Perform Link Confirmation (Should remove AUTO_LINKED_TO)
        const dataAssetService = new DataAssetService();
        await dataAssetService.linkDiscoveryToAsset(testAssetId, testFile, 'File');
        console.log("Performed manual link confirmation.");

        // 5. Verify Cleanup
        const result = await session.run(`
            MATCH (f:File {name: $testFile})
            OPTIONAL MATCH (f)-[r_auto:AUTO_LINKED_TO]->()
            OPTIONAL MATCH (f)-[r_manual:PART_OF_DATA_ASSET]->(d)
            RETURN r_auto, r_manual, d.id
        `, { testFile });

        const r_auto = result.records[0].get('r_auto');
        const r_manual = result.records[0].get('r_manual');
        const linkedAssetId = result.records[0].get('d.id');

        if (!r_auto && r_manual && linkedAssetId === testAssetId) {
            console.log("PASS: Relationship verification successful. Auto-link removed, Manual link present.");
        } else {
            console.error("FAIL: Relationship verification failed.", { hasAuto: !!r_auto, hasManual: !!r_manual });
        }

        // Cleanup
        await session.run(`
            MATCH (f:File {name: $testFile}) DETACH DELETE f
        `, { testFile });
        await session.run(`
            MATCH (d:DataAsset {id: $testAssetId}) DETACH DELETE d
        `, { testAssetId });
        console.log("Cleanup complete.");

    } catch (e) {
        console.error("Verification Error:", e);
    } finally {
        await session.close();
        await driver.close(); // Close driver to allow process exit
    }
};

verify();
