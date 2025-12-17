import neo4j, { Driver } from 'neo4j-driver';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.NEO4J_URI || 'neo4j://localhost:7687';
const user = process.env.NEO4J_USER || 'neo4j';
const password = process.env.NEO4J_PASSWORD || '12345678';

let driver: Driver | null = null;

try {
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
} catch (error) {
    console.warn('Failed to initialize Neo4j driver in config. Check configuration.');
}

export const getNeo4jDriver = () => {
    return driver;
};

export const closeNeo4jDriver = async () => {
    if (driver) {
        await driver.close();
    }
};
