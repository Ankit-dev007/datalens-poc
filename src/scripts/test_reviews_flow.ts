
import { ConfirmationService } from '../services/confirmationService';
import { pool } from '../config/pg';
import { v4 as uuidv4 } from 'uuid';

async function testFlow() {
    const service = new ConfirmationService();
    console.log("🧪 Starting Reviews & Override Flow Test...");

    const table = 'test_override_table';
    const column = 'test_col';

    try {
        // 1. Create Pending Request
        console.log("1. Creating Pending Request...");
        await service.createRequest(table, column, 'EMAIL', 0.45, 'Low confidence test');

        let pending = await service.getPendingConfirmations();
        const item = pending.find(i => i.table_name === table && i.column_name === column);

        if (!item) throw new Error("Item not found in pending list");
        console.log(`✅ Found pending item: ${item.id}`);

        // 2. Resolve as YES
        console.log("2. Resolving as YES...");
        await service.resolveConfirmation(item.id, 'YES');

        // Check Resolved List
        let resolved = await service.getResolvedConfirmations();
        let resolvedItem = resolved.find(i => i.id === item.id);
        if (resolvedItem?.status !== 'CONFIRMED') throw new Error("Item not confirmed");
        console.log(`✅ Item confirmed: ${resolvedItem.id}`);

        // 3. Override to NO
        console.log("3. Overriding to NO...");
        await service.overrideDecision(item.id, 'NO', 'False Positive Detected', 'admin_tester');

        // 4. Verify History
        resolved = await service.getResolvedConfirmations();

        // Old item should be OVERRIDDEN
        const oldItem = resolved.find(i => i.id === item.id);
        if (oldItem?.status !== 'OVERRIDDEN') throw new Error(`Old item status mismatch: ${oldItem?.status}`);

        // New item should exist and be REJECTED
        const newItem = resolved.find(i => i.table_name === table && i.status === 'REJECTED' && i.override_reason === 'False Positive Detected');
        if (!newItem) throw new Error("New override record not found");

        console.log(`✅ Override successful!`);
        console.log(`   Old Item Status: ${oldItem.status}`);
        console.log(`   New Item Status: ${newItem.status}`);
        console.log(`   Override Reason: ${newItem.override_reason}`);

    } catch (e) {
        console.error("❌ Test Failed:", e);
    } finally {
        await pool.end();
    }
}

testFlow();
