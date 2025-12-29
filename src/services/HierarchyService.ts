import { query } from '../config/pg';

export class HierarchyService {
    async getSectors() {
        const res = await query('SELECT * FROM sectors ORDER BY name');
        return res.rows;
    }

    async getProcesses(sectorId: number) {
        const res = await query('SELECT * FROM processes WHERE sector_id = $1 AND is_active = true ORDER BY name', [sectorId]);
        return res.rows;
    }

    async getSubProcesses(processId: number) {
        const res = await query('SELECT * FROM sub_processes WHERE process_id = $1 AND is_active = true ORDER BY name', [processId]);
        return res.rows;
    }

    async getActivityTemplates(subProcessId: number) {
        const res = await query('SELECT * FROM activity_templates WHERE sub_process_id = $1 AND is_active = true ORDER BY name', [subProcessId]);
        return res.rows;
    }
}
