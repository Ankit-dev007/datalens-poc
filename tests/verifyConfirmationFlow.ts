import { Neo4jWriter } from '../src/scanner/neo4jWriter';
import { ConfirmationService } from '../src/services/confirmationService';
import { RuleEngine } from '../src/scanner/ruleEngine';
import { getNeo4jDriver } from '../src/config/neo4j';
import { TableResult } from '../src/types';

async function runTest() {
    console.log("🚀 Starting Verification: Low Confidence Confirmation Flow");

    const driver = getNeo4jDriver();
    if (!driver) {
        console.error("❌ Neo4j Driver failed to initialize");
        process.exit(1);
    }
    const session = driver.session();

    try {
        // 1. Cleanup Test Data
        console.log("🧹 Cleaning up old test data...");
        await session.run(`MATCH (n) WHERE n.table = 'TEST_TBL_CONFIRM' DETACH DELETE n`);
        await session.run(`MATCH (r:UserRule {column: 'low_conf_col'}) DELETE r`);

        // 2. Simulate Scan Result (Low Confidence)
        console.log("📝 Simulating Write of Low Confidence Result...");
        const writer = new Neo4jWriter();
        const testResult: TableResult = {
            table: 'TEST_TBL_CONFIRM',
            pii: [{
                field: 'low_conf_col',
                type: 'email',
                confidence: 0.4,
                source: 'ai',
                status: 'needs_confirmation',
                reason: 'Simulated low confidence'
            }]
        };

        await writer.writeResults([testResult], 'TEST_DB');

        // 3. Verify Confirmation Request Exists
        console.log("🔍 Verifying Confirmation Request in Neo4j...");
        const pendingRes = await session.run(`
            MATCH (cr:ConfirmationRequest {table: 'TEST_TBL_CONFIRM', column: 'low_conf_col'})
            RETURN elementId(cr) as id, cr.status as status
        `);

        if (pendingRes.records.length === 0) {
            throw new Error("❌ ConfirmationRequest node NOT found!");
        }
        const confirmId = pendingRes.records[0].get('id');
        console.log(`✅ Found Pending Confirmation: ${confirmId}`);

        // 4. Verify Service API (Fetch)
        console.log("📡 Testing ConfirmationService.getPendingConfirmations()...");
        const service = new ConfirmationService();
        const pendingItems = await service.getPendingConfirmations();
        const found = pendingItems.find(i => i.id === confirmId);
        if (!found) throw new Error("❌ Service did not return the test item");
        console.log(`✅ Service returned item correctly.`);

        // 5. Resolve as YES
        console.log("✅ Resolving Confirmation as YES...");
        await service.resolveConfirmation(confirmId, 'YES');

        // 6. Verify Graph Update (IS_PII exists?)
        console.log("🔍 Verifying 'IS_PII' relationship creation...");
        const piiRes = await session.run(`
            MATCH (c:Column {name: 'low_conf_col', table: 'TEST_TBL_CONFIRM'})-[r:IS_PII]->(p:PII)
            RETURN r.status
        `);
        if (piiRes.records.length === 0) {
            throw new Error("❌ IS_PII relationship NOT created after confirmation!");
        }
        console.log(`✅ IS_PII exists with status: ${piiRes.records[0].get('r.status')}`);

        // 7. Verify Rule Creation
        console.log("🧠 Verifying User Rule Learning...");
        const ruleEngine = new RuleEngine();
        const rule = await ruleEngine.checkRule('low_conf_col');

        if (!rule || !rule.is_pii) {
            throw new Error("❌ Rule was NOT learned correctly!");
        }
        console.log(`✅ Rule learned: ${JSON.stringify(rule)}`);

        console.log("🎉 SUCCESS: Full Confirmation Flow Verified!");

    } catch (error) {
        console.error("❌ Test Failed:", error);
    } finally {
        await session.close();
        await driver.close();
    }
}

runTest();
