import { PIIDetector } from './piiDetector';
import { AIPIIDetector } from './aiPIIDetector';
import { TableResult, PIIResult } from '../types';
import { RowDataPacket } from 'mysql2';
import mysql from 'mysql2/promise';
import { Client } from 'pg';
import sql from 'mssql';

export class DBScanner {
    private piiDetector: PIIDetector;
    private aiDetector: AIPIIDetector;

    constructor() {
        this.piiDetector = new PIIDetector();
        this.aiDetector = new AIPIIDetector();
    }

    async scan(connection: mysql.Connection | Client | sql.ConnectionPool, dbType: string): Promise<TableResult[]> {
        const results: TableResult[] = [];

        try {
            const tables = await this.getTables(connection, dbType);

            for (const table of tables) {
                console.log(`Scanning table: ${table}`);
                const tableResult: TableResult = { table, pii: [] };

                const columns = await this.getColumns(connection, dbType, table);
                const rows = await this.getSampleData(connection, dbType, table, columns);

                for (const column of columns) {
                    let detectedPII: PIIResult | null = null;

                    for (const row of rows) {
                        const value = String(row[column] || row[column.toLowerCase()] || ''); // Handle case sensitivity
                        if (!value) continue;

                        // Regex Detection
                        const regexResult = this.piiDetector.detect(value, column);
                        if (regexResult) {
                            detectedPII = regexResult;
                            break;
                        }

                        // AI Detection
                        const aiResult = await this.aiDetector.detect(value, column);
                        if (aiResult.is_pii) {
                            detectedPII = {
                                field: column,
                                type: aiResult.type,
                                category: aiResult.category,
                                risk: aiResult.risk as "High" | "Medium" | "Low",
                                source: 'ai',
                                confidence: aiResult.confidence
                            };
                            break;
                        }
                    }

                    if (detectedPII && detectedPII.type !== 'none') {
                        tableResult.pii.push(detectedPII);
                    }
                }

                if (tableResult.pii.length > 0) {
                    results.push(tableResult);
                }
            }

            return results;

        } catch (error) {
            console.error('Scan failed:', error);
            throw error;
        }
    }

    private async getTables(conn: any, dbType: string): Promise<string[]> {
        switch (dbType) {
            case 'mysql':
                const [rows] = await conn.query('SHOW TABLES');
                return (rows as RowDataPacket[]).map((row: any) => Object.values(row)[0] as string);
            case 'postgres':
                const res = await conn.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
                return res.rows.map((r: any) => r.table_name);
            case 'mssql':
                const result = await conn.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'");
                return result.recordset.map((r: any) => r.TABLE_NAME);
            default:
                throw new Error(`Unsupported DB type for SQL scan: ${dbType}`);
        }
    }

    private async getColumns(conn: any, dbType: string, table: string): Promise<string[]> {
        switch (dbType) {
            case 'mysql':
                const [cols] = await conn.query(`SHOW COLUMNS FROM ${table}`);
                return (cols as RowDataPacket[]).map((c: any) => c.Field);
            case 'postgres':
                const res = await conn.query(`SELECT column_name FROM information_schema.columns WHERE table_name = '${table}'`);
                return res.rows.map((r: any) => r.column_name);
            case 'mssql':
                const result = await conn.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${table}'`);
                return result.recordset.map((r: any) => r.COLUMN_NAME);
            default:
                return [];
        }
    }

    private async getSampleData(conn: any, dbType: string, table: string, columns: string[]): Promise<any[]> {
        // Warning: This is vulnerable to SQL injection if table names are unchecked. 
        // For POC we assume internal usage.
        try {
            switch (dbType) {
                case 'mysql':
                    const [rows] = await conn.query(`SELECT * FROM ${table} LIMIT 10`);
                    return rows as any[];
                case 'postgres':
                    const res = await conn.query(`SELECT * FROM "${table}" LIMIT 10`);
                    return res.rows;
                case 'mssql':
                    const result = await conn.query(`SELECT TOP 10 * FROM ${table}`);
                    return result.recordset;
                default:
                    return [];
            }
        } catch (e) {
            console.warn(`Could not fetch data for table ${table}`, e);
            return [];
        }
    }
}
