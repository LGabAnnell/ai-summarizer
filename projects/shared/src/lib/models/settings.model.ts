/**
 * Models for extension settings
 */

export type ProviderType = 'mistral' | 'openai' | 'anthropic' | 'qwen' | 'deepseek' | 'custom';

export interface ExtensionSettings {
  /** Selected AI provider */
  provider: ProviderType;
  /** API key for the selected provider */
  apiKey: string;
  /** Model to use for the selected provider */
  model: string;
  /** Custom endpoint URL (for 'custom' provider) */
  customEndpoint?: string;
  /** Summary style */
  summaryStyle: 'concise' | 'detailed' | 'bullet_points' | 'custom';
  /** Custom system prompt (if summaryStyle is 'custom') */
  customPrompt?: string;
  /** Maximum tokens to generate */
  maxTokens: number;
  /** Sampling temperature (0-1) */
  temperature: number;
  /** Whether caching is enabled */
  cacheEnabled: boolean;
  /** Cache TTL in days */
  cacheTTL: number;
  
  // ML Classification Settings
  /** Enable/disable ML classification (default: false) */
  mlEnabled?: boolean;
  /** Model hub to use for ML (default: 'mozilla') */
  mlModelHub?: 'mozilla' | 'huggingface';
  /** Specific model ID for text-classification */
  mlModelId?: string;
}

export interface SettingsState {
  settings: ExtensionSettings;
  isLoading: boolean;
  error?: string;
}

export interface SettingsValidation {
  valid: boolean;
  errors: Record<string, string>;
}

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: ExtensionSettings = {
  provider: 'mistral',
  apiKey: '',
  model: 'mistral-tiny',
  summaryStyle: 'concise',
  maxTokens: 500,
  temperature: 0.7,
  cacheEnabled: true,
  cacheTTL: 7,
  // ML Classification Settings (disabled by default)
  mlEnabled: false,
  mlModelHub: 'mozilla',
  mlModelId: 'distilbert-base-uncased-finetuned-sst-2-english',
};

/**
 * Available models for each provider
 */
export const PROVIDER_MODELS: Record<ProviderType, string[]> = {
  mistral: [
    'mistral-tiny',
    'mistral-small',
    'mistral-medium',
    'mistral-large',
    'codestral-latest',
  ],
  openai: [
    'gpt-4o-mini',
    'gpt-4o',
    'gpt-3.5-turbo',
  ],
  anthropic: [
    'claude-3-5-sonnet-20250620',
    'claude-3-haiku-20240307',
    'claude-3-sonnet-20240229',
    'claude-2-1',
    'claude-instant-1-2',
  ],
  qwen: [
    'qwen2-7b-instruct',
    'qwen2-72b-instruct',
    'qwen-plus',
    'qwen-turbo',
    'qwen-max',
  ],
  deepseek: [
    'deepseek-chat',
    'deepseek-coder',
  ],
  custom: [], // Custom provider models are user-defined
};

/**
 * Provider-specific configurations
 */
export interface ProviderConfig {
  name: string;
  displayName: string;
  endpoint: string;
  authHeader: string;
  useBearerToken: boolean;
  supportsStreaming: boolean;
  apiKeyPrefix: string | null;
}

export const PROVIDER_CONFIGS: Record<ProviderType, ProviderConfig> = {
  mistral: {
    name: 'mistral',
    displayName: 'Mistral',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    authHeader: 'Authorization',
    useBearerToken: true,
    supportsStreaming: true,
    apiKeyPrefix: 'sk-',
  },
  openai: {
    name: 'openai',
    displayName: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    authHeader: 'Authorization',
    useBearerToken: true,
    supportsStreaming: true,
    apiKeyPrefix: 'sk-',
  },
  anthropic: {
    name: 'anthropic',
    displayName: 'Anthropic',
    endpoint: 'https://api.anthropic.com/v1/messages',
    authHeader: 'x-api-key',
    useBearerToken: false,
    supportsStreaming: true,
    apiKeyPrefix: 'sk_',
  },
  qwen: {
    name: 'qwen',
    displayName: 'Qwen (DashScope)',
    endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
    authHeader: 'Authorization',
    useBearerToken: true,
    supportsStreaming: true,
    apiKeyPrefix: 'sk-',
  },
  deepseek: {
    name: 'deepseek',
    displayName: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    authHeader: 'Authorization',
    useBearerToken: true,
    supportsStreaming: true,
    apiKeyPrefix: 'sk-',
  },
  custom: {
    name: 'custom',
    displayName: 'Custom',
    endpoint: '',
    authHeader: 'Authorization',
    useBearerToken: true,
    supportsStreaming: false,
    apiKeyPrefix: null,
  },
};
