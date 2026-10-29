/**
 * Models for summary functionality
 */
import {ArticleData} from "./article.model";
import {ExtensionSettings, ProviderType} from "./settings.model";
import {
  CheckMLAvailabilityRequest,
  ClassificationResult,
  ClassifyTextRequest,
  ClearMLCacheRequest,
  GetMLPermissionStatusRequest,
  NotifyMLPermissionGrantedRequest
} from "./classification.model";
import {Theme} from "./theme.model";
import type {ClassifyWithAgentRequest} from "./agent-classification.model";

export interface ExtractArticleRequest {
  type: 'EXTRACT_ARTICLE';
  tabId?: number;
}

export interface SummarizeRequest {
  type: 'SUMMARIZE';
  article: ArticleData;
  provider?: ProviderType;
  settings?: ExtensionSettings;
}

export interface ExtractAndSummarizeRequest {
  type: 'EXTRACT_AND_SUMMARIZE';
  tabId?: number;
}

export interface ExtractArticleRequest {
  type: 'EXTRACT_ARTICLE';
}

export interface CachedSummaryData {
  summary: string;
  timestamp: number;
  url: string;
  provider: string;
  model: string;
  // Mistral agent classification labels
  agentLabels?: string[];
  agentId?: string;
  agentVersion?: string;
}

export interface SummarizeResponse {
  type: 'SUMMARIZE_RESPONSE';
  summary?: string;
  error?: string;
  success: boolean;
  cached?: boolean;
  tokenCount?: number;
  // NEW: Classification result (optional)
  classification?: ClassificationResult;
  // NEW: Mistral agent classification labels (optional)
  agentLabels?: string[];
}

export interface GetSettingsRequest {
  type: 'GET_SETTINGS';
}

export interface SaveSettingsRequest {
  type: 'SAVE_SETTINGS';
  settings: Partial<ExtensionSettings>;
}

export interface TestProviderRequest {
  type: 'TEST_PROVIDER';
  provider: ProviderType;
  apiKey: string;
}

export interface RefreshModelsRequest {
  type: 'REFRESH_MODELS';
  provider: ProviderType;
  apiKey: string;
}

export interface ClearCacheRequest {
  type: 'CLEAR_CACHE';
}

export interface SetThemeRequest {
  type: 'SET_THEME';
  theme: Theme;
}

export interface ThemeChangedMessage {
  type: 'THEME_CHANGED';
  theme: Theme;
}

// Re-export ClassifyWithAgentRequest from agent-classification.model for external use
export { ClassifyWithAgentRequest } from "./agent-classification.model";

// Discriminated union type for all possible incoming message types
export type Message =
  | ExtractAndSummarizeRequest
  | SummarizeRequest
  | GetSettingsRequest
  | SaveSettingsRequest
  | TestProviderRequest
  | RefreshModelsRequest
  | ClearCacheRequest
  | SetThemeRequest
  | ExtractArticleRequest
  | ClassifyTextRequest
  | GetMLPermissionStatusRequest
  | NotifyMLPermissionGrantedRequest
  | ClearMLCacheRequest
  | CheckMLAvailabilityRequest
  | ClassifyWithAgentRequest;


export interface SummaryResult {
  summary: string;
  cached: boolean;
  tokenCount?: number;
  truncated?: boolean;
  articleUrl?: string;
  title?: string;
  provider?: string;
  model?: string;
  timestamp: Date;
  // NEW: Classification result (optional)
  classification?: ClassificationResult;
  // NEW: Mistral agent classification labels (optional)
  agentLabels?: string[];
}

export interface SummaryState {
  state: 'idle' | 'loading' | 'success' | 'error';
  summary?: SummaryResult;
  error?: string;
  loadingMessage?: string;
  permissionRequired?: boolean;
  tabId?: number;
}
