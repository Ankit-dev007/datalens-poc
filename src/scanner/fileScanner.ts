import fs from 'fs';
import path from 'path';
import { BlobServiceClient } from '@azure/storage-blob';
import { TextExtractor } from './textExtractor';
import { FileAnalystService } from '../services/fileAnalystService';
import { FileNeo4jWriter } from './fileNeo4jWriter';
import dotenv from 'dotenv';

dotenv.config();

export class FileScanner {
    private textExtractor: TextExtractor;
    private fileAnalyst: FileAnalystService;
    private neo4jWriter: FileNeo4jWriter;

    constructor() {
        this.textExtractor = new TextExtractor();
        this.fileAnalyst = new FileAnalystService();
        this.neo4jWriter = new FileNeo4jWriter();
    }

    async scanLocalFolder(folderPath: string, scanId: string): Promise<void> {
        console.log(`[Scan:${scanId}] Starting local scan: ${folderPath}`);

        try {
            await this.walkFolder(folderPath, scanId);
            console.log(`[Scan:${scanId}] Local scan completed.`);
        } catch (error) {
            console.error(`[Scan:${scanId}] Error during local scan:`, error);
        }
    }

    private async walkFolder(currentPath: string, scanId: string) {
        const files = await fs.promises.readdir(currentPath, { withFileTypes: true });

        for (const file of files) {
            const fullPath = path.join(currentPath, file.name);

            if (file.isDirectory()) {
                await this.neo4jWriter.writeCypherQueries([
                    `MERGE (s:Storage {type: "local"}) MERGE (f:Folder {path: "${fullPath.replace(/\\/g, '/')}"}) MERGE (s)-[:HAS_FOLDER]->(f)`
                ]);
                await this.walkFolder(fullPath, scanId);
            } else {
                await this.processFile(fullPath, file.name, 'local', scanId);
            }
        }
    }

    async scanAzureBlob(containerName: string, prefix: string = '', scanId: string): Promise<void> {
        console.log(`[Scan:${scanId}] Starting Azure Blob scan. Container: ${containerName}`);

        const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
        if (!connStr) {
            console.error("AZURE_STORAGE_CONNECTION_STRING missing.");
            return;
        }

        try {
            const blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
            const containerClient = blobServiceClient.getContainerClient(containerName);

            // Ensure container exists
            // await containerClient.createIfNotExists();

            for await (const blob of containerClient.listBlobsFlat({ prefix })) {
                console.log(`[Scan:${scanId}] Found blob: ${blob.name}`);

                const blockBlobClient = containerClient.getBlockBlobClient(blob.name);
                const downloadBlockBlobResponse = await blockBlobClient.download(0);

                if (downloadBlockBlobResponse.readableStreamBody) {
                    const chunks: any[] = [];
                    for await (const chunk of downloadBlockBlobResponse.readableStreamBody) {
                        chunks.push(chunk);
                    }
                    const buffer = Buffer.concat(chunks);

                    // Temp save to process? Or pass buffer directly.
                    // TextExtractor needs buffer.
                    // We treat the blob path as "filePath"
                    await this.processBuffer(buffer, blob.name, blockBlobClient.url, 'azure_blob', scanId);
                }
            }
            console.log(`[Scan:${scanId}] Azure scan completed.`);
        } catch (error) {
            console.error(`[Scan:${scanId}] Azure scan failed:`, error);
        }
    }

    private async processFile(filePath: string, fileName: string, storageType: string, scanId: string) {
        try {
            const buffer = await fs.promises.readFile(filePath);
            await this.processBuffer(buffer, fileName, filePath, storageType, scanId);
        } catch (err: any) {
            console.error(`Error reading file ${filePath}: ${err.message}`);
        }
    }

    private async processBuffer(buffer: Buffer, fileName: string, filePath: string, storageType: string, scanId: string) {
        const text = await this.textExtractor.extractText(buffer, fileName);

        if (!text || text.trim().length === 0) {
            // console.log(`Skipping empty/unsupported file: ${fileName}`);
            return;
        }

        const analysis = await this.fileAnalyst.analyzeFile(fileName, filePath, storageType, text);

        // Add scanId to relationships? The requirement asks to track ScanId but schema provided doesn't have Scan node.
        // We can add a property to File? SET f.lastScanId = "..."
        // Or just log it.
        // The requirements say "Nodes: (:File {name, path, extension, size, scannedAt})".
        // Let's stick to the analyst service output mainly, but maybe inject scannedAt/scanId if needed.
        // Analyst service generates the Cypher mapping.

        await this.neo4jWriter.writeCypherQueries(analysis.neo4j_mapping);
        console.log(`Processed ${fileName} - PII found: ${analysis.pii_detected.length}`);
    }
}
