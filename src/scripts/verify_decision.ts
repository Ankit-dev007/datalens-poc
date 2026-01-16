import { pool } from '../config/pg';
import { DsarService } from '../services/dsarService';

async function verify() {
    console.log("🕵️ Verifying Auto-Decision Engine...");
    try {
        const dsarService = new DsarService();

        // 1. Find Ramesh Kumar's DSAR
        const requests = await dsarService.getRequests();
        const targetDsar = requests.find(r => r.subject_name === 'Ramesh Kumar' && r.request_type === 'ERASURE');

        if (!targetDsar) {
            console.error("❌ Ramesh Kumar DSAR not found. Did you run seed?");
            return;
        }

        console.log(`✅ Found DSAR: ${targetDsar.id}`);

        // 2. Generate Checklist (which triggers decision)
        console.log("2. Generating Checklist & Triggering Decision...");
        const result = await dsarService.generateChecklist(targetDsar.id);

        const decision = result.autoDecision;
        console.log("🤖 Decision Engine Output:", JSON.stringify(decision, null, 2));

        // 3. Assertions
        if (decision.decision === 'BLOCK') {
            console.log("✅ Assertion Passed: Decision is BLOCK");
        } else {
            console.error(`❌ Assertion Failed: Expected BLOCK, got ${decision.decision}`);
        }

        if (decision.reason.includes('Legal Obligation')) {
            console.log("✅ Assertion Passed: Reason cites Legal Obligation");
        } else {
            console.error(`❌ Assertion Failed: Reason mismatch. Got: ${decision.reason}`);
        }

    } catch (e) {
        console.error("❌ Verification Failed:", e);
    } finally {
        await pool.end();
        // Force exit because DsarService might hang on neo connection if not explicitly closed inside (it manages connection per call mostly)
        process.exit(0);
    }
}

verify();
