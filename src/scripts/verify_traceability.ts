
import { getNeo4jDriver } from '../config/neo4j';
import { ActivityService } from '../services/activityService';
import { DataAssetService } from '../services/dataAssetService';
import { ComplianceService } from '../services/complianceService';

const activityService = new ActivityService();
const dataAssetService = new DataAssetService();
const complianceService = new ComplianceService();

async function runVerification() {
    console.log("==================================================");
    console.log("PHASE 1: INSERT DUMMY DISCOVERY DATA (NEO4J)");
    console.log("==================================================");

    const driver = getNeo4jDriver();
    if (!driver) throw new Error("Neo4j Driver Missing");
    const session = driver.session();

    try {
        // 0. CLEANUP (Idempotency)
        const fileName = 'bank_customer_details_test.pdf';
        await session.run(`MATCH (f:File {name: $fileName}) DETACH DELETE f`, { fileName });
        console.log("🧹 Cleaned up previous test files.");

        // 1. Create File and PII
        await session.run(`
            MERGE (f:File {name: $fileName})
            SET f.storage = 'Local', f.path = '/tmp/' + $fileName
            
            FOREACH (type IN ['EMAIL', 'PHONE', 'AADHAAR', 'PAN', 'BANK_ACCOUNT'] | 
                MERGE (p:PII {type: type})
                MERGE (f)-[:HAS_PII]->(p)
            )
        `, { fileName });
        console.log(`✅ Created Dummy File: ${fileName} with PII`);

        console.log("\n==================================================");
        console.log("PHASE 2: CREATE GOVERNANCE DATA (POSTGRES + NEO4J)");
        console.log("==================================================");

        // 2. Create Activity
        // Note: Using Service to ensure PG -> Neo4j sync
        const activity = await activityService.saveActivity({
            name: "Collect ID Proofs",
            businessProcess: "Employee Onboarding",
            ownerUserId: "admin", // Assuming admin user exists
            status: "Active",
            purpose: "Employee identity verification for onboarding",
            permittedPurpose: "LegalObligation", // Fixed Enum
            retentionPeriod: "5 Year",
            sensitivity: "Sensitive",
            riskScore: 80,
            personalDataTypes: ["AADHAAR", "PAN"]
        });
        console.log(`✅ Created Activity: ${activity.name} (ID: ${activity.activityId})`);

        // 3. Create Data Asset
        const asset = await dataAssetService.createDataAsset({
            name: "Employee ID Proof Documents",
            dpdpCategory: "Sensitive Personal Data",
            personalDataCategories: ["Name", "Email", "Phone", "Aadhaar", "PAN", "Bank Account"],
            ownerUserId: "admin",
            processingActivityId: activity.activityId,
            protectionMethod: "Encrypted"
        });
        console.log(`✅ Created Data Asset: ${asset.name} (ID: ${asset.id})`);

        console.log("\n==================================================");
        console.log("PHASE 3: LINK DISCOVERY TO ASSET");
        console.log("==================================================");

        // 4. Link File to Asset
        await dataAssetService.linkDiscoveryToAsset(asset.id, fileName, 'File');
        console.log(`✅ Linked File '${fileName}' to Asset '${asset.name}'`);


        console.log("\n==================================================");
        console.log("PHASE 4: VERIFY COMPLIANCE OUTPUT");
        console.log("==================================================");

        const summary = await complianceService.getComplianceSummary();
        console.log("Compliance Summary:", JSON.stringify(summary, null, 2));

        if (summary.totalPIIInstances === 0) console.warn("⚠️ Warning: Total PII is 0 (Expected > 0)");
        if (summary.completeTraceabilityChains < 1) console.error("❌ Error: No Complete Traceability Chains found!");
        else console.log("✅ Verified: Traceability Chain Exists");

        const validations = await complianceService.runAllValidations();

        // Aadhaar Check
        const aadhaarCheck = validations.find(v => v.checkName === 'Aadhaar Processing Activities');
        if (aadhaarCheck?.severity === 'critical') console.error("❌ Aadhaar Compliance Failed");
        else console.log("✅ Aadhaar Compliance: Safe");

        // Illegal PII Check
        const illegalCheck = validations.find(v => v.checkName === 'PII Without Lawful Basis');
        if (illegalCheck?.severity === 'critical') console.error("❌ Illegal PII Found");
        else console.log("✅ Illegal PII Check: Safe");


        console.log("\n==================================================");
        console.log("PHASE 5: VALIDATION QUERY (RAW GRAPH CHECK)");
        console.log("==================================================");

        const queryRes = await session.run(`
            MATCH (p:PII)<-[:HAS_PII]-(s)
            -[:PART_OF_DATA_ASSET|AUTO_LINKED_TO]->(d:DataAsset)
            -[:USED_IN]->(a:ProcessingActivity)
            WHERE s.name = $fileName AND a.activityId = $activityId
            RETURN p.type as pii, s.name as file, d.name as asset, a.name as activity, a.lawfulBasis as basis, properties(a) as allProps
        `, { fileName, activityId: activity.activityId });

        if (queryRes.records.length === 0) {
            console.error("❌ Validation Query returned NO rows! Traceability broken.");
        } else {
            console.log("✅ Validation Query Result:");
            queryRes.records.forEach(r => {
                console.log(` - ${r.get('pii')} -> ${r.get('file')} -> ${r.get('asset')} -> ${r.get('activity')} [${r.get('basis')}]`);
                // console.log(`   Props: ${JSON.stringify(r.get('allProps'))}`);
            });
        }

        console.log("\n==================================================");
        console.log("PHASE 6: FINAL CHECK (USER QUERY)");
        console.log("==================================================");
        const finalCheck = await session.run(`
            MATCH (p:PII)<-[:HAS_PII]-(s)
            -[:PART_OF_DATA_ASSET|AUTO_LINKED_TO]->(d:DataAsset)
            -[:USED_IN]->(a:ProcessingActivity)
            RETURN p.type as type, s.name as name, d.name as dname, a.name as aname, a.lawfulBasis as basis
            LIMIT 5
        `);
        if (finalCheck.records.length > 0) {
            console.log("✅ End-to-End Traceability Verified (General Query):");
            finalCheck.records.forEach(r => console.log(`  ${r.get('type')} -> ${r.get('name')} -> ${r.get('dname')} -> ${r.get('aname')} (${r.get('basis')})`));
        } else {
            console.warn("⚠️ General trace query returned no rows (System might be empty aside from test data?)");
        }

    } catch (e) {
        console.error("❌ Verification Failed:", e);
    } finally {
        await session.close();
        // Since we are running in a script, we force exit or close driver pool
        await driver.close();
        process.exit(0);
    }
}

runVerification();
