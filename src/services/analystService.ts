import { LLMFactory } from '../llm/LLMFactory';
import { getNeo4jDriver } from '../config/neo4j';

export class AnalystService {

    async analyze(userQuery: string) {
        const driver = getNeo4jDriver();
        if (!driver) throw new Error("Neo4j driver not connected");

        // Define Tools (MCP Registry Mirror)
        const tools = [
            {
                type: "function",
                function: {
                    name: "query_graph_by_pii_type",
                    description: "Finds tables or files containing specific PII type (e.g., aadhaar, pan, email).",
                    parameters: {
                        type: "object",
                        properties: {
                            pii_type: { type: "string", enum: ["aadhaar", "pan", "bank_account", "email", "phone", "address", "dob", "name"] }
                        },
                        required: ["pii_type"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "trace_data_lineage",
                    description: "Traces upstream sources and downstream consumers for a given table.",
                    parameters: {
                        type: "object",
                        properties: {
                            table_name: { type: "string" }
                        },
                        required: ["table_name"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "get_processing_activities",
                    description: "Retrieves a list of Processing Activities filtered by status (default: Active).",
                    parameters: {
                        type: "object",
                        properties: {
                            status: { type: "string", enum: ["Active", "Draft", "Archived"] }
                        }
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "calculate_risk_score",
                    description: "Calculates DPDP Risk Score based on standard parameters.",
                    parameters: {
                        type: "object",
                        properties: {
                            volume: { type: "integer" },
                            sensitivity: { type: "string", enum: ["Public", "Internal", "Sensitive", "Critical"] },
                            protection: { type: "string", enum: ["Cleartext", "Masked", "Encrypted"] }
                        },
                        required: ["volume", "sensitivity", "protection"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "validate_dpia",
                    description: "Checks if a DPIA is required for an activity based on its risk score.",
                    parameters: {
                        type: "object",
                        properties: {
                            activity_id: { type: "string" }
                        },
                        required: ["activity_id"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "restrict_node_access",
                    description: "[REMEDIATION] Restricts access to a specific node (Table/File) by setting 'access'='Restricted'.",
                    parameters: {
                        type: "object",
                        properties: {
                            node_name: { type: "string" },
                            node_type: { type: "string", enum: ["Table", "File"] }
                        },
                        required: ["node_name"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "update_retention_policy",
                    description: "[REMEDIATION] Updates the data retention period for a Processing Activity.",
                    parameters: {
                        type: "object",
                        properties: {
                            activity_name: { type: "string" },
                            years: { type: "integer" }
                        },
                        required: ["activity_name", "years"]
                    }
                }
            }
        ];

        try {
            // Step 1: Ask LLM which tool to use
            const llm = LLMFactory.getProvider();
            const response = await llm.chat({
                model: 'deployment-name-ignored-by-factory', // Factory/Provider handles model selection
                messages: [{ role: "system", content: "You are a DPDP Compliance AI. Use the provided tools to answer user questions. Do not make assumptions." }, { role: "user", content: userQuery }],
                tools: tools as any,
                tool_choice: "auto",
                temperature: 0
            });

            const toolCall = response.choices[0]?.message?.tool_calls?.[0];

            if (!toolCall) {
                return {
                    explanation: "I could not identify a standardized compliance tool to answer this question. Please ask about PII location, lineage, or processing activities.",
                    results: [],
                    recommendations: []
                };
            }

            // Step 2: Execute Tool (Safe Logic)
            // In a full MCP architecture, this would forward the call to the Python FastMCP server.
            // For this Phase 1 integration, we execute the Safe Logic locally to ensure immediate stability.

            // Cast to any to avoid TypeScript errors with specific OpenAI SDK versions
            const fnName = (toolCall as any).function.name;
            const args = JSON.parse((toolCall as any).function.arguments);
            let results: any[] = [];
            let session = driver.session();

            try {
                if (fnName === 'query_graph_by_pii_type') {
                    const res = await session.run(`
                        MATCH (t:Table)-[:HAS_COLUMN]->(c:Column)-[:IS_PII]->(p:PII {type: $piiType})
                        RETURN t.name AS location, "Table" AS source, c.name AS details
                        UNION
                        MATCH (f:File)-[:IS_PII]->(p:PII {type: $piiType})
                        RETURN f.path AS location, "File" AS source, "File Level" AS details
                    `, { piiType: args.pii_type });
                    results = res.records.map(r => r.toObject());
                } else if (fnName === 'trace_data_lineage') {
                    const res = await session.run(`
                        MATCH (t:Table {name: $tableName})
                        OPTIONAL MATCH (upstream)-[:FLOWS_TO]->(t)
                        OPTIONAL MATCH (t)-[:FLOWS_TO]->(downstream)
                        RETURN collect(DISTINCT upstream.name) as upstream, collect(DISTINCT downstream.name) as downstream
                    `, { tableName: args.table_name });
                    results = res.records.map(r => r.toObject());
                } else if (fnName === 'get_processing_activities') {
                    const res = await session.run(`
                        MATCH (a:ProcessingActivity) 
                        WHERE a.status = $status 
                        RETURN a.name, a.businessProcess, a.ownerUserId, a.riskScore
                    `, { status: args.status || 'Active' });
                    results = res.records.map(r => r.toObject());
                } else if (fnName === 'calculate_risk_score') {
                    // Logic mirrored from Python tool
                    let score = 0;
                    if (args.sensitivity === 'Critical') score = 50;
                    else if (args.sensitivity === 'Sensitive') score = 30;
                    else if (args.sensitivity === 'Internal') score = 10;

                    let volMult = 1;
                    if (args.volume > 100000) volMult = 2;
                    else if (args.volume > 10000) volMult = 1.5;

                    let protFactor = 1.0;
                    if (args.protection === 'Encrypted') protFactor = 0.5;
                    else if (args.protection === 'Masked') protFactor = 0.7;

                    const final = score * volMult * protFactor;
                    results = [{ score: final, level: final > 60 ? 'High' : final > 30 ? 'Medium' : 'Low' }];
                } else if (fnName === 'validate_dpia') {
                    const res = await session.run(`
                        MATCH (a:ProcessingActivity {activityId: $aid})
                        RETURN a.name, a.riskScore, a.dpiaStatus
                    `, { aid: args.activity_id });
                    const record = res.records[0]?.toObject();
                    if (record) {
                        const score = record["a.riskScore"] || 0;
                        const status = record["a.dpiaStatus"];
                        const required = score > 60;
                        let outcome = "PASS";
                        if (required && status !== 'Completed') outcome = "FAIL - High Risk requires DPIA";
                        else if (!required && status === 'Required') outcome = "WARN - Low Risk but DPIA required";
                        results = [{ ...record, compliance: outcome }];
                    } else {
                        results = [{ error: "Activity not found" }];
                    }
                } else if (fnName === 'restrict_node_access') {
                    const label = (args.node_type || 'Table') === 'Table' ? 'Table' : 'File';
                    const prop = label === 'Table' ? 'name' : 'path';

                    const res = await session.run(`
                        MATCH (n:${label}) WHERE n.${prop} = $name
                        SET n.access = 'Restricted', n.lastAudit = datetime()
                        RETURN n.name, n.access
                    `, { name: args.node_name });

                    if (res.records.length > 0) {
                        results = [{ message: `Successfully restricted access to ${label} '${args.node_name}'.` }];
                    } else {
                        results = [{ error: `${label} '${args.node_name}' not found.` }];
                    }
                } else if (fnName === 'update_retention_policy') {
                    const res = await session.run(`
                        MATCH (a:ProcessingActivity {name: $name})
                        SET a.retentionPeriod = $years, a.lastUpdated = datetime()
                        RETURN a.name, a.retentionPeriod
                    `, { name: args.activity_name, years: args.years });

                    if (res.records.length > 0) {
                        results = [{ message: `Updated retention policy for '${args.activity_name}' to ${args.years} years.` }];
                    } else {
                        results = [{ error: `Activity '${args.activity_name}' not found.` }];
                    }
                }
            } finally {
                await session.close();
            }

            // Step 3: Interpret Results
            const interpretation = await llm.chat({
                model: 'deployment-name-ignored-by-factory',
                messages: [
                    { role: "system", content: "Summarize these compliance results for the user. Keep it brief." },
                    { role: "user", content: JSON.stringify(results) }
                ]
            });

            return {
                explanation: interpretation.choices[0]?.message?.content || "Data found.",
                toolUsed: fnName,
                results: results,
                recommendations: ["Verify ownership", "Check DPIA status"]
            };

        } catch (error: any) {
            console.error("Analyst Error:", error);
            return {
                explanation: `Error analyzing request: ${error.message}`,
                results: [],
                recommendations: []
            };
        }
    }
}
