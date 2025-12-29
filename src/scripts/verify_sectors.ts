
import { ConfigService } from '../services/ConfigService';
import { query } from '../config/pg';

async function verifySectors() {
    const service = new ConfigService();
    console.log("Starting Sector Verification...");

    try {
        // 1. Create
        const sectorName = `Test Sector ${Date.now()}`;
        const s = await service.createSector(sectorName);
        console.log("Created Sector:", s);
        if (s.name !== sectorName) throw new Error("Sector creation mismatch");

        // 2. Read
        const sectors = await service.getSectors();
        const found = sectors.find(x => x.id === s.id);
        if (!found) throw new Error("Sector not found in list");
        console.log("Read Sector:", found);

        // 3. Update
        const updatedName = sectorName + " Updated";
        const u = await service.updateSector(s.id, updatedName);
        console.log("Updated Sector:", u);
        if (u.name !== updatedName) throw new Error("Sector update mismatch");

        // 4. Delete
        await service.deleteSector(s.id);
        console.log("Deleted Sector");

        // 5. Verify Deletion
        const sectorsAfter = await service.getSectors();
        if (sectorsAfter.find(x => x.id === s.id)) throw new Error("Sector still exists after delete");

        console.log("✅ Sector Verification Passed!");
    } catch (e) {
        console.error("❌ Sector Verification Failed:", e);
        process.exit(1);
    }
}

verifySectors();
