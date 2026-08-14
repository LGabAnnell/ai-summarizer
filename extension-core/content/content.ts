/**
 * Content Script for Article Summarizer Extension
 * This script runs in the context of web pages and extracts article content
 */

// Import the vendored Readability.js
// In the final build, this will be bundled with the content script
import { Readability } from '@mozilla/readability';
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

interface ExtractRequest {
  type: 'EXTRACT_ARTICLE';
}

interface ExtractResponse {
  type: 'EXTRACT_ARTICLE_RESPONSE';
  data?: ArticleData;
  error?: string;
  success: boolean;
}

interface Message {
  type: string;
  [key: string]: any;
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
    const readability = new Readability(doc/*, {
      charThreshold: MAX_TEXT_LENGTH,
    }*/);

    const article = readability.parse();

    if (article?.textContent) {
      // Truncate if necessary
      let textContent = article.textContent;
      if (textContent.length > MAX_TEXT_LENGTH) {
        textContent = `${textContent.substring(0, MAX_TEXT_LENGTH)  }...`;
      }

      return {
        title: article.title || document.title || '',
        textContent: textContent,
        byline: article.byline || '',
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
    const articleElement = document.querySelector('article') ||
                        document.querySelector('main') ||
                        document.querySelector('.article') ||
                        document.querySelector('.content') ||
                        document.querySelector('.post') ||
                        document.body;

    if (!articleElement) {
      return null;
    }

    // Clone to avoid modifying the original
    const clone = articleElement.cloneNode(true) as HTMLElement;

    // Remove unwanted elements
    const unwantedSelectors = ['script', 'style', 'noscript', 'iframe', 'nav', 'footer', 'header', '.ad', '.sidebar', '.comments'];
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
      textContent = `${textContent.substring(0, MAX_TEXT_LENGTH)  }...`;
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
const handleMessage: OnMessageListener = (request: unknown, sender: any, sendResponse: (response: unknown) => void) => {
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
}

// Listen for messages from the background script
browser.runtime.onMessage.addListener(handleMessage);

// Also listen for messages from the popup (via the background script)
// The background script will forward messages to the content script
console.log('Article Summarizer content script loaded');
