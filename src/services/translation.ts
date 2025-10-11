import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import { getConfig } from '@/config/app-config';
import prompts from '@/config/prompts.json';

const config = getConfig();

const lmstudio = createOpenAICompatible({
  name: 'lmstudio',
  baseURL: config.localLlmBaseUrl,
});

export interface TranslationRequest {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface TranslationResponse {
  translatedText: string;
  error?: string;
}

function interpolatePrompt(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || '');
}

export async function translateText({
  text,
  sourceLanguage,
  targetLanguage,
}: TranslationRequest): Promise<TranslationResponse> {
  try {
    const prompt = interpolatePrompt(prompts.translation.user, {
      sourceLanguage,
      targetLanguage,
      text,
    });

    console.log('=== LLM Request ===');
    console.log('System Prompt:', prompts.translation.system);
    console.log('User Prompt:', prompt);

    const { text: translatedText } = await generateText({
      model: lmstudio(config.localLlmModel),
      prompt,
      system: prompts.translation.system,
    });

    console.log('=== LLM Response ===');
    console.log('Translated Text:', translatedText);

    return {
      translatedText: translatedText.trim(),
    };
  } catch (error) {
    console.error('Translation error:', error);
    return {
      translatedText: '',
      error: error instanceof Error ? error.message : 'Translation failed',
    };
  }
}
