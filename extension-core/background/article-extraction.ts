import browser from 'webextension-polyfill';
import {ArticleData} from '@shared/lib/models/article.model';

interface ExtractResponse {
  success: boolean;
  data?: ArticleData;
  error?: string;
}

export class TabExtractionError extends Error {
  constructor(message: string, readonly tabId: number, readonly tabUrl?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TabExtractionError';
  }
}

/**
 * Extract article from the active tab
 */
export async function extractArticleFromActiveTab(requestedTabId?: number): Promise<ArticleData | null> {
  const tabs = requestedTabId === undefined
    ? await browser.tabs.query({active: true, currentWindow: true})
    : [{id: requestedTabId}];

  if (tabs.length === 0 || tabs[0].id === undefined) {
    throw new Error('No active tab found');
  }

  const tabId = tabs[0].id;
  let tabUrl = 'url' in tabs[0] ? tabs[0].url : undefined;
  if (!tabUrl) {
    try {
      tabUrl = (await browser.tabs.get(tabId)).url;
    } catch {
      // Tab metadata is only needed to distinguish restricted Firefox pages.
    }
  }

  let response: ExtractResponse;

  // The manifest loads the content script at document_idle. On the first click it
  // may not have registered its message listener yet, so inject it on demand.
  try {
    response = await browser.tabs.sendMessage(tabId, {type: 'EXTRACT_ARTICLE'}) as ExtractResponse;
  } catch {
    try {
      await browser.scripting.executeScript({target: {tabId}, files: ['content.js']});
    } catch (error) {
      throw new TabExtractionError(
        `Could not access this page: ${error instanceof Error ? error.message : String(error)}`,
        tabId,
        tabUrl,
        {cause: error},
      );
    }

    // A newly injected script can take a moment to register its listener.
    try {
      response = await browser.tabs.sendMessage(tabId, {type: 'EXTRACT_ARTICLE'}) as ExtractResponse;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 150));
      response = await browser.tabs.sendMessage(tabId, {type: 'EXTRACT_ARTICLE'}) as ExtractResponse;
    }
  }

  if (response?.success && response.data) {
    return response.data;
  }

  throw new Error(response?.error ?? 'Failed to extract article');
}
