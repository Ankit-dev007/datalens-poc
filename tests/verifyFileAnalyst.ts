import { FileAnalystService } from '../src/services/fileAnalystService';

// We can't easily mock openai without jest or complex setups in this environment.
// So we rely on the fact that strict regex rules DO NOT utilize OpenAI.
// We will test strict rules.
// If OpenAI is not configured, the service logs a warning and proceeds with regex only, which is fine for this test.

async function runTest() {
    console.log("Running FileAnalystService Verification (Regex Only)...");
    const analyst = new FileAnalystService();

    // TEST 1: Bank Account (Should detect bank_account, NOT aadhaar)
    const bankText = "Please transfer to my account 123456789012 at HDFC bank.";
    const bankResult = await analyst.analyzeFile("bank_details.txt", "/local/bank.txt", "local", bankText);

    // Debug log
    // console.log("Bank Result:", JSON.stringify(bankResult, null, 2));

    const hasBank = bankResult.pii_detected.some(p => p.type === 'bank_account');
    const hasAadhaarInBank = bankResult.pii_detected.some(p => p.type === 'aadhaar'); // Should be false

    console.log(`[TEST 1] Bank Account Detection: ${hasBank ? 'PASS' : 'FAIL'}`);
    console.log(`[TEST 1] No False Aadhaar: ${!hasAadhaarInBank ? 'PASS' : 'FAIL'}`);

    // TEST 2: Aadhaar (Should detect aadhaar)
    const aadhaarText = "My Aadhaar number is 123456789012.";
    const aadhaarResult = await analyst.analyzeFile("id_proof.txt", "/local/id.txt", "local", aadhaarText);

    const hasAadhaar = aadhaarResult.pii_detected.some(p => p.type === 'aadhaar');
    console.log(`[TEST 2] Aadhaar Detection: ${hasAadhaar ? 'PASS' : 'FAIL'}`);

    // TEST 3: PAN (Should detect PAN)
    const panText = "My PAN is ABCDE1234F.";
    const panResult = await analyst.analyzeFile("tax.txt", "/local/tax.txt", "local", panText);

    const hasPan = panResult.pii_detected.some(p => p.type === 'pan');
    console.log(`[TEST 3] PAN Detection: ${hasPan ? 'PASS' : 'FAIL'}`);

    // Verify format
    if (bankResult.neo4j_mapping.length > 0 && bankResult.recommendations.length > 0) {
        console.log("[TEST 4] JSON Structure: PASS");
    } else {
        console.log("[TEST 4] JSON Structure: FAIL");
    }
}

runTest();
