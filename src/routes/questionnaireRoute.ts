import express from 'express';
import { getNeo4jDriver } from '../config/neo4j';
import { calculateRisk, calculateSensitivity, getCategoryForType } from '../utils/riskCalculator';
import { ActivityService } from '../services/activityService';
import { GraphService } from '../services/GraphService';

const router = express.Router();
const activityService = new ActivityService();
const graphService = new GraphService(); // Helper for general graph ops if needed

// Create Manual Data Item
router.post('/entry', async (req, res) => {
    const {
        name,
        description,
        dataType, // e.g. "Email List for Newsletter"
        category, // DPDP Category
        volume,
        ownerUserId,
        processActivityId,
        protection // 'Encrypted' etc.
    } = req.body;

    if (!name || !category || !processActivityId) {
        return res.status(400).json({ error: "Missing required fields: name, category, processActivityId" });
    }

    const driver = getNeo4jDriver();
    if (!driver) return res.status(500).json({ error: "DB connection failed" });

    const session = driver.session();
    try {
        const risk = calculateRisk({ category, volume, protection });
        const sensitivity = calculateSensitivity(risk, volume);

        // Create Manual Data Item Node
        // We label it :DataItem and :ManualData to distinguish source if needed, or just :DataItem source='manual'
        // Linking to Activity immediately.
        await session.run(
            `
            MATCH (a:ProcessingActivity {activityId: $activityId})
            
            MERGE (d:DataItem {name: $name}) // merge by name? or create new? Let's assume unique names per context or just create
            SET d.description = $description,
                d.type = $dataType,
                d.source = 'manual',
                d.volume = $volume,
                d.protection = $protection,
                d.risk = $risk,
                d.sensitivity = $sensitivity,
                d.updatedAt = datetime()
            
            MERGE (cat:Category {name: $category})
            MERGE (d)-[:BELONGS_TO]->(cat)
            
            MERGE (a)-[:USES]->(d)
            
            // Link Owner
            MERGE (u:User {userId: $ownerId})
            MERGE (d)-[:OWNED_BY]->(u)
            
            RETURN d
            `,
            {
                activityId: processActivityId,
                name,
                description: description || '',
                dataType: dataType || 'Unstructured',
                category: category || getCategoryForType(dataType || ''),
                volume: volume || 0,
                protection: protection || 'Cleartext',
                risk,
                sensitivity,
                ownerId: ownerUserId || 'admin'
            }
        );

        res.json({ success: true, message: "Manual entry created and linked." });
    } catch (e: any) {
        console.error("Manual Entry Error:", e);
        res.status(500).json({ error: e.message });
    } finally {
        await session.close();
    }
});

// Get Questionnaire Templates (Mock)
router.get('/templates', (req, res) => {
    res.json([
        { id: 'marketing', name: 'Marketing Campaign Data Intake' },
        { id: 'hr', name: 'Employee Onboarding Data Intake' }
    ]);
});

export default router;
