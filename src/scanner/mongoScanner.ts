import { Db } from 'mongodb';
import { PIIDetector } from './piiDetector';
import { AIPIIDetector } from './aiPIIDetector';
import { TableResult, PIIResult } from '../types';

export class MongoScanner {
    private piiDetector: PIIDetector;
    private aiDetector: AIPIIDetector;

    constructor() {
        this.piiDetector = new PIIDetector();
        this.aiDetector = new AIPIIDetector();
    }

    async scan(db: Db): Promise<TableResult[]> {
        const results: TableResult[] = [];
        const collections = await db.listCollections().toArray();

        for (const col of collections) {
            const colName = col.name;
            console.log(`Scanning collection: ${colName}`);
            const collectionResult: TableResult = { table: colName, pii: [] };
            const docs = await db.collection(colName).find().limit(10).toArray();
            if (docs.length === 0) continue;
            const keys = new Set<string>();
            docs.forEach(doc => {
                Object.keys(doc).forEach(k => keys.add(k));
            });
            for (const key of keys) {
                let detectedPII: PIIResult | null = null;
                for (const doc of docs) {
                    const value = doc[key];
                    if (!value) continue;
                    const strValue = String(value);

                    // Regex Detection
                    const regexResult = this.piiDetector.detect(strValue, key);
                    if (regexResult) {
                        detectedPII = regexResult;
                        break;
                    }

                    // AI Detection
                    const aiResult = await this.aiDetector.detect(strValue, key);
                    if (aiResult.is_pii) {
                        detectedPII = {
                            field: key,
                            type: aiResult.type,
                            source: 'ai',
                            confidence: aiResult.confidence
                        };
                        break;
                    }
                }

                if (detectedPII && detectedPII.type !== 'none') {
                    collectionResult.pii.push(detectedPII);
                }
            }

            if (collectionResult.pii.length > 0) {
                results.push(collectionResult);
            }
        }

        return results;
    }
}
