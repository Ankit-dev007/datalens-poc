import { ActivityService } from '../services/activityService';
import { DataAssetService } from '../services/dataAssetService';
import { DataSubjectService } from '../services/dataSubjectService';
import { DsarService } from '../services/dsarService';
import { SubjectPiiLinkService } from '../services/subjectPiiLinkService';
import { Neo4jWriter } from '../services/Neo4jWriter';
import { getNeo4jDriver } from '../config/neo4j';
import { pool } from '../config/pg';

async function seed() {
    console.log("🌱 Starting Seeding Process: 'Ramesh Kumar' Scenario");

    try {
        // Services
        const activityService = new ActivityService();
        const assetService = new DataAssetService();
        const subjectService = new DataSubjectService();
        const dsarService = new DsarService();
        const linkService = new SubjectPiiLinkService();
        const neoWriter = new Neo4jWriter();

        // 1. Create Processing Activity
        console.log("1. Creating Processing Activity...");
        const activity = await activityService.saveActivity({
            name: 'Collect Employee KYC',
            businessProcess: 'Employee Lifecycle',
            ownerUserId: 'admin',
            status: 'Active',
            purpose: 'Employment Verification',
            permittedPurpose: 'LegalObligation', // Guardrail Trigger
            retentionPeriod: '10 Years',
            personalDataTypes: ['Email', 'Phone', 'Aadhaar', 'PAN'],
            sensitivity: 'Critical',
            riskScore: 75
        });
        console.log(`✅ Activity Created: ${activity.name}`);

        // 2. Create Data Asset
        console.log("2. Creating Data Asset...");
        const asset = await assetService.createDataAsset({
            name: 'Employee KYC Records',
            description: 'PDF scans of employee KYC',
            dataType: 'PDF Documents',
            dpdpCategory: 'Confidential',
            ownerUserId: 'admin',
            processingActivityId: activity.activityId,
            protectionMethod: 'Encrypted',
            personalDataCategories: ['Financial', 'Identity']
        });
        console.log(`✅ Asset Created: ${asset.name}`);

        // 3. Simulate File Discovery (Mock Scan)
        console.log("3. Simulating File Discovery...");
        await neoWriter.writeFileResults({
            file: 'employee_kyc_records.pdf',
            pii: [
                { type: 'EMAIL', count: 5, risk: 'High' },
                { type: 'PHONE', count: 5, risk: 'Medium' },
                { type: 'AADHAAR', count: 1, risk: 'High' },
                { type: 'PAN', count: 1, risk: 'High' }
            ]
        }, 'AzureBlob');
        console.log(`✅ File Discovered in Neo4j`);

        // 4. Link File to Asset
        console.log("4. Linking File to Data Asset...");
        await assetService.linkDiscoveryToAsset(asset.id, 'employee_kyc_records.pdf', 'File');
        console.log(`✅ File Linked to Asset`);

        // 5. Create Data Subject
        console.log("5. Creating Data Subject...");
        // Check if exists first to avoid dupes purely for this script's idempotency helper logic
        const existingSubjects = await subjectService.getAllSubjects();
        let subject = existingSubjects.find(s => s.email === 'ramesh.kumar@company.com');

        if (!subject) {
            subject = await subjectService.createDataSubject({
                displayName: 'Ramesh Kumar',
                email: 'ramesh.kumar@company.com',
                phone: '9876543210'
            });
            console.log(`✅ Subject Created: ${subject.display_name}`);
        } else {
            console.log(`ℹ️ Subject already exists: ${subject.display_name}`);
        }

        // 6. Link Identifiers (Traceability)
        console.log("6. Linking Identifiers...");
        // Use the new service directly as if called by the UI
        await linkService.linkPiiToDataSubject(subject!.id, 'EMAIL', 'ramesh.kumar@company.com');
        // Link phone too
        await linkService.linkPiiToDataSubject(subject!.id, 'PHONE', '9876543210');
        console.log(`✅ Identifiers Linked`);

        // 7. Create DSAR Request
        console.log("7. Creating DSAR Erasure Request...");
        const request = await dsarService.createRequest({
            subjectId: subject!.id,
            type: 'ERASURE',
            description: 'Please delete my data.',
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        });
        console.log(`✅ DSAR Created: ${request.id}`);

        console.log("\n🎉 Seeding Complete! The 'Ramesh Kumar' scenario is ready for verification.");

    } catch (e) {
        console.error("❌ Seeding Failed:", e);
    } finally {
        // Cleanup connections
        await pool.end();
        const driver = getNeo4jDriver();
        if (driver) await driver.close();
    }
}

// Execute
seed();
