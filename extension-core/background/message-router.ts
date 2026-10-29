import browser from 'webextension-polyfill';
import {Message, SetThemeRequest} from '@shared/lib/models/summary.model';
import {ClassifyWithAgentRequest} from '@shared/lib/models/agent-classification.model';
import {extractArticleFromActiveTab, TabExtractionError} from './article-extraction';
import {handleClearCache} from './summary-cache';
import {handleGetSettings, handleSaveSettings} from './settings';
import {testProviderConnection, handleRefreshModels} from './provider-client';
import {handleClassifyWithAgent} from './agent-classification';
import {handleSummarize} from './summarization';
import {handleClassifyText, handleGetMLPermissionStatus, handleNotifyMLPermissionGranted, handleClearMLCache, handleCheckMLAvailability} from './ml-handlers';

/**
 * Main message handler
 */
export async function handleMessage(request: Message): Promise<unknown> {
  switch (request.type) {
    case 'EXTRACT_AND_SUMMARIZE':
      try {
        const article = await extractArticleFromActiveTab(request.tabId);
        if (!article) {
          return {
            type: 'SUMMARIZE_RESPONSE',
            error: 'Could not extract article content',
            success: false,
          };
        }
        const summaryResponse = await handleSummarize(article);
        // Add article metadata to the response for the sidebar
        return {
          ...summaryResponse,
          title: article.title,
          articleUrl: article.url,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const extractionError = error instanceof TabExtractionError ? error : undefined;
        const restricted = isRestrictedPage(extractionError?.tabUrl);
        const hasHostPermissionError =
          /missing host permission|host permission|cannot access contents of/i.test(message);
        const needsHostPermission = !restricted && hasHostPermissionError;
        return {
          type: 'SUMMARIZE_RESPONSE',
          error: restricted
            ? 'Firefox does not allow extensions to read this page. Open a regular website and try again.'
            : needsHostPermission
              ? 'Firefox has not granted this extension access to the website. Choose “Grant website access” to allow access on all websites, then retry.'
              : `Extraction error: ${message}`,
          permissionRequired: needsHostPermission,
          tabId: extractionError?.tabId,
          success: false,
        };
      }

    case 'SUMMARIZE':
      return handleSummarize(request.article, request.provider);

    case 'GET_SETTINGS':
      return handleGetSettings();

    case 'SAVE_SETTINGS':
      return handleSaveSettings(request.settings);

    case 'TEST_PROVIDER':
      return testProviderConnection(request.provider, request.apiKey);

    case 'REFRESH_MODELS':
      return handleRefreshModels(request.provider, request.apiKey);

    case 'CLEAR_CACHE':
      return handleClearCache();

    // ML Classification cases
    case 'CLASSIFY_TEXT':
      return handleClassifyText(request);

    case 'GET_ML_PERMISSION_STATUS':
      return handleGetMLPermissionStatus();

    case 'NOTIFY_ML_PERMISSION_GRANTED':
      console.log('Background.handleMessage: Processing NOTIFY_ML_PERMISSION_GRANTED case');
      return handleNotifyMLPermissionGranted();

    case 'CLEAR_ML_CACHE':
      return handleClearMLCache();

    case 'CHECK_ML_AVAILABILITY':
      return handleCheckMLAvailability();

    case 'CLASSIFY_WITH_AGENT':
      return handleClassifyWithAgent(request as ClassifyWithAgentRequest);

    case 'SET_THEME': {
      const themeRequest = request as SetThemeRequest;
      // Broadcast the theme change to all extension pages (popup, options, sidebar).
      // runtime.sendMessage does not reach the background itself, so no loop here.
      browser.runtime.sendMessage({type: 'THEME_CHANGED', theme: themeRequest.theme})
        .catch(() => {
          // Some contexts may not be open or may not handle the message; ignore.
        });
      return {type: 'SET_THEME_RESPONSE', success: true};
    }

    default:
      return {
        type: 'UNKNOWN_REQUEST',
        error: `Unknown message type: ${request.type}`,
        success: false,
      };
  }
}

function isRestrictedPage(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return ['about:', 'chrome:', 'moz-extension:', 'resource:', 'view-source:'].includes(parsed.protocol)
      || parsed.hostname === 'addons.mozilla.org';
  } catch {
    return false;
  }
}
