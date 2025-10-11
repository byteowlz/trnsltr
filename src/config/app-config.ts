export interface AppConfig {
  earsWebSocketUrl: string;
  ttsWebSocketUrl: string;
  localLlmBaseUrl: string;
  localLlmModel: string;
  translationTimeoutMs: number;
  translationMaxWords: number;
}

export const defaultConfig: AppConfig = {
  earsWebSocketUrl: import.meta.env.VITE_EARS_WS_URL || 'ws://localhost:8765',
  ttsWebSocketUrl: import.meta.env.VITE_TTS_WS_URL || 'ws://localhost:8766',
  localLlmBaseUrl: import.meta.env.VITE_LLM_BASE_URL || 'http://localhost:11434/v1',
  localLlmModel: import.meta.env.VITE_LLM_MODEL || 'llama3.2',
  translationTimeoutMs: parseInt(import.meta.env.VITE_TRANSLATION_TIMEOUT_MS || '5000', 10),
  translationMaxWords: parseInt(import.meta.env.VITE_TRANSLATION_MAX_WORDS || '30', 10),
};

export const getConfig = (): AppConfig => {
  return defaultConfig;
};
