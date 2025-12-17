import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import { IStorageScanner, StorageFile } from './IStorageScanner';

export class AzureBlobScanner implements IStorageScanner {
    private containerClient: any;
    private accountName: string;

    constructor(credentials: { accountName: string, containerName: string, accessKey: string }) {
        this.accountName = credentials.accountName;
        // Construct connection string or use credential object
        // For simplicity using SharedKeyCredential if account/key provided
        // Or connection string if provided separately. 
        // Based on plan: accountName, containerName, accessKey => SharedKey

        const sharedKeyCredential = new StorageSharedKeyCredential(credentials.accountName, credentials.accessKey);
        console.log("Shared key credential", sharedKeyCredential);
        const blobServiceClient = new BlobServiceClient(
            `https://${credentials.accountName}.blob.core.windows.net`,
            sharedKeyCredential
        );
        this.containerClient = blobServiceClient.getContainerClient(credentials.containerName);
    }

    async listFiles(): Promise<StorageFile[]> {
        const files: StorageFile[] = [];
        try {
            for await (const blob of this.containerClient.listBlobsFlat()) {
                files.push({
                    name: blob.name,
                    path: blob.name, // In blob, path is the blob name
                    storageType: 'azure',
                });
            }
        } catch (e) {
            console.error("Azure list blobs failed:", e);
        }
        return files;
    }

    async downloadFile(file: StorageFile): Promise<Buffer> {
        const blockBlobClient = this.containerClient.getBlockBlobClient(file.path);
        const downloadBlockBlobResponse = await blockBlobClient.download(0);

        if (downloadBlockBlobResponse.readableStreamBody) {
            const chunks: any[] = [];
            for await (const chunk of downloadBlockBlobResponse.readableStreamBody) {
                chunks.push(chunk);
            }
            return Buffer.concat(chunks);
        }
        throw new Error("Empty body in blob download");
    }
}
