import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { getConfig } from '@/config/app-config';

const config = getConfig();

const openai = createOpenAI({
  baseURL: config.localLlmBaseUrl,
  apiKey: 'not-needed',
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

export async function translateText({
  text,
  sourceLanguage,
  targetLanguage,
}: TranslationRequest): Promise<TranslationResponse> {
  try {
    const prompt = `Translate the following text from ${sourceLanguage} to ${targetLanguage}. Only return the translated text, nothing else.

Text to translate: ${text}`;

    const { text: translatedText } = await generateText({
      model: openai(config.localLlmModel),
      prompt,
    });

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
