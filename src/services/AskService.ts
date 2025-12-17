import { getNeo4jDriver } from '../config/neo4j';
import { openai, deploymentName } from '../config/openaiClient';

export class AskService {
    async askQuestion(question: string) {
        const driver = getNeo4jDriver();
        if (!driver) throw new Error('Neo4j driver not initialized');
        const session = driver.session();

        try {
            // 1. Convert Question to Cypher using OpenAI
            const systemPrompt = `
                You are a Neo4j Cypher expert for a PII Compliance graph.
                Schema:
                - (Table)-[:HAS_COLUMN]->(Column)
                - (Column)-[:IS_PII]->(PII)
                - (File)-[:IS_PII]->(PII)
                
                Node Properties:
                - Table: name
                - Column: name
                - PII: type, risk (High, Medium, Low)
                - File: name
                
                Generate ONLY the Cypher query. Do not explain.
                Question: ${question}
            `;

            const completion = await openai.chat.completions.create({
                model: deploymentName,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: question }
                ],
                temperature: 0,
            });

            let cypher = completion.choices[0].message.content || '';
            // Clean up code blocks if present
            cypher = cypher.replace(/```cypher/g, '').replace(/```/g, '').trim();

            // 2. Execute Cypher
            const result = await session.run(cypher);
            const records = result.records.map(r => r.toObject());

            // Clean up BigInts for JSON serialization
            const cleanRecords = records.map(r => {
                const newObj: any = {};
                for (const key in r) {
                    const val = r[key];
                    if (typeof val === 'object' && val !== null && 'low' in val && 'high' in val) {
                        newObj[key] = val.toNumber();
                    } else {
                        newObj[key] = val;
                    }
                }
                return newObj;
            });

            // 3. Generate Natural Language Answer
            const answerPrompt = `
                You are a Data Analyst. Explain the following data results in 1 concise sentence.
                Question: ${question}
                Results: ${JSON.stringify(cleanRecords)}
            `;

            const answerCompletion = await openai.chat.completions.create({
                model: deploymentName,
                messages: [{ role: 'system', content: answerPrompt }],
                temperature: 0.5,
            });

            const answer = answerCompletion.choices[0].message.content || 'I found some results.';

            return {
                answer,
                cypher,
                results: cleanRecords
            };

        } catch (err: any) {
            console.error("Ask Service Error: ", err);
            return {
                answer: "I encountered an error processing your request.",
                cypher: "",
                results: []
            };
        } finally {
            await session.close();
        }
    }
}
