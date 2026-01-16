import { getNeo4jDriver } from '../config/neo4j';
import { DataSubjectService } from './dataSubjectService';

export class DsarCollectionService {

    /**
     * Collects all known data for a subject by traversing the graph.
     * Returns a structured view grouped by Asset -> Activity.
     */
    async collectDataForSubject(subjectId: string) {
        const driver = getNeo4jDriver();
        if (!driver) throw new Error("Neo4j driver not initialized");

        const session = driver.session();

        try {
            // Traverse: Subject <- BelongsTo - PII (Instance or Type) <- HasPII - Source (File/Table) - PartOf -> DataAsset
            const result = await session.executeRead(async tx => {
                return await tx.run(`
                    MATCH (ds:DataSubject {id: $subjectId})<-[:BELONGS_TO]-(idNode:Identifier)
                    
                    // Trace lineage
                    OPTIONAL MATCH (idNode)-[:INSTANCE_OF]->(pType:PII)
                    OPTIONAL MATCH (pType)<-[r:HAS_PII]-(source) 
                    
                    // Get Context
                    OPTIONAL MATCH (source)-[:PART_OF_DATA_ASSET]->(da:DataAsset)
                    OPTIONAL MATCH (da)-[:USED_IN]->(pa:ProcessingActivity)
                    
                    RETURN 
                        idNode.value as identifier,
                        pType.type as piiType,
                        source.name as sourceName,
                        source.storage as storageLocation,
                        da.name as assetName,
                        da.id as assetId,
                        da.owner as assetOwner,
                        pa.name as activityName,
                        pa.purpose as purpose,
                        pa.lawfulBasis as lawfulBasis,
                        pa.retentionPeriod as retentionPeriod
                `, { subjectId });
            });

            // Process and Structure Data
            const records = result.records.map(r => ({
                identifier: r.get('identifier'),
                piiType: r.get('piiType'),
                sourceName: r.get('sourceName'),
                storageLocation: r.get('storageLocation'),
                assetName: r.get('assetName'),
                assetId: r.get('assetId'),
                assetOwner: r.get('assetOwner'),
                activityName: r.get('activityName'),
                purpose: r.get('purpose'),
                lawfulBasis: r.get('lawfulBasis'),
                retentionPeriod: r.get('retentionPeriod')
            }));

            return this.structureCollection(records);

        } finally {
            await session.close();
        }
    }

    private structureCollection(records: any[]) {
        // Group by Data Asset
        const assetsMap = new Map<string, any>();

        for (const r of records) {
            if (!r.assetName) continue; // Skip unmapped items for the main asset view

            const assetKey = r.assetId || r.assetName;
            if (!assetsMap.has(assetKey)) {
                assetsMap.set(assetKey, {
                    assetId: r.assetId,
                    name: r.assetName,
                    owner: r.assetOwner,
                    storageLocations: new Set(),
                    piiTypes: new Set(),
                    processingActivities: new Map(), // Keyed by activity name
                });
            }

            const asset = assetsMap.get(assetKey);
            if (r.storageLocation) asset.storageLocations.add(r.storageLocation);
            if (r.piiType) asset.piiTypes.add(r.piiType);

            if (r.activityName) {
                if (!asset.processingActivities.has(r.activityName)) {
                    asset.processingActivities.set(r.activityName, {
                        name: r.activityName,
                        purpose: r.purpose,
                        lawfulBasis: r.lawfulBasis,
                        retentionPeriod: r.retentionPeriod
                    });
                }
            }
        }

        // Convert Sets/Maps to Arrays
        return {
            totalAssets: assetsMap.size,
            assets: Array.from(assetsMap.values()).map(a => ({
                ...a,
                storageLocations: Array.from(a.storageLocations),
                piiTypes: Array.from(a.piiTypes),
                processingActivities: Array.from(a.processingActivities.values())
            })),
            rawRecords: records // Keep raw records for detailed inspection
        };
    }
}
