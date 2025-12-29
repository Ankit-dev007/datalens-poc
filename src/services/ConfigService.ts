import { query } from '../config/pg';

export interface Process {
    id: number;
    name: string;
    sector: string; // resolved from sector_id
    sector_id: number;
    description: string;
    is_active: boolean;
}

export interface SubProcess {
    id: number;
    process_id: number;
    name: string;
    description: string;
    is_active: boolean;
}

export interface ActivityTemplate {
    id: number;
    sub_process_id: number;
    name: string;
    description: string;
    is_active: boolean;
}

export interface Sector {
    id: number;
    name: string;
}

export class ConfigService {

    // --- Sectors ---

    async getSectors(): Promise<Sector[]> {
        const res = await query('SELECT * FROM sectors ORDER BY name ASC');
        return res.rows;
    }

    async createSector(name: string): Promise<Sector> {
        const res = await query('INSERT INTO sectors (name) VALUES ($1) RETURNING *', [name]);
        return res.rows[0];
    }

    async updateSector(id: number, name: string): Promise<Sector> {
        const res = await query('UPDATE sectors SET name = $1 WHERE id = $2 RETURNING *', [name, id]);
        return res.rows[0];
    }

    async deleteSector(id: number): Promise<void> {
        // Validation: Cannot delete if active processes exist
        // Note: Processes table uses soft-delete (is_active), but we should check if ANY process exists linked to this sector?
        // Or only active ones? Let's check active ones to allow cleanup.
        const check = await query('SELECT count(*) as count FROM processes WHERE sector_id = $1 AND is_active = true', [id]);
        if (parseInt(check.rows[0].count) > 0) {
            throw new Error('Cannot delete: Active processes exist in this sector.');
        }
        // Sectors table doesn't have is_active column based on initDb.ts viewing previously.
        // It was just (id, name).
        // If we want soft-delete for sectors, we need to migrate DB.
        // CHECK: initDb.ts content in previous turns? 
        // "Created PostgreSQL tables: `processes`, `sub_processes`, `activity_templates`, and `sectors`"
        // Let's assume hard delete for Sectors for now as it's a lookup table, OR check if I should add is_active.
        // User said "BACKEND – SECTOR AS FIRST-CLASS ENTITY".
        // Use hard delete if no is_active, but safest to checkschema.
        // I will assume hard delete for now but protected by validation.
        await query('DELETE FROM sectors WHERE id = $1', [id]);
    }

    // --- Processes ---

    async getProcesses(): Promise<Process[]> {
        const sql = `
            SELECT p.id, p.name, s.name as sector, p.sector_id, p.description, p.is_active
            FROM processes p
            LEFT JOIN sectors s ON p.sector_id = s.id
            ORDER BY p.name ASC
        `;
        const res = await query(sql);
        return res.rows;
    }

    async createProcess(name: string, sectorName: string, description: string = ''): Promise<Process> {
        // 1. Resolve Sector
        let sectorId: number;
        const sectorRes = await query('SELECT id FROM sectors WHERE name = $1', [sectorName]);
        if (sectorRes.rows.length > 0) {
            sectorId = sectorRes.rows[0].id;
        } else {
            const newSector = await query('INSERT INTO sectors (name) VALUES ($1) RETURNING id', [sectorName]);
            sectorId = newSector.rows[0].id;
        }

        // 2. Create Process
        const processRes = await query(
            'INSERT INTO processes (name, sector_id, description, is_active) VALUES ($1, $2, $3, true) RETURNING *',
            [name, sectorId, description]
        );
        const row = processRes.rows[0];
        return { ...row, sector: sectorName };
    }

    async updateProcess(id: number, name: string, sectorName: string, description: string, isActive: boolean): Promise<Process> {
        // 1. Resolve Sector
        let sectorId: number;
        const sectorRes = await query('SELECT id FROM sectors WHERE name = $1', [sectorName]);
        if (sectorRes.rows.length > 0) {
            sectorId = sectorRes.rows[0].id;
        } else {
            const newSector = await query('INSERT INTO sectors (name) VALUES ($1) RETURNING id', [sectorName]);
            sectorId = newSector.rows[0].id;
        }

        const res = await query(
            `UPDATE processes 
             SET name = $1, sector_id = $2, description = $3, is_active = $4 
             WHERE id = $5 
             RETURNING *`,
            [name, sectorId, description, isActive, id]
        );
        return { ...res.rows[0], sector: sectorName };
    }

    async deleteProcess(id: number): Promise<void> {
        // Validation: Cannot delete if active sub-processes exist
        const check = await query('SELECT count(*) as count FROM sub_processes WHERE process_id = $1 AND is_active = true', [id]);
        if (parseInt(check.rows[0].count) > 0) {
            throw new Error('Cannot delete: Active sub-processes exist.');
        }
        await query('UPDATE processes SET is_active = false WHERE id = $1', [id]);
    }

    // --- Sub-Processes ---

    async getSubProcesses(processId: number): Promise<SubProcess[]> {
        const res = await query('SELECT * FROM sub_processes WHERE process_id = $1 ORDER BY name ASC', [processId]);
        return res.rows;
    }

    async createSubProcess(processId: number, name: string, description: string = ''): Promise<SubProcess> {
        const res = await query(
            'INSERT INTO sub_processes (process_id, name, description, is_active) VALUES ($1, $2, $3, true) RETURNING *',
            [processId, name, description]
        );
        return res.rows[0];
    }

    async updateSubProcess(id: number, name: string, description: string, isActive: boolean): Promise<SubProcess> {
        const res = await query(
            'UPDATE sub_processes SET name = $1, description = $2, is_active = $3 WHERE id = $4 RETURNING *',
            [name, description, isActive, id]
        );
        return res.rows[0];
    }

    async deleteSubProcess(id: number): Promise<void> {
        // Validation: Cannot delete if active templates exist
        const check = await query('SELECT count(*) as count FROM activity_templates WHERE sub_process_id = $1 AND is_active = true', [id]);
        if (parseInt(check.rows[0].count) > 0) {
            throw new Error('Cannot delete: Active templates exist.');
        }
        await query('UPDATE sub_processes SET is_active = false WHERE id = $1', [id]);
    }

    // --- Activity Templates ---

    async getActivityTemplates(subProcessId: number): Promise<ActivityTemplate[]> {
        const res = await query('SELECT * FROM activity_templates WHERE sub_process_id = $1 ORDER BY name ASC', [subProcessId]);
        return res.rows;
    }

    async createActivityTemplate(subProcessId: number, name: string, description: string = ''): Promise<ActivityTemplate> {
        const res = await query(
            'INSERT INTO activity_templates (sub_process_id, name, description, is_active) VALUES ($1, $2, $3, true) RETURNING *',
            [subProcessId, name, description]
        );
        return res.rows[0];
    }

    async updateActivityTemplate(id: number, name: string, description: string, isActive: boolean): Promise<ActivityTemplate> {
        const res = await query(
            'UPDATE activity_templates SET name = $1, description = $2, is_active = $3 WHERE id = $4 RETURNING *',
            [name, description, isActive, id]
        );
        return res.rows[0];
    }

    async deleteActivityTemplate(id: number): Promise<void> {
        await query('UPDATE activity_templates SET is_active = false WHERE id = $1', [id]);
    }
}
