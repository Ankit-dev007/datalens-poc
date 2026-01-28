import OpenAI from 'openai';

export interface LLMProvider {
    chat(options: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming): Promise<OpenAI.Chat.Completions.ChatCompletion>;
}
