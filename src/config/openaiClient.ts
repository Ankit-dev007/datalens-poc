import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();
const apiKey = process.env.AZURE_OPENAI_API_KEY;
const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiVersion = process.env.AZURE_OPENAI_API_VERSION;
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

export const openai = new OpenAI({
    apiKey,
    baseURL: `${endpoint}/openai/deployments/${deployment}`,
    defaultQuery: { "api-version": apiVersion },
    defaultHeaders: {
        "api-key": apiKey,
    },
    timeout: 300000, // 5 minutes
    maxRetries: 3,
});

export const deploymentName = deployment;
