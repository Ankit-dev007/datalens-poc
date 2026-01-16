import express from 'express';
import { DataSubjectService } from '../services/dataSubjectService';

const router = express.Router();
const service = new DataSubjectService();

// Create new Data Subject
router.post('/', async (req, res) => {
    try {
        const { displayName, email, phone } = req.body;
        if (!displayName) {
            return res.status(400).json({ error: 'Display name is required' });
        }
        const subject = await service.createDataSubject({ displayName, email, phone });
        res.json(subject);
    } catch (error: any) {
        console.error("Create Subject Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// List all Subjects
router.get('/', async (req, res) => {
    try {
        const subjects = await service.getAllSubjects();
        res.json(subjects);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get Subject Details with Lineage
router.get('/:id', async (req, res) => {
    try {
        const details = await service.getSubjectDetails(req.params.id);
        res.json(details);
    } catch (error: any) {
        console.error("Get Subject Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Add Identifier to Subject
router.post('/:id/identifiers', async (req, res) => {
    try {
        const { value, piiType } = req.body;
        if (!value || !piiType) {
            return res.status(400).json({ error: 'Value and piiType are required' });
        }
        await service.addIdentifier(req.params.id, value, piiType);
        res.json({ success: true, message: 'Identifier linked successfully' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Link Identifier to Data Subject (Manual PII Linking)
router.post('/:id/link-identifiers', async (req, res) => {
    try {
        const { identifierType, identifierValue } = req.body;

        if (!identifierType || !identifierValue) {
            return res.status(400).json({ error: 'identifierType and identifierValue are required' });
        }

        // Lazy load service to avoid circular dependencies if any (though none expected here)
        const { SubjectPiiLinkService } = await import('../services/subjectPiiLinkService');
        const linkService = new SubjectPiiLinkService();

        const result = await linkService.linkPiiToDataSubject(req.params.id, identifierType, identifierValue);
        res.json(result);

    } catch (error: any) {
        console.error("Link Identifiers Error:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
