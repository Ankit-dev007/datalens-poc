import { PIIDetector } from '../src/scanner/piiDetector';

const detector = new PIIDetector();

const testCases = [
    // RULE 1: Aadhaar
    { desc: "Aadhaar Positive", val: "123456789012", col: "aadhaar_number", expected: "aadhaar" },
    { desc: "Aadhaar Invalid Col", val: "123456789012", col: "phone_num", expected: "none" }, // Or phone? 
    // Phone rule: 10 digit starting 6-9. 12 digits is NOT phone. So expected none or maybe bank account check?
    // 12 digits fits bank account length (10-18), strict checking bank account needs col name.
    // "phone_num" is not bank account col. So result should be null/none.

    // RULE 2: Bank Account
    { desc: "Bank Account Positive", val: "123456789012", col: "account_number", expected: "bank_account" },
    { desc: "Bank Account Invalid Col", val: "123456789012", col: "random_id", expected: "none" },

    // Conflict Rule: Column Name Wins
    { desc: "Conflict: Aadhaar num in Bank Col", val: "123456789012", col: "bank_account", expected: "bank_account" },
    // "Bank accounts MUST NEVER be labeled as Aadhaar." (Rule 2)

    // RULE 3: PAN
    { desc: "PAN Positive", val: "ABCDE1234F", col: "tax_id", expected: "pan" },
    { desc: "PAN Invalid Format", val: "ABCDE12345", col: "pan_card", expected: "none" },

    // Default Rules
    { desc: "Phone Positive", val: "9876543210", col: "mobile", expected: "phone" },
    { desc: "Email Positive", val: "test@example.com", col: "email_addr", expected: "email" },
    { desc: "Address Keyword", val: "123 MG Road", col: "addr", expected: "address" },
    { desc: "Name Heuristic", val: "Ankit", col: "first_name", expected: "name" },
    { desc: "DOB Heuristic", val: "1990-01-01", col: "dob_date", expected: "dob" },
];

console.log("Running PII Detector Verification...\n");
let passed = 0;
for (const t of testCases) {
    const result = detector.detect(t.val, t.col);
    const type = result ? result.type : "none";
    const status = type === t.expected ? "PASS" : "FAIL";
    if (status === "PASS") passed++;

    console.log(`[${status}] ${t.desc}`);
    if (status === "FAIL") {
        console.log(`   Input: val="${t.val}", col="${t.col}"`);
        console.log(`   Expected: ${t.expected}`);
        console.log(`   Got: ${type}`);
    }
}

console.log(`\nPassed ${passed}/${testCases.length}`);
if (passed === testCases.length) {
    console.log("ALL TESTS PASSED");
    process.exit(0);
} else {
    console.log("SOME TESTS FAILED");
    process.exit(1);
}
