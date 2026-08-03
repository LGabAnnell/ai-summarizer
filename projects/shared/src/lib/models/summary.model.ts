/**
 * Models for summary functionality
 */
import { ArticleData } from "./article.model";
import {ExtensionSettings} from "./settings.model";
import {
  ClassifyTextRequest,
  GetMLPermissionStatusRequest,
  NotifyMLPermissionGrantedRequest,
  ClearMLCacheRequest,
  CheckMLAvailabilityRequest
} from "./classification.model";

export interface ExtractArticleRequest {
  type: 'EXTRACT_ARTICLE';
  tabId?: number;
}

export interface ExtractArticleResponse {
  type: 'EXTRACT_ARTICLE_RESPONSE';
  data?: ArticleData;
  error?: string;
  success: boolean;
}

export interface SummarizeRequest {
  type: 'SUMMARIZE';
  article: ArticleData;
  provider?: string;
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
  provider: string;
  apiKey: string;
}

export interface RefreshModelsRequest {
  type: 'REFRESH_MODELS';
  provider: string;
  apiKey: string;
}

export interface ClearCacheRequest {
  type: 'CLEAR_CACHE';
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
}

export interface SummaryRequest {
  article: ArticleData;
  provider?: string;
  settings?: SummarySettings;
}

export interface SummarySettings {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  summaryStyle?: 'concise' | 'detailed' | 'bullet_points' | 'custom';
  customPrompt?: string;
}

export interface SummaryState {
  state: 'idle' | 'loading' | 'success' | 'error';
  summary?: SummaryResult;
  error?: string;
  loadingMessage?: string;
}