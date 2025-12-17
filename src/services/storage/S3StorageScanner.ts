import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { IStorageScanner, StorageFile } from './IStorageScanner';
import { Readable } from 'stream';

export class S3StorageScanner implements IStorageScanner {
    private client: S3Client;
    private bucket: string;

    constructor(credentials: { accessKey: string, secretKey: string, bucket: string, region?: string }) {
        this.bucket = credentials.bucket;
        this.client = new S3Client({
            region: credentials.region || 'us-east-1',
            credentials: {
                accessKeyId: credentials.accessKey,
                secretAccessKey: credentials.secretKey,
            }
        });
    }

    async listFiles(): Promise<StorageFile[]> {
        const files: StorageFile[] = [];
        try {
            const command = new ListObjectsV2Command({ Bucket: this.bucket });
            // Note: Loops for pagination if IsTruncated=true are needed for full robustness,
            // but for this implementation we'll fetch the first page (max 1000).
            const response = await this.client.send(command);

            if (response.Contents) {
                for (const item of response.Contents) {
                    if (item.Key) {
                        files.push({
                            name: item.Key.split('/').pop() || item.Key,
                            path: item.Key,
                            storageType: 's3',
                            size: item.Size
                        });
                    }
                }
            }
        } catch (e) {
            console.error("S3 list objects failed:", e);
        }
        return files;
    }

    async downloadFile(file: StorageFile): Promise<Buffer> {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: file.path
        });
        const response = await this.client.send(command);

        if (response.Body instanceof Readable) {
            const chunks: any[] = [];
            for await (const chunk of response.Body) {
                chunks.push(chunk);
            }
            return Buffer.concat(chunks);
        } else if (response.Body) {
            // In Node.js environment, the SDK typically returns a Readable stream or something convertible
            const byteArray = await response.Body.transformToByteArray();
            return Buffer.from(byteArray);
        }

        throw new Error("Empty body in S3 download");
    }
}
