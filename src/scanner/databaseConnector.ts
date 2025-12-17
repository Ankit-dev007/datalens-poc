import mysql from 'mysql2/promise';
import { Client } from 'pg';
import sql from 'mssql';
import { MongoClient, Db } from 'mongodb';
import { ScanRequest } from '../types';

export type DBConnection = mysql.Connection | Client | sql.ConnectionPool | Db;

export class DatabaseConnector {
    private activeConnection: DBConnection | null = null;
    private connectionType: string | null = null;
    private mongoClient: MongoClient | null = null;

    async connect(config: ScanRequest): Promise<DBConnection> {
        this.connectionType = config.dbType;

        try {
            switch (config.dbType) {
                case 'mysql':
                    const mysqlConn = await mysql.createConnection({
                        host: config.host,
                        port: Number(config.port) || 3306,
                        user: config.username,
                        password: config.password,
                        database: config.database
                    });
                    this.activeConnection = mysqlConn;
                    return mysqlConn;

                case 'postgres':
                    const pgClient = new Client({
                        host: config.host,
                        port: Number(config.port) || 5432,
                        user: config.username,
                        password: config.password,
                        database: config.database
                    });
                    await pgClient.connect();
                    this.activeConnection = pgClient;
                    return pgClient;

                case 'mssql':
                    const mssqlConfig = {
                        user: config.username!,
                        password: config.password!,
                        server: config.host!,
                        port: Number(config.port) || 1433,
                        database: config.database!,
                        options: {
                            encrypt: true,
                            trustServerCertificate: true
                        }
                    };
                    const mssqlPool = await sql.connect(mssqlConfig);
                    this.activeConnection = mssqlPool;
                    return mssqlPool;

                case 'mongo':
                    const url = config.connectionString || `mongodb://${config.username}:${config.password}@${config.host}:${config.port}/${config.database}?authSource=admin`;
                    const finalUrl = config.connectionString
                        ? config.connectionString
                        : `mongodb://${config.host}:${config.port}`;

                    this.mongoClient = new MongoClient(url);
                    await this.mongoClient.connect();
                    const db = this.mongoClient.db(config.database);
                    this.activeConnection = db;
                    return db;

                default:
                    throw new Error(`Unsupported database type: ${config.dbType}`);
            }
        } catch (error) {
            console.error(`Failed to connect to ${config.dbType}:`, error);
            throw error;
        }
    }

    async close() {
        if (!this.activeConnection) return;

        try {
            switch (this.connectionType) {
                case 'mysql':
                    await (this.activeConnection as mysql.Connection).end();
                    break;
                case 'postgres':
                    await (this.activeConnection as Client).end();
                    break;
                case 'mssql':
                    await (this.activeConnection as sql.ConnectionPool).close();
                    break;
                case 'mongo':
                    if (this.mongoClient) {
                        await this.mongoClient.close();
                    }
                    break;
            }
        } catch (error) {
            console.error('Error closing connection:', error);
        } finally {
            this.activeConnection = null;
            this.mongoClient = null;
        }
    }
}
