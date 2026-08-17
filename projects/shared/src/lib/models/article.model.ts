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
