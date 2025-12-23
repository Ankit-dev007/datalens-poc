import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    user: process.env.PG_USER || 'sujosu',
    password: process.env.PG_PASSWORD || 'Sujosu@2025',
    database: process.env.PG_DATABASE || 'datalens_poc',
    port: parseInt(process.env.PG_PORT || '5432'),
});

export const query = (text: string, params?: any[]) => pool.query(text, params);
