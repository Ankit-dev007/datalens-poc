import express from 'express';
import { ComplianceService } from '../services/complianceService';

const router = express.Router();
const complianceService = new ComplianceService();

/**
 * GET /api/compliance/validation
 * Run all DPDP validation checks
 */
router.get('/validation', async (req, res) => {
    try {
        const results = await complianceService.runAllValidations();
        res.json({
            timestamp: new Date().toISOString(),
            checks: results
        });
    } catch (e: any) {
        console.error('Compliance validation failed:', e);
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/compliance/summary
 * Get compliance summary statistics
 */
router.get('/summary', async (req, res) => {
    try {
        const summary = await complianceService.getComplianceSummary();
        res.json(summary);
    } catch (e: any) {
        console.error('Compliance summary failed:', e);
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/compliance/pii-lineage/:piiType
 * Trace lineage for a specific PII type
 */
router.get('/pii-lineage/:piiType', async (req, res) => {
    try {
        const { piiType } = req.params;
        const lineage = await complianceService.getPIILineage(piiType);
        res.json({
            piiType: piiType.toUpperCase(),
            totalInstances: lineage.length,
            completeChains: lineage.filter(l => l.complete).length,
            incompleteChains: lineage.filter(l => !l.complete).length,
            lineage
        });
    } catch (e: any) {
        console.error('PII lineage query failed:', e);
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/compliance/illegal-pii
 * Get PII without lawful basis
 */
router.get('/illegal-pii', async (req, res) => {
    try {
        const result = await complianceService.checkIllegalPII();
        res.json(result);
    } catch (e: any) {
        console.error('Illegal PII check failed:', e);
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/compliance/unmapped
 * Get unmapped storage entities
 */
router.get('/unmapped', async (req, res) => {
    try {
        const result = await complianceService.checkUnmappedAssets();
        res.json(result);
    } catch (e: any) {
        console.error('Unmapped assets check failed:', e);
        res.status(500).json({ error: e.message });
    }
});

export default router;
