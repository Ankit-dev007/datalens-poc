
import { pool } from '../config/pg';
import { v4 as uuidv4 } from 'uuid';

const seed = async () => {
    try {
        console.log("Seeding dummy review data...");
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // 1. Pending Review (Confidence 0.65)
            await client.query(`
                INSERT INTO confirmation_requests 
                (id, source_type, source_subtype, database_name, schema_name, table_name, column_name, file_path, file_type, file_section, suggested_pii_type, confidence, reason, status, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
            `, [
                uuidv4(),
                'database', 'postgres', 'datalens_poc', 'public', 'employees', 'employee_code',
                null, null, null,
                'identity', 0.65,
                "Employee code may identify a person",
                'PENDING'
            ]);

            // 2. Discarded Item (Confidence 0.30)
            await client.query(`
                INSERT INTO confirmation_requests 
                (id, source_type, source_subtype, database_name, schema_name, table_name, column_name, file_path, file_type, file_section, suggested_pii_type, confidence, reason, status, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
            `, [
                uuidv4(),
                'database', 'postgres', 'datalens_poc', 'public', 'orders', 'order_id',
                null, null, null,
                'other', 0.30,
                "Order ID is a generic identifier",
                'discarded' // Lowercase as per previous code, checking DB consistency usually implies uppercase but let's stick to requirement "status = 'discarded'"
            ]);

            await client.query('COMMIT');
            console.log("✅ Seeded 1 Pending and 1 Discarded record.");
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        process.exit(0);
    } catch (e) {
        console.error("Seeding failed:", e);
        process.exit(1);
    }
};

seed();
