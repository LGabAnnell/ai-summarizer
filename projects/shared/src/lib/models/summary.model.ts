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
  | CheckMLAvailabilityRequest;


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
}

export interface SummaryState {
  state: 'idle' | 'loading' | 'success' | 'error';
  summary?: SummaryResult;
  error?: string;
  loadingMessage?: string;
}