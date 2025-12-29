import { ConfigService } from '../services/ConfigService';
import { query } from '../config/pg';

const verifyConfig = async () => {
    const service = new ConfigService();
    const timestamp = Date.now();
    const sectorName = `Test Sector ${timestamp}`;
    const processName = `Test Process ${timestamp}`;

    try {
        console.log("Starting Configuration Verification...");

        // 1. Create Process
        const p = await service.createProcess(processName, sectorName, "Test Description");
        console.log("Create Process:", p.id, p.name, p.sector);
        if (p.name !== processName || p.sector !== sectorName) throw new Error("Process creation mismatch");

        // 2. Create Sub-Process
        const sp = await service.createSubProcess(p.id, "Test SubProcess", "Sub Desc");
        console.log("Create Sub-Process:", sp.id, sp.name);
        if (sp.process_id !== p.id) throw new Error("Sub-Process linkage mismatch");

        // 3. Create Activity Template
        const at = await service.createActivityTemplate(sp.id, "Test Template", "Template Desc");
        console.log("Create Template:", at.id, at.name);
        if (at.sub_process_id !== sp.id) throw new Error("Template linkage mismatch");

        // 4. Update Process
        const updatedP = await service.updateProcess(p.id, processName + " Updated", sectorName, "Updated Desc", true);
        console.log("Update Process:", updatedP.name);
        if (updatedP.name !== processName + " Updated") throw new Error("Process update failed");

        // 5. Validation Test: Try to delete Process while Sub-Process exists
        console.log("Testing Delete Validation...");
        try {
            await service.deleteProcess(p.id);
            throw new Error("Validation Failed: Process should NOT be deletable with active sub-processes.");
        } catch (error: any) {
            if (!error.message.includes("Cannot delete")) throw error;
            console.log("✅ Passed Validation: Blocked deletion of parent.");
        }

        // 6. Delete Child first
        console.log("Deleting child first...");
        // Validation for SubProcess delete (has template)
        try {
            await service.deleteSubProcess(sp.id);
            throw new Error("Validation Failed: SubProcess should NOT be deletable with active templates.");
        } catch (error: any) {
            if (!error.message.includes("Cannot delete")) throw error;
            console.log("✅ Passed Validation: Blocked deletion of SubProcess.");
        }

        await service.deleteActivityTemplate(at.id); // Delete template
        await service.deleteSubProcess(sp.id); // Delete sub-process
        await service.deleteProcess(p.id); // Delete process

        console.log("Soft Delete Check: Process deleted successfully after children removal.");

        // Cleanup
        console.log("Cleaning up test data...");
        await query('DELETE FROM processes WHERE id = $1', [p.id]); // Cascade should delete sub-processes and templates
        await query('DELETE FROM sectors WHERE name = $1', [sectorName]);

        console.log("✅ Configuration Verification Passed!");

    } catch (e) {
        console.error("❌ Verification Failed:", e);
        process.exit(1);
    }
};

verifyConfig();
