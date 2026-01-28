import { LLMProvider } from './LLMProvider';
import { openai, deploymentName } from '../config/openaiClient';
import OpenAI from 'openai';

export class AzureProvider implements LLMProvider {
    async chat(options: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming): Promise<OpenAI.Chat.Completions.ChatCompletion> {
        if (process.env.LLM_PROVIDER === 'ollama') {
            throw new Error('CRITICAL SECURITY VIOLATION: Azure OpenAI called while LLM_PROVIDER=ollama');
        }
        // Ensure the deployment name is set if not provided (though usually passed in options or config)
        // The existing code mostly relies on `deploymentName` from config being passed as 'model'.

        // We defer to the global `openai` client which is already configured for Azure.
        // We overwrite the model with the deployment name from env if needed, 
        // to ensure it matches the Azure 'deployment' expectation.
        const effectiveOptions = {
            ...options,
            model: deploymentName // Force usage of the configured Azure deployment
        };

        return await openai.chat.completions.create(effectiveOptions);
    }
}
