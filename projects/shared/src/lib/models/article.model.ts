/**
 * Models for article data
 */

export interface ArticleData {
  title: string;
  textContent: string;
  byline: string;
  length: number;
  url: string;
  publicationDate?: string;
  siteName?: string;
}

export interface ArticleExtractRequest {
  url?: string;
  tabId?: number;
}

export interface ArticleExtractResponse {
  data?: ArticleData;
  error?: string;
  success: boolean;
}
