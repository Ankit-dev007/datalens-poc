import fs from 'fs/promises';
import path from 'path';
import { IStorageScanner, StorageFile } from './IStorageScanner';

export class LocalStorageScanner implements IStorageScanner {
    private rootPath: string;

    constructor(credentials: { path: string }) {
        this.rootPath = credentials.path;
    }

    async listFiles(): Promise<StorageFile[]> {
        const files: StorageFile[] = [];
        await this.walk(this.rootPath, files);
        return files;
    }

    async downloadFile(file: StorageFile): Promise<Buffer> {
        return await fs.readFile(file.path);
    }

    private async walk(currentPath: string, fileList: StorageFile[]) {
        try {
            const items = await fs.readdir(currentPath, { withFileTypes: true });
            for (const item of items) {
                const fullPath = path.join(currentPath, item.name);
                if (item.isDirectory()) {
                    await this.walk(fullPath, fileList);
                } else {
                    fileList.push({
                        name: item.name,
                        path: fullPath,
                        storageType: 'local'
                    });
                }
            }
        } catch (e) {
            console.error(`Error accessing path ${currentPath}:`, e);
        }
    }
}
