import { getNeo4jDriver } from '../config/neo4j';
import { Session } from 'neo4j-driver';

export interface RuleResult {
    is_pii: boolean;
    type: string;
    confidence: number;
    source: 'user_rule';
}

export class RuleEngine {

    /**
     * Checks if a user-defined rule exists for the given column.
     * @param columnName Name of the column (case-insensitive check usually implied by business logic, but here strict/lower)
     * @returns RuleResult if a rule exists, null otherwise.
     */
    async checkRule(columnName: string): Promise<RuleResult | null> {
        const driver = getNeo4jDriver();
        if (!driver) return null;

        const session: Session = driver.session();
        try {
            const res = await session.run(`
                MATCH (r:UserRule {column: $column})
                RETURN r.isPii AS isPii, r.type AS type
            `, { column: columnName.toLowerCase() });

            if (res.records.length > 0) {
                const record = res.records[0];
                const isPii = record.get('isPii');
                const type = record.get('type');

                return {
                    is_pii: isPii,
                    type: type || 'none',
                    confidence: 1.0, // Rules are 100% confident
                    source: 'user_rule'
                };
            }
            return null;
        } catch (error) {
            console.error("RuleEngine: Failed to check rule", error);
            return null;
        } finally {
            await session.close();
        }
    }

    /**
     * Adds or updates a rule for a column.
     */
    async addRule(columnName: string, isPii: boolean, type: string = 'none') {
        const driver = getNeo4jDriver();
        if (!driver) return;

        const session: Session = driver.session();
        try {
            await session.run(`
                MERGE (r:UserRule {column: $column})
                SET r.isPii = $isPii, 
                    r.type = $type, 
                    r.createdAt = datetime()
            `, {
                column: columnName.toLowerCase(),
                isPii,
                type
            });
            console.log(`Rule added for column '${columnName}': isPii=${isPii}, type=${type}`);
        } catch (error) {
            console.error("RuleEngine: Failed to add rule", error);
        } finally {
            await session.close();
        }
    }
}
