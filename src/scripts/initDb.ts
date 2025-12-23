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
