import { LLMProvider } from './LLMProvider';
import { AzureProvider } from './AzureProvider';
import { OllamaProvider } from './OllamaProvider';
import dotenv from 'dotenv';

dotenv.config();

export class LLMFactory {
    private static instance: LLMProvider;

    static getProvider(): LLMProvider {
        if (!this.instance) {
            const providerType = process.env.LLM_PROVIDER || 'azure';

            if (providerType.toLowerCase() === 'ollama') {
                console.log('Using LLM Provider: Ollama');
                this.instance = new OllamaProvider();
            } else {
                console.log('Using LLM Provider: Azure OpenAI');
                this.instance = new AzureProvider();
            }
        }
        return this.instance;
    }
}
