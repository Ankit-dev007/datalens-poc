import { query } from '../config/pg';

const migrateConfigTables = async () => {
    try {
        console.log("Migrating configuration tables...");

        // Processes
        await query(`ALTER TABLE processes ADD COLUMN IF NOT EXISTS description TEXT`);
        await query(`ALTER TABLE processes ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`);
        console.log("Updated 'processes' table.");

        // Sub-Processes
        await query(`ALTER TABLE sub_processes ADD COLUMN IF NOT EXISTS description TEXT`);
        await query(`ALTER TABLE sub_processes ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`);
        console.log("Updated 'sub_processes' table.");

        // Activity Templates
        await query(`ALTER TABLE activity_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`);
        // description already exists in initDb.ts version of activity_templates
        console.log("Updated 'activity_templates' table.");

    } catch (error) {
        console.error("Error migrating columns:", error);
    }
};

migrateConfigTables();
