import { getNeo4jDriver } from '../config/neo4j';

export interface ValidationResult {
    checkName: string;
    severity: 'critical' | 'warning' | 'safe';
    count: number;
    items: any[];
    description: string;
}

export class ComplianceService {

    /**
     * Run all DPDP validation checks
     */
    /**
     * Helper to safely run a check and return an error result if it fails
     */
    private async safeCheck(checkName: string, checkFn: () => Promise<ValidationResult>): Promise<ValidationResult> {
        try {
            return await checkFn();
        } catch (error: any) {
            console.error(`Check '${checkName}' failed:`, error);
            return {
                checkName,
                severity: 'warning',
                count: 0,
                items: [],
                description: `Check failed to execute: ${error.message || 'Unknown error'}`
            };
        }
    }

    /**
     * Run all DPDP validation checks
     */
    async runAllValidations(): Promise<ValidationResult[]> {
        const results: ValidationResult[] = [];

        results.push(await this.safeCheck('Illegal PII', () => this.checkIllegalPII()));
        results.push(await this.safeCheck('Unmapped Assets', () => this.checkUnmappedAssets()));
        results.push(await this.safeCheck('Auto-Linked Assets', () => this.checkAutoLinkedAssets()));
        results.push(await this.safeCheck('Orphan Assets', () => this.checkOrphanAssets()));
        results.push(await this.safeCheck('Email Lineage', () => this.checkEmailLineage()));
        results.push(await this.safeCheck('Aadhaar Processes', () => this.checkAadhaarProcesses()));

        return results;
    }

    /**
     * Check for PII without lawful basis
     */
    async checkIllegalPII(): Promise<ValidationResult> {
        const driver = getNeo4jDriver();
        if (!driver) throw new Error("Neo4j driver not initialized");
        const session = driver.session();

        try {
            const result = await session.run(`
                MATCH (p:PII)<-[]-(source)-[:PART_OF_DATA_ASSET]->(d)-[:USED_IN]->(a:ProcessingActivity)
                WHERE a.permittedPurpose IS NULL OR a.permittedPurpose = ''
                RETURN p.type as piiType, source.name as location, a.name as activity, a.activityId as activityId
            `);

            const items = result.records.map(r => ({
                piiType: r.get('piiType'),
                location: r.get('location'),
                activity: r.get('activity'),
                activityId: r.get('activityId')
            }));

            return {
                checkName: 'PII Without Lawful Basis',
                severity: items.length > 0 ? 'critical' : 'safe',
                count: items.length,
                items,
                description: 'Personal data being processed without a valid lawful basis under DPDP Act'
            };
        } finally {
            await session.close();
        }
    }

    /**
     * Check for unmapped storage entities
     */
    async checkUnmappedAssets(): Promise<ValidationResult> {
        const driver = getNeo4jDriver();
        if (!driver) throw new Error("Neo4j driver not initialized");
        const session = driver.session();

        try {
            const result = await session.executeRead(async tx => {
                return await tx.run(`
                    MATCH (source) WHERE (source:File OR source:Table)
                    OPTIONAL MATCH (source)-[:PART_OF_DATA_ASSET]->(da)
                    OPTIONAL MATCH (source)-[:AUTO_LINKED_TO]->(al)
                    WHERE da IS NULL AND al IS NULL
                    OPTIONAL MATCH (source)-[:HAS_PII]->(p:PII)
                    WITH source, collect(DISTINCT p.type) as piiTypes
                    RETURN source.name as name, labels(source) as type, source.storage as storage, piiTypes
                `);
            });

            const items = result.records.map(r => ({
                name: r.get('name'),
                type: r.get('type').filter((l: string) => l === 'File' || l === 'Table')[0],
                storage: r.get('storage') || 'Unknown',
                piiTypes: r.get('piiTypes') || []
            }));

            // Critical if unmapped items contain sensitive PII
            const hasSensitivePII = items.some(item =>
                item.piiTypes.some((pii: string) => ['AADHAAR', 'PAN', 'PASSPORT', 'BANK_ACCOUNT'].includes(pii))
            );

            return {
                checkName: 'Unmapped Storage Entities',
                severity: hasSensitivePII ? 'critical' : (items.length > 0 ? 'warning' : 'safe'),
                count: items.length,
                items,
                description: 'Discovered files/tables not linked to any Data Asset'
            };
        } finally {
            await session.close();
        }
    }

