import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'datalens_poc',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

export const getDbConnection = async () => {
    return await mysql.createConnection(dbConfig);
};
