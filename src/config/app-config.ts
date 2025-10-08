export interface AppConfig {
  earsWebSocketUrl: string;
  localLlmBaseUrl: string;
  localLlmModel: string;
}

export const defaultConfig: AppConfig = {
  earsWebSocketUrl: import.meta.env.VITE_EARS_WS_URL || 'ws://localhost:8765',
  localLlmBaseUrl: import.meta.env.VITE_LLM_BASE_URL || 'http://localhost:11434/v1',
  localLlmModel: import.meta.env.VITE_LLM_MODEL || 'llama3.2',
};

export const getConfig = (): AppConfig => {
  return defaultConfig;
};
