import { FileScanner } from '../src/scanner/fileScanner';
import path from 'path';
import fs from 'fs';

async function runVerification() {
    console.log("Starting FileScanner Verification...");

    const scanner = new FileScanner();

    // Create a dummy local folder with a file
    const testDir = path.join(__dirname, 'temp_test_scan');
    const testFile = path.join(testDir, 'test_doc.txt');

    if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir);
    }

    // Write sample text containing Aadhaar (with keyword)
    const textContent = "Confidential: My Aadhaar number is 987654321012.";
    fs.writeFileSync(testFile, textContent);

    console.log(`Created test file at: ${testFile}`);

    try {
        // Trigger Local Scan
        console.log("Triggering scanLocalFolder...");
        await scanner.scanLocalFolder(testDir, "test_scan_001");
        console.log("scanLocalFolder returned.");

        // In a real test we would verify Neo4j, but here we check logs and execution flow.
        // We rely on the log "Processed ... - PII found: ..."

    } catch (error) {
        console.error("Verification failed:", error);
    } finally {
        // Cleanup
        if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
        if (fs.existsSync(testDir)) fs.rmdirSync(testDir);
        console.log("Cleanup done.");
    }
}

runVerification();
