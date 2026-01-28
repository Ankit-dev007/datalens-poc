
import { pool } from '../config/pg';

const inspect = async () => {
    try {
        console.log("Inspecting pending requests...");
        const res = await pool.query(`
            SELECT id, confidence, status, source_type 
            FROM confirmation_requests 
            WHERE status = 'PENDING'
            ORDER BY confidence ASC
        `);

        console.log(`Total Pending: ${res.rows.length}`);

        const invalid = res.rows.filter((r: any) => parseFloat(r.confidence) < 0.5);

        if (invalid.length > 0) {
            console.error("❌ FOUND INVALID ROWS:");
            console.table(invalid);
        } else {
            console.log("✅ No invalid rows found (confidence < 0.5).");
        }

        if (res.rows.length > 0) {
            console.log("Sample Row Type:", typeof res.rows[0].confidence, res.rows[0].confidence);
        }

        process.exit(0);
    } catch (e) {
        console.error("Inspection failed:", e);
        process.exit(1);
    }
};

inspect();
