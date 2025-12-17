import { AnalystService } from '../src/services/analystService';
import dotenv from 'dotenv';
import { getNeo4jDriver } from '../src/config/neo4j';

dotenv.config();

// Simple instantiation check to verify syntax and imports
async function runTest() {
    try {
        console.log("AnalystService instantiation check...");
        const service = new AnalystService();
        if (service) {
            console.log("Service instantiated successfully.");
        }

        // Optional: Check if we can get the driver (integration check if Neo4j is available)
        const driver = getNeo4jDriver();
        if (driver) {
            console.log("Neo4j driver initialized (Connection status unknown without querying).");
        } else {
            console.log("Neo4j driver NOT initialized.");
        }

    } catch (error) {
        console.error("Test Failed:", error);
        process.exit(1);
    }
}

runTest();
