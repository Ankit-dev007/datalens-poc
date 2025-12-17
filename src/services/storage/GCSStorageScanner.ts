import { Storage } from '@google-cloud/storage';
import { IStorageScanner, StorageFile } from './IStorageScanner';

export class GCSStorageScanner implements IStorageScanner {
    private storage: Storage;
    private bucket: string;

    constructor(credentials: { bucket: string, serviceAccountJson: string }) {
        this.bucket = credentials.bucket;

        let credsObj;
        try {
            credsObj = JSON.parse(credentials.serviceAccountJson);
        } catch (e) {
            // Handle case where it might be passed as object already if coming from some middleware (unlikely with JSON.stringify from FE)
            // or if it's a file path? Requirement says JSON content.
            console.error("Invalid GCS JSON", e);
            credsObj = {};
        }

        this.storage = new Storage({
            credentials: credsObj
        });
    }

    async listFiles(): Promise<StorageFile[]> {
        const files: StorageFile[] = [];
        try {
            const [gcsFiles] = await this.storage.bucket(this.bucket).getFiles();
            for (const file of gcsFiles) {
                files.push({
                    name: file.name.split('/').pop() || file.name,
                    path: file.name,
                    storageType: 'gcs'
                });
            }
        } catch (e) {
            console.error("GCS list files failed:", e);
        }
        return files;
    }

    async downloadFile(file: StorageFile): Promise<Buffer> {
        const [buffer] = await this.storage.bucket(this.bucket).file(file.path).download();
        return buffer;
    }
}
