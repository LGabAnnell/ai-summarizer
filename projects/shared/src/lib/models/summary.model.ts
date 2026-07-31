/**
 * Models for summary functionality
 */
import { ArticleData } from "./article.model";

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