    /**
     * Check for auto-linked items pending review
     */
    async checkAutoLinkedAssets(): Promise<ValidationResult> {
        const driver = getNeo4jDriver();
        if (!driver) throw new Error("Neo4j driver not initialized");
        const session = driver.session();

        try {
            const result = await session.run(`
                MATCH (source)-[r:AUTO_LINKED_TO]->(d:DataAsset)
                RETURN source.name as entity, d.name as suggestedAsset, r.confidence as confidence, r.method as method
            `);

            const items = result.records.map(r => ({
                entity: r.get('entity'),
                suggestedAsset: r.get('suggestedAsset'),
                confidence: r.get('confidence'),
                method: r.get('method')
            }));

            return {
                checkName: 'Auto-Linked Items Pending Review',
                severity: 'warning',
                count: items.length,
                items,
                description: 'Automatically suggested links that need manual confirmation'
            };
        } finally {
            await session.close();
        }
    }

    /**
     * Check for Orphan Assets (Data Assets not linked to any Processing Activity)
     */
    async checkOrphanAssets(): Promise<ValidationResult> {
        const driver = getNeo4jDriver();
        if (!driver) throw new Error("Neo4j driver not initialized");
        const session = driver.session();

        try {
            const result = await session.executeRead(async tx => {
                return await tx.run(`
                    MATCH (d:DataAsset)
                    OPTIONAL MATCH (d)-[:USED_IN]->(pa:ProcessingActivity)
                    WHERE pa IS NULL
                    RETURN d.id as id, d.name as name, d.ownerUserId as owner
                `);
            });

            const items = result.records.map(r => ({
                id: r.get('id'),
                name: r.get('name'),
                owner: r.get('owner')
            }));

            return {
                checkName: 'Orphan Data Assets',
                severity: items.length > 0 ? 'warning' : 'safe',
                count: items.length,
                items,
                description: 'Data Assets that are not linked to any Processing Activity (Traceability Gap)'
            };
        } finally {
            await session.close();
        }
    }

    /**
     * Trace email PII lineage
     */
    async checkEmailLineage(): Promise<ValidationResult> {
        const driver = getNeo4jDriver();
        if (!driver) throw new Error("Neo4j driver not initialized");
        const session = driver.session();

        try {
            const result = await session.run(`
                MATCH (p:PII {type: 'EMAIL'})<-[:HAS_PII]-(f:File)
                MATCH (f)-[:PART_OF_DATA_ASSET]->(d:DataAsset)
                MATCH (d)-[:USED_IN]->(a:ProcessingActivity)
                RETURN f.name as file, d.name as asset, a.purpose as purpose, a.ownerUserId as owner
            `);

            const items = result.records.map(r => ({
                file: r.get('file'),
                asset: r.get('asset'),
                purpose: r.get('purpose'),
                owner: r.get('owner')
            }));

            return {
                checkName: 'Email PII Traceability',
                severity: 'safe',
                count: items.length,
                items,
                description: 'Complete traceability chain for Email PII: Storage → Asset → Purpose'
            };
        } finally {
            await session.close();
        }
    }

    /**
     * Check which processes use Aadhaar
     */
    async checkAadhaarProcesses(): Promise<ValidationResult> {
        const driver = getNeo4jDriver();
        if (!driver) throw new Error("Neo4j driver not initialized");
        const session = driver.session();

        try {
            const result = await session.run(`
                MATCH (p:PII {type: 'AADHAAR'})<-[]-(source)
                MATCH (source)-[:PART_OF_DATA_ASSET]->(d:DataAsset)
                MATCH (d)-[:USED_IN]->(a:ProcessingActivity)
                RETURN DISTINCT a.name as process, a.businessProcess as businessProcess, a.lawfulBasis as lawfulBasis
            `);

            const items = result.records.map(r => ({
                process: r.get('process'),
                businessProcess: r.get('businessProcess'),
                lawfulBasis: r.get('lawfulBasis')
            }));

            // Critical if Aadhaar used without lawful basis
            const missingLawfulBasis = items.some(item => !item.lawfulBasis || item.lawfulBasis === '');

            return {
                checkName: 'Aadhaar Processing Activities',
                severity: missingLawfulBasis ? 'critical' : 'safe',
                count: items.length,
                items,
                description: 'Processing activities that handle Aadhaar numbers (requires strict lawful basis)'
            };
        } finally {
            await session.close();
        }
    }

