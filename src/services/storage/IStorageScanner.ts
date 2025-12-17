export interface StorageFile {
    name: string;
    path: string; // Full path or URL
    storageType: 'local' | 'azure' | 's3' | 'gcs';
    buffer?: Buffer; // Optional: Some lists might not download immediately
    size?: number;
}

export interface IStorageScanner {
    listFiles(): Promise<StorageFile[]>;
    downloadFile(file: StorageFile): Promise<Buffer>;
}
