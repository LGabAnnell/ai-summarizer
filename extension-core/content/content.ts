/**
 * Content Script for Article Summarizer Extension
 * This script runs in the context of web pages and extracts article content
 */

// Import the vendored Readability.js
// In the final build, this will be bundled with the content script
import {Readability} from '@mozilla/readability';
import {installPanelShell} from '../panel/shell';
import browser, {Runtime} from 'webextension-polyfill';
import OnMessageListener = Runtime.OnMessageListener;

// Define message types for communication with background script
export interface ArticleData {
  title: string;
  textContent: string;
  byline: string;
  length: number;
  url: string;
}

interface ExtractResponse {
  type: 'EXTRACT_ARTICLE_RESPONSE';
  data?: ArticleData;
  error?: string;
  success: boolean;
}

interface Message {
  type: string;

  [key: string]: unknown;
}

// Maximum text length to extract (to avoid sending too much data)
const MAX_TEXT_LENGTH = 25000;

/**
 * Extract article content from the current page using Readability.js
 * Falls back to simple extraction if Readability fails
 */
function extractArticle(): ArticleData | null {
  try {
    // Use Mozilla's Readability library
    const doc = document.cloneNode(true) as Document;
    doc.querySelectorAll('[data-ai-summarizer-panel]').forEach(element => element.remove());
    const readability = new Readability(doc,/*, {
      charThreshold: MAX_TEXT_LENGTH,
    }*/);

    const article = readability.parse();

    if (article?.textContent) {
      // Truncate if necessary
      let textContent = article.textContent;
      if (textContent.length > MAX_TEXT_LENGTH) {
        textContent = `${textContent.substring(0, MAX_TEXT_LENGTH)}...`;
      }

      return {
        title: article.title ?? document.title ?? '',
        textContent: textContent,
        byline: article.byline ?? '',
        length: textContent.length,
        url: window.location.href,
      };
    }
  } catch (error) {
    console.error('Readability extraction failed:', error);
  }

  // Fallback: try to extract content manually
  return extractArticleFallback();
}

/**
 * Fallback extraction method when Readability.js doesn't work
 */
function extractArticleFallback(): ArticleData | null {
  try {
    // Try to find article element
    const articleElement = document.querySelector('article') ??
      document.querySelector('main') ??
      document.querySelector('.article') ??
      document.querySelector('.content') ??
      document.querySelector('.post') ??
      document.body;

    if (!articleElement) {
      return null;
    }

    // Clone to avoid modifying the original
    const clone = articleElement.cloneNode(true) as HTMLElement;

    // Remove unwanted elements
    const unwantedSelectors = ['[data-ai-summarizer-panel]', 'script', 'style', 'noscript', 'iframe', 'nav', 'footer', 'header', '.ad', '.sidebar', '.comments'];
    unwantedSelectors.forEach(selector => {
      const elements = clone.querySelectorAll(selector);
      elements.forEach(el => el.remove());
    });

    // Get text content
    let textContent = clone.textContent || '';

    // Normalize whitespace
    textContent = textContent
      .replace(/\s+/g, ' ')
      .trim();

    // Truncate if necessary
    if (textContent.length > MAX_TEXT_LENGTH) {
      textContent = `${textContent.substring(0, MAX_TEXT_LENGTH)}...`;
    }

    // Try to find a title
    let title = document.title || '';
    const h1 = document.querySelector('h1');
    if (h1) {
      title = h1.textContent || '';
    }

    return {
      title: title.trim(),
      textContent: textContent,
      byline: '',
      length: textContent.length,
      url: window.location.href,
    };
  } catch (error) {
    console.error('Fallback extraction failed:', error);
    return null;
  }
}
/**
 * Handle messages from the background script
 */
const handleMessage: OnMessageListener = (request: unknown, _: unknown, sendResponse: (response: unknown) => void) => {
  const castRequest = request as Message;
  if (castRequest.type === 'EXTRACT_ARTICLE') {
    try {
      const article = extractArticle();

      if (article) {
        const response: ExtractResponse = {
          type: 'EXTRACT_ARTICLE_RESPONSE',
          data: article,
          success: true,
        };
        sendResponse(response);
      } else {
        const response: ExtractResponse = {
          type: 'EXTRACT_ARTICLE_RESPONSE',
          error: 'Could not extract article content from this page',
          success: false,
        };
        sendResponse(response);
      }
    } catch (error) {
      const response: ExtractResponse = {
        type: 'EXTRACT_ARTICLE_RESPONSE',
        error: `Extraction error: ${error instanceof Error ? error.message : String(error)}`,
        success: false,
      };
      sendResponse(response);
    }
  }

  // Return true to indicate we will send a response asynchronously
  // This is required for Manifest V3
  return true;
};

// Do not install duplicate message handlers when Firefox injects this bundle on demand.
const registry = globalThis as typeof globalThis & {__articleSummarizerInstalled?: boolean};
if (!registry.__articleSummarizerInstalled) {
  registry.__articleSummarizerInstalled = true;
  const documentId = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  let handlePanel: ReturnType<typeof installPanelShell> | undefined;
  browser.runtime.onMessage.addListener(((request: unknown, sender: Runtime.MessageSender, sendResponse: (response: unknown) => void): true | void => {
    const message = request as Message;
    if (message?.type === 'PANEL_IDENTITY') { sendResponse({success: true, documentId, url: location.href}); return; }
    if (message?.type === 'PANEL_SHOW' && (message['documentId'] !== documentId || typeof message['sessionId'] !== 'string' || !message['sessionId'])) {
      sendResponse({success: false, error: 'The panel request is no longer valid. Try again.'}); return;
    }
    const currentUrl = new URL(location.href);
    currentUrl.hash = '';
    if (message?.type === 'EXTRACT_ARTICLE' &&
        ((message['documentId'] && message['documentId'] !== documentId) ||
         (message['documentUrl'] && message['documentUrl'] !== currentUrl.href))) {
      sendResponse({success: false, error: 'The article changed before it could be extracted. Try again.'}); return;
    }
    if (message?.type === 'PANEL_SHOW') handlePanel ??= installPanelShell();
    if (request && typeof request === 'object' && handlePanel?.(message)) {
      sendResponse({success: true});
      return;
    }
    if (message?.type === 'EXTRACT_ARTICLE') return handleMessage(request, sender, sendResponse);
    return;
  }) as Runtime.OnMessageListener);
}

// Also listen for messages from the popup (via the background script)
// The background script will forward messages to the content script
console.log('Article Summarizer content script loaded');
