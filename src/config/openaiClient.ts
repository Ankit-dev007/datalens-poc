import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();
const apiKey = process.env.AZURE_OPENAI_API_KEY;
const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview";
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

if (!apiKey || !endpoint || !deployment) {
    throw new Error(
        "CRITICAL ERROR: Missing Azure OpenAI environment variables. " +
        "Check AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, and AZURE_OPENAI_DEPLOYMENT in .env"
    );
}

export const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: `${endpoint}/openai/deployments/${deployment}`,
    defaultQuery: { "api-version": apiVersion },
    defaultHeaders: {
        "api-key": apiKey,
    },
    timeout: 300000,
    maxRetries: 3,
});

export const deploymentName: string = deployment;