
import { pool } from '../config/pg';

async function initDB() {
    try {
        console.log("Connecting to DB...");
        const client = await pool.connect();
        try {
            console.log("Creating dsar_audit_logs table...");
            await client.query(`
                CREATE TABLE IF NOT EXISTS dsar_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dsar_id UUID NOT NULL REFERENCES dsar_requests(id) ON DELETE CASCADE,
    action VARCHAR(255) NOT NULL,
    details JSONB,
    performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
            `);
            // Note: Using TEXT for UUIDs to match existing schema likely using string/uuid
            console.log("Table created successfully.");
        } finally {
            client.release();
        }
    } catch (err) {
        console.error("Error creating table:", err);
    } finally {
        await pool.end();
    }
}

initDB();