    /**
     * Get PII lineage for a specific PII type
     */
    async getPIILineage(piiType: string): Promise<any[]> {
        const driver = getNeo4jDriver();
        if (!driver) throw new Error("Neo4j driver not initialized");
        const session = driver.session();

        try {
            const result = await session.run(`
                MATCH (p:PII {type: $piiType})<-[:HAS_PII]-(source)
                OPTIONAL MATCH (source)-[:PART_OF_DATA_ASSET]->(d:DataAsset)
                OPTIONAL MATCH (d)-[:USED_IN]->(a:ProcessingActivity)
                RETURN 
                    p.type as piiType,
                    source.name as storage,
                    labels(source) as storageType,
                    d.name as asset,
                    a.name as activity,
                    a.purpose as purpose,
                    a.lawfulBasis as lawfulBasis
            `, { piiType: piiType.toUpperCase() });

            return result.records.map(r => ({
                piiType: r.get('piiType'),
                storage: r.get('storage'),
                storageType: r.get('storageType')?.filter((l: string) => l === 'File' || l === 'Table')[0] || 'Unknown',
                asset: r.get('asset'),
                activity: r.get('activity'),
                purpose: r.get('purpose'),
                lawfulBasis: r.get('lawfulBasis'),
                complete: !!(r.get('asset') && r.get('activity'))
            }));
        } finally {
            await session.close();
        }
    }

    /**
     * Get summary statistics
     */
    async getComplianceSummary(): Promise<any> {
        const driver = getNeo4jDriver();
        if (!driver) {
            console.error("ComplianceService: Neo4j driver not initialized");
            return this.getDefaultSummary();
        }
        const session = driver.session();

        try {
            // Use allSettled to prevent one query failure from crashing the whole dashboard
            const results = await Promise.allSettled([
                session.run(`MATCH (p:PII) RETURN count(p) as count`),
                session.run(`MATCH (s) WHERE (s:File OR s:Table) 
                             OPTIONAL MATCH (s)-[:PART_OF_DATA_ASSET]->(da)
                             WHERE da IS NOT NULL
                             RETURN count(s) as count`),
                session.run(`MATCH (s) WHERE (s:File OR s:Table) 
                             OPTIONAL MATCH (s)-[:PART_OF_DATA_ASSET]->(da)
                             OPTIONAL MATCH (s)-[:AUTO_LINKED_TO]->(al)
                             WHERE da IS NULL AND al IS NULL
                             RETURN count(s) as count`),
                session.run(`MATCH ()-[r:AUTO_LINKED_TO]->() RETURN count(r) as count`),
                session.run(`
                    MATCH (p:PII)<-[:HAS_PII]-(s)-[:PART_OF_DATA_ASSET]->(d:DataAsset)-[:USED_IN]->(a:ProcessingActivity)
                    WHERE a.lawfulBasis IS NOT NULL AND a.lawfulBasis <> ''
                    RETURN count(DISTINCT s) as count
                `)
            ]);

            const getCount = (index: number) => {
                const res = results[index];
                if (res.status === 'fulfilled' && res.value.records.length > 0) {
                    try {
                        return res.value.records[0].get('count').toNumber();
                    } catch (e) {
                        return 0;
                    }
                }
                return 0;
            };

            return {
                totalPIIInstances: getCount(0),
                mappedStorage: getCount(1),
                unmappedStorage: getCount(2),
                autoLinkedPending: getCount(3),
                completeTraceabilityChains: getCount(4)
            };
        } catch (error) {
            console.error("Critical error in getComplianceSummary:", error);
            return this.getDefaultSummary();
        } finally {
            await session.close();
        }
    }

    private getDefaultSummary() {
        return {
            totalPIIInstances: 0,
            mappedStorage: 0,
            unmappedStorage: 0,
            autoLinkedPending: 0,
            completeTraceabilityChains: 0
        };
    }
}
