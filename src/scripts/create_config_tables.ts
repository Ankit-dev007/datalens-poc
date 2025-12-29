import { query } from '../config/pg';

const createConfigTables = async () => {
    try {
        console.log("Creating configuration tables...");

        // Processes Table
        await query(`
            CREATE TABLE IF NOT EXISTS processes (
                id UUID PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                sector VARCHAR(255),
                description TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log("Checked/Created 'processes' table.");

        // Sub-Processes Table
        await query(`
            CREATE TABLE IF NOT EXISTS sub_processes (
                id UUID PRIMARY KEY,
                process_id UUID REFERENCES processes(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log("Checked/Created 'sub_processes' table.");

        // Activity Templates Table
        await query(`
            CREATE TABLE IF NOT EXISTS activity_templates (
                id UUID PRIMARY KEY,
                sub_process_id UUID REFERENCES sub_processes(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log("Checked/Created 'activity_templates' table.");

    } catch (error) {
        console.error("Error creating config tables:", error);
    }
};

createConfigTables();
