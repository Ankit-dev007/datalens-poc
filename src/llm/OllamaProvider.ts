import { LLMProvider } from './LLMProvider';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

export class OllamaProvider implements LLMProvider {
    private client: OpenAI;
    private model: string;

    constructor() {
        const baseURL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1';
        const apiKey = 'ollama'; // Dummy key for Ollama
        this.model = process.env.OLLAMA_PRIMARY_MODEL || 'qwen2.5';

        this.client = new OpenAI({
            baseURL,
            apiKey,
        });
    }

    async chat(options: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming): Promise<OpenAI.Chat.Completions.ChatCompletion> {
        // Force the model to be the one configured for Ollama
        // irrespective of what the caller requested (which might be an Azure deployment name)
        const effectiveOptions = {
            ...options,
            model: this.model
        };

        return await this.client.chat.completions.create(effectiveOptions);
    }
}
