import { pool } from '../config/pg';

const schema = `
CREATE TABLE IF NOT EXISTS sectors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS processes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    sector_id INTEGER REFERENCES sectors(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sub_processes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    process_id INTEGER REFERENCES processes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS activity_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sub_process_id INTEGER REFERENCES sub_processes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS processing_activities (
    activity_id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    business_process VARCHAR(255),
    owner_user_id VARCHAR(255),
    status VARCHAR(50),
    purpose TEXT,
    permitted_purpose VARCHAR(255),
    personal_data_types TEXT[],
    retention_period VARCHAR(255),
    dpia_status VARCHAR(50) DEFAULT 'NotRequired',
    dpia_reference_id VARCHAR(255),
    risk_score INTEGER DEFAULT 0,
    sensitivity VARCHAR(50) DEFAULT 'Internal',
    activity_template_id INTEGER REFERENCES activity_templates(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS data_assets (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255),
    description TEXT,
    data_type VARCHAR(255),
    dpdp_category VARCHAR(255),
    volume INTEGER,
    protection_method VARCHAR(50),
    owner_user_id VARCHAR(255),
    processing_activity_id VARCHAR(255) REFERENCES processing_activities(activity_id),
    personal_data_categories TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS data_subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dsar_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_subject_id UUID REFERENCES data_subjects(id),
    request_type VARCHAR(50) NOT NULL, -- ACCESS, CORRECTION, ERASURE
    status VARCHAR(50) DEFAULT 'OPEN', -- OPEN, IN_PROGRESS, REJECTED, COMPLETED
    description TEXT,
    due_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS confirmation_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Source Context
    source_type VARCHAR(50) DEFAULT 'database', -- 'database' | 'file'
    source_subtype VARCHAR(50), -- 'postgres', 'mysql', 'pdf', 'csv'
    
    -- Database Context
    database_name TEXT,
    schema_name TEXT,
    table_name TEXT,
    column_name TEXT,
    
    -- File Context
    file_path TEXT,
    file_type VARCHAR(50),
    file_section TEXT, -- 'Page 1', 'Row 50'

    -- Detection Info
    suggested_pii_type VARCHAR(100),
    confidence DECIMAL,
    reason TEXT,
    
    -- Workflow State
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, CONFIRMED, REJECTED, SKIPPED, OVERRIDDEN
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Resolution Info
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(100),
    
    -- Audit Trail for Override
    override_reason TEXT,
    overridden_by VARCHAR(100),
    overridden_at TIMESTAMP WITH TIME ZONE,
    previous_decision_id UUID -- Reference to the original decision if this is a new override record
);
`;

const seedBFSI = async () => {
    // 1. Sector: BFSI
    const sectorRes = await pool.query(`INSERT INTO sectors (name) VALUES ('BFSI') ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id`);
    const sectorId = sectorRes.rows[0].id;

    // 2. Process: Employee Onboarding
    const processRes = await pool.query(`INSERT INTO processes (name, sector_id) VALUES ('Employee Onboarding', $1) RETURNING id`, [sectorId]);
    const processId = processRes.rows[0].id;

    // 3. Sub-Processes
    const subProcesses = [
        'Pre-Onboarding',
        'Orientation & First Day',
        'Role-Specific Training & Integration',
        'Engagement & Development'
    ];

    for (const spName of subProcesses) {
        const spRes = await pool.query(`INSERT INTO sub_processes (name, process_id) VALUES ($1, $2) RETURNING id`, [spName, processId]);
        const spId = spRes.rows[0].id;

        // 4. Seed some templates for each (Mock data based on context)
        const templates = [];
        if (spName === 'Pre-Onboarding') {
            templates.push('Collect ID Proofs', 'Background Verification', 'Offer Letter Acceptance');
        } else if (spName === 'Orientation & First Day') {
            templates.push('Badge Creation', 'IT Asset Allocation', 'Bank Account Setup');
        } else if (spName === 'Role-Specific Training & Integration') {
            templates.push('LMS Access Grant', 'Compliance Training');
        } else if (spName === 'Engagement & Development') {
            templates.push('Performance Review Setup', 'Feedback Survey');
        }

        for (const tName of templates) {
            await pool.query(`INSERT INTO activity_templates (name, sub_process_id) VALUES ($1, $2)`, [tName, spId]);
        }
    }
    console.log("Seeding BFSI completed.");
};

const init = async () => {
    try {
        console.log("Initializing Postgres Schema...");
        await pool.query(schema);
        console.log("Schema created.");

        // MIGRATION: Add personal_data_categories if it doesn't exist
        try {
            await pool.query(`ALTER TABLE data_assets ADD COLUMN IF NOT EXISTS personal_data_categories TEXT[]`);
            console.log("Migration: Verified personal_data_categories column.");
        } catch (e: any) {
            console.warn("Migration warning:", e.message);
        }

        // MIGRATION: Add audit columns to confirmation_requests
        try {
            await pool.query(`ALTER TABLE confirmation_requests ADD COLUMN IF NOT EXISTS override_reason VARCHAR(50)`);
            await pool.query(`ALTER TABLE confirmation_requests ADD COLUMN IF NOT EXISTS overridden_by VARCHAR(255)`);
            await pool.query(`ALTER TABLE confirmation_requests ADD COLUMN IF NOT EXISTS overridden_at TIMESTAMP`);
            await pool.query(`ALTER TABLE confirmation_requests ADD COLUMN IF NOT EXISTS previous_decision_id UUID`);

            // MIGRATION: Unified Review System
            await pool.query(`ALTER TABLE confirmation_requests ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) DEFAULT 'database'`);
            await pool.query(`ALTER TABLE confirmation_requests ADD COLUMN IF NOT EXISTS source_subtype VARCHAR(50)`);
            await pool.query(`ALTER TABLE confirmation_requests ADD COLUMN IF NOT EXISTS database_name TEXT`);
            await pool.query(`ALTER TABLE confirmation_requests ADD COLUMN IF NOT EXISTS schema_name TEXT`);
            await pool.query(`ALTER TABLE confirmation_requests ADD COLUMN IF NOT EXISTS file_path TEXT`);
            await pool.query(`ALTER TABLE confirmation_requests ADD COLUMN IF NOT EXISTS file_type VARCHAR(50)`);
            await pool.query(`ALTER TABLE confirmation_requests ADD COLUMN IF NOT EXISTS file_section TEXT`);

            // Relax constraints if they exist (table_name/column_name might be null for files?) 
            // Actually, for now let's keep them as text, but we may need to drop NOT NULL if it was set in CREATE. 
            // The original CREATE had NOT NULL. We need to drop that constraint if we want them optional for files.
            // checking if we need to remove NOT NULL constraints
            await pool.query(`ALTER TABLE confirmation_requests ALTER COLUMN table_name DROP NOT NULL`);
            await pool.query(`ALTER TABLE confirmation_requests ALTER COLUMN column_name DROP NOT NULL`);

            console.log("Migration: Verified confirmation_requests audit columns.");
        } catch (e: any) {
            console.warn("Audit Migration warning:", e.message);
        }

        // rudimentary check to see if we seeded already (check if BFSI exists)
        const check = await pool.query("SELECT * FROM sectors WHERE name = 'BFSI'");
        if (check.rows.length === 0) {
            console.log("Seeding data...");
            await seedBFSI();
        } else {
            console.log("Seed data already exists, skipping.");
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

init();
