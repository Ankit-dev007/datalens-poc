
import { pool } from '../config/pg';
import { v4 as uuidv4 } from 'uuid';

async function seed() {
    console.log("🌱 Seeding Pending Confirmation to Postgres...");

    try {
        const id = uuidv4();
        const query = `
            INSERT INTO confirmation_requests 
            (id, table_name, column_name, suggested_pii_type, confidence, status, reason, created_at)
            VALUES 
            ($1, $2, $3, $4, $5, $6, $7, NOW())
        `;

        await pool.query(query, [
            id,
            'users_test_postgres',
            'bio_analysis',
            'political_opinion',
            0.55,
            'PENDING',
            'AI suggested political opinion with low confidence (Seed Script)'
        ]);

        console.log(`✅ Inserted Pending Confirmation: ${id}`);
        console.log("👉 Go to Sidebar -> 'PII Reviews' to see this item.");

    } catch (e) {
        console.error("❌ Seeding Failed:", e);
    } finally {
        await pool.end();
    }
}

seed();
