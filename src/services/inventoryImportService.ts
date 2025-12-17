import { getNeo4jDriver } from '../config/neo4j';
import {
    calculateRisk,
    calculateSensitivity,
    getCategoryForType
} from '../utils/riskCalculator';

export class InventoryImportService {

    async importCsv(csvContent: string, defaultOwnerId: string) {
        const lines = csvContent.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length < 2) {
            throw new Error('CSV file is empty or missing headers');
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const driver = getNeo4jDriver();
        if (!driver) throw new Error("Neo4j driver definition missing");
        const session = driver.session();

        let importedCount = 0;

        try {
            for (let i = 1; i < lines.length; i++) {
                const row = lines[i].split(',').map(c => c.trim());
                if (row.length < headers.length) continue;

                const getVal = (key: string) => {
                    const idx = headers.findIndex(h => h.includes(key));
                    return idx >= 0 ? row[idx] : '';
                };

                // Data Item
                const dataItemName = getVal('name');
                if (!dataItemName) continue;

                const description = getVal('desc') || '';
                const dataType = getVal('data') || 'Imported Data';
                const category = getVal('cat') || getCategoryForType(dataType);
                const volume = parseInt(getVal('vol') || '0', 10);
                const ownerId = getVal('owner') || defaultOwnerId;
                const activityName = getVal('activity');

                const risk = calculateRisk({ category, volume });
                const sensitivity = calculateSensitivity(risk, volume);

                await session.run(
                    `
          // -------------------------
          // Data Item
          // -------------------------
          MERGE (d:DataItem {name: $dataItemName})
          SET d.description = $description,
              d.type = $dataType,
              d.source = 'inventory_import',
              d.volume = $volume,
              d.risk = $risk,
              d.sensitivity = $sensitivity,
              d.updatedAt = datetime()

          MERGE (dc:Category {name: $category})
          MERGE (d)-[:BELONGS_TO]->(dc)

          // -------------------------
          // Owner
          // -------------------------
          MERGE (u:User {userId: $ownerId})
          MERGE (d)-[:OWNED_BY]->(u)

          // -------------------------
          // Processing Activity (SAME AS MANUAL ENTRY)
          // -------------------------
          WITH d, u
          CALL {
            WITH d, u
            WITH d, u WHERE $activityName <> ''
            MERGE (a:ProcessingActivity {name: $activityName})
            ON CREATE SET
              a.activityId = randomUUID(),
              a.businessProcess = $businessProcess,
              a.ownerUserId = $ownerId,
              a.status = 'Draft',
              a.dpiaStatus = 'NotRequired',
              a.dpiaReferenceId = '',
              a.riskScore = 0,
              a.sensitivity = 'Internal',
              a.createdFrom = 'inventory_import',
              a.createdAt = datetime()
            SET a.updatedAt = datetime()
            MERGE (a)-[:OWNED_BY]->(u)
            MERGE (a)-[:USES]->(d)
          }
          `,
                    {
                        dataItemName,
                        description,
                        dataType,
                        category,
                        volume,
                        risk,
                        sensitivity,
                        ownerId,
                        activityName: activityName || '',
                        businessProcess: description // ✅ SAME field as manual entry
                    }
                );

                importedCount++;
            }
        } finally {
            await session.close();
        }

        return importedCount;
    }
}
