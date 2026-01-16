import { pool } from '../config/pg';

async function initDsarDecisions() {
    console.log("Initializing dsar_decisions table...");
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS dsar_decisions (
                id UUID PRIMARY KEY,
                dsar_id UUID NOT NULL REFERENCES dsar_requests(id),
                decision VARCHAR(50) NOT NULL CHECK (decision IN ('ALLOW', 'BLOCK', 'REVIEW')),
                reason TEXT NOT NULL,
                evidence JSONB DEFAULT '{}',
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log("✅ dsar_decisions table ready.");
    } catch (error) {
        console.error("❌ Failed to create dsar_decisions table:", error);
    } finally {
        await pool.end();
    }
}

initDsarDecisions();
