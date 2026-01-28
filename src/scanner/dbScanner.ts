import { PIIDetector } from './piiDetector';
import { AIPIIDetector } from './aiPIIDetector';
import { TableResult, PIIResult } from '../types';
import { RowDataPacket } from 'mysql2';
import mysql from 'mysql2/promise';
import { Client } from 'pg';
import sql from 'mssql';

import { RuleEngine } from './ruleEngine';
import { getCategoryForType, calculateRisk } from '../utils/riskCalculator';

import { ConfirmationService } from '../services/confirmationService';

export class DBScanner {
    private piiDetector: PIIDetector;
    private aiDetector: AIPIIDetector;
    private ruleEngine: RuleEngine;
    private confirmationService: ConfirmationService;

    constructor() {
        this.piiDetector = new PIIDetector();
        this.aiDetector = new AIPIIDetector();
        this.ruleEngine = new RuleEngine();
        this.confirmationService = new ConfirmationService();
    }

    async scan(connection: mysql.Connection | Client | sql.ConnectionPool, dbType: string, databaseName?: string): Promise<TableResult[]> {
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
                    const cleanValue = rows[0] ? String(rows[0][column] || rows[0][column.toLowerCase()] || '') : '';

                    // 1. Check User Rules FIRST
                    // We only need column name for rule check, not value
                    const ruleResult = await this.ruleEngine.checkRule(column);
                    if (ruleResult) {
                        if (ruleResult.is_pii) {
                            // Use a helper or just construct object

                            const category = getCategoryForType(ruleResult.type);
                            const risk = calculateRisk(category);

                            detectedPII = {
                                field: column,
                                type: ruleResult.type,
                                category,
                                risk,
                                source: 'ai', // Technically user_rule, but compatible with UI
                                confidence: 1.0,
                                status: 'confirmed',
                                reason: 'User defined rule'
                            };
                            tableResult.pii.push(detectedPII);
                            continue; // Skip further checks
                        } else {
                            // Rule says NOT PII -> Skip
                            continue;
                        }
                    }

                    // 2. Scan Rows (Sample)
                    for (const row of rows) {
                        const value = String(row[column] || row[column.toLowerCase()] || ''); // Handle case sensitivity
                        if (!value) continue;

                        // Regex Detection
                        const regexResult = this.piiDetector.detect(value, column);
                        if (regexResult) {
                            detectedPII = regexResult;
                            break; // Found regex match (high confidence implicitly), stop checking rows
                        }

                        // AI Detection
                        const aiResult = await this.aiDetector.detect(value, column);

                        // CASE A: Discarded (Low Confidence)
                        if (aiResult.status === 'discarded') {
                            // DO NOTHING.
                            continue;
                        }

                        // CASE B: Needs Confirmation (Medium Confidence)
                        if (aiResult.status === 'needs_confirmation') {
                            // Create Pending Request in Postgres
                            // Check if request already exists? Ideally yes, but for now insert.
                            // To avoid spamming requests for every row, we break after creating one.
                            await this.confirmationService.createRequest({
                                source_type: 'database',
                                source_subtype: dbType, // 'mysql', 'postgres', etc.
                                database_name: databaseName, // We might not have this context easily in scan(), but can default.
                                table_name: table,
                                column_name: column,
                                suggested_pii_type: aiResult.type,
                                confidence: aiResult.confidence,
                                reason: aiResult.reason || 'AI Medium Confidence'
                            });
                            console.log(`⚠️ Created confirmation request for ${table}.${column}`);

                            // We do NOT add to tableResult.pii because it's not yet PII
                            break;
                        }

                        // CASE C: Auto-Classified PII (High Confidence)
                        if (aiResult.is_pii) {
                            detectedPII = {
                                field: column,
                                type: aiResult.type,
                                category: aiResult.category,
                                risk: aiResult.risk as "High" | "Medium" | "Low",
                                source: 'ai',
                                confidence: aiResult.confidence,
                                status: aiResult.status, // auto_classified or confirmed
                                reason: aiResult.reason
                            };
                            break; // Found AI match, stop checking rows
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
