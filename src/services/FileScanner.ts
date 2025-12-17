import { IStorageScanner } from './storage/IStorageScanner';
import { LocalStorageScanner } from './storage/LocalStorageScanner';
import { AzureBlobScanner } from './storage/AzureBlobScanner';
import { S3StorageScanner } from './storage/S3StorageScanner';
import { GCSStorageScanner } from './storage/GCSStorageScanner';
import { TextExtractor } from './TextExtractor';
import { PIIPipeline } from './PIIPipeline';
import { Neo4jWriter } from './Neo4jWriter';
import { FileScanRequest, FileScanResult } from '../types';

export class FileScanner {
    private textExtractor: TextExtractor;
    private piiPipeline: PIIPipeline;
    private neo4jWriter: Neo4jWriter;

    constructor() {
        this.textExtractor = new TextExtractor();
        this.piiPipeline = new PIIPipeline();
        this.neo4jWriter = new Neo4jWriter();
    }

    async scan(request: FileScanRequest): Promise<FileScanResult[]> {
        const scanner: IStorageScanner = this.getStorageScanner(request);
        const results: FileScanResult[] = [];

        console.log(`Starting scan for storage: ${request}`);

        try {
            const files = await scanner.listFiles();
            console.log(`Found ${files.length} files to scan.`);

            for (const file of files) {
                try {
                    console.log(`Processing file: ${file.name}`);
                    const buffer = await scanner.downloadFile(file);
                    // Extract Text
                    const text = await this.textExtractor.extractText(buffer, file.name);

                    if (!text || text.trim().length === 0) {
                        console.log(`Skipping empty text for ${file.name}`);
                        continue;
                    }

                    // Detect PII
                    const piiFindings = await this.piiPipeline.detect(text);
                    console.log("PII findings", piiFindings);
                    // Aggregate findings for the result object
                    const aggregatedPii = this.aggregatePii(piiFindings);
                    console.log("Aggregated PII", aggregatedPii);
                    const fileResult: FileScanResult = {
                        file: file.name,
                        pii: aggregatedPii
                    };
                    console.log("File result", fileResult);
                    results.push(fileResult);

                    // Write to Neo4j
                    await this.neo4jWriter.writeFileResults(fileResult, request.storageType);

                } catch (e: any) {
                    console.error(`Error processing file ${file.name}:`, e.message);
                }
            }
        } catch (e: any) {
            console.error('Scan failed:', e.message);
            throw e;
        }

        return results;
    }

    private getStorageScanner(request: FileScanRequest): IStorageScanner {
        switch (request.storageType) {
            case 'local':
                return new LocalStorageScanner(request.credentials);
            case 'azure':
                return new AzureBlobScanner(request.credentials);
            case 's3':
                return new S3StorageScanner(request.credentials);
            case 'gcs':
                return new GCSStorageScanner(request.credentials);
            default:
                throw new Error(`Unsupported storage type: ${request.storageType}`);
        }
    }

    private aggregatePii(findings: any[]): any[] {
        // Group by type and sum counts
        const map = new Map<string, { type: string, category: string, count: number, risk: string }>();

        for (const f of findings) {
            if (f.type === 'none') continue;

            const existing = map.get(f.type);
            const risk = f.risk || 'Low';
            const category = f.category || 'OTHER';

            if (existing) {
                existing.count += (f.count || 1);
            } else {
                map.set(f.type, { type: f.type, category, count: f.count || 1, risk });
            }
        }
        return Array.from(map.values());
    }
}
