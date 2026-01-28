
import { pool } from '../config/pg';

const cleanup = async () => {
    try {
        console.log("Cleaning up invalid pending requests (confidence < 0.5)...");
        const res = await pool.query(`
            DELETE FROM confirmation_requests 
            WHERE status = 'PENDING' 
            AND confidence < 0.50
        `);
        console.log(`Deleted ${res.rowCount} invalid pending requests.`);
        process.exit(0);
    } catch (e) {
        console.error("Cleanup failed:", e);
        process.exit(1);
    }
};

cleanup();
