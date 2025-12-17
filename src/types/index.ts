export interface PIIResult {
    field: string;
    type: string;
    category?: string;
    risk?: "High" | "Medium" | "Low";
    source: 'regex' | 'ai';
    confidence: number;
}

export interface TableResult {
    table: string;
    pii: PIIResult[];
}

export interface ScanRequest {
    dbType: 'mysql' | 'postgres' | 'mssql' | 'mongo';
    host?: string;
    port?: string | number;
    username?: string;
    password?: string;
    database?: string;
    // For MongoDB connection string support if needed, but separate fields preferred for UI
    connectionString?: string;
}

export interface ConnectionConfig {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
    connectionString?: string;
    ssl?: boolean;
}

export interface AIResponse {
    is_pii: boolean;
    type: string;
    category?: string;
    risk?: string;
    confidence: number;
}

export interface FileScanResult {
    file: string;
    pii: {
        type: string;
        category?: string;
        count: number;
        risk: "Low" | "Medium" | "High";
    }[];
}

export interface FileScanRequest {
    storageType: 'local' | 'azure' | 's3' | 'gcs';
    credentials: any;
}
