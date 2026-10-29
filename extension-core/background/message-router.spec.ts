import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {Message} from '@shared/lib/models/summary.model';
import type {ArticleData} from '@shared/lib/models/article.model';

const dependencies = vi.hoisted(() => ({
  extract: vi.fn(), clearCache: vi.fn(), getSettings: vi.fn(), saveSettings: vi.fn(),
  testProvider: vi.fn(), refreshModels: vi.fn(), classifyWithAgent: vi.fn(), summarize: vi.fn(),
  classifyText: vi.fn(), permissionStatus: vi.fn(), notifyPermission: vi.fn(), clearMLCache: vi.fn(),
  checkAvailability: vi.fn(), sendMessage: vi.fn(),
  tabsQuery: vi.fn(), tabsGet: vi.fn(), tabsSendMessage: vi.fn(), executeScript: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({default: {
  runtime: {sendMessage: dependencies.sendMessage},
  tabs: {query: dependencies.tabsQuery, get: dependencies.tabsGet, sendMessage: dependencies.tabsSendMessage},
  scripting: {executeScript: dependencies.executeScript},
}}));
vi.mock('./article-extraction', async importOriginal => ({
  ...await importOriginal<typeof import('./article-extraction')>(),
  extractArticleFromActiveTab: dependencies.extract,
}));
vi.mock('./summary-cache', () => ({handleClearCache: dependencies.clearCache}));
vi.mock('./settings', () => ({handleGetSettings: dependencies.getSettings, handleSaveSettings: dependencies.saveSettings}));
vi.mock('./provider-client', () => ({testProviderConnection: dependencies.testProvider, handleRefreshModels: dependencies.refreshModels}));
vi.mock('./agent-classification', () => ({handleClassifyWithAgent: dependencies.classifyWithAgent}));
vi.mock('./summarization', () => ({handleSummarize: dependencies.summarize}));
vi.mock('./ml-handlers', () => ({
  handleClassifyText: dependencies.classifyText,
  handleGetMLPermissionStatus: dependencies.permissionStatus,
  handleNotifyMLPermissionGranted: dependencies.notifyPermission,
  handleClearMLCache: dependencies.clearMLCache,
  handleCheckMLAvailability: dependencies.checkAvailability,
}));

import {handleMessage} from './message-router';
import {TabExtractionError} from './article-extraction';

describe('background message router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.sendMessage.mockResolvedValue(undefined);
  });

  type RouterCase = readonly [string, Message, string, readonly unknown[]];
  it.each([
    ['SUMMARIZE', {type: 'SUMMARIZE', article: {url: 'https://example.test', title: 'A', textContent: 'body', byline: '', length: 4}, provider: 'openai'}, 'summarize', [{url: 'https://example.test', title: 'A', textContent: 'body', byline: '', length: 4}, 'openai']],
    ['GET_SETTINGS', {type: 'GET_SETTINGS'}, 'getSettings', []],
    ['SAVE_SETTINGS', {type: 'SAVE_SETTINGS', settings: {apiKey: 'key'}}, 'saveSettings', [{apiKey: 'key'}]],
    ['TEST_PROVIDER', {type: 'TEST_PROVIDER', provider: 'mistral', apiKey: 'key'}, 'testProvider', ['mistral', 'key']],
    ['REFRESH_MODELS', {type: 'REFRESH_MODELS', provider: 'openai', apiKey: 'key'}, 'refreshModels', ['openai', 'key']],
    ['CLEAR_CACHE', {type: 'CLEAR_CACHE'}, 'clearCache', []],
    ['CLASSIFY_TEXT', {type: 'CLASSIFY_TEXT', text: 'hello'}, 'classifyText', [{type: 'CLASSIFY_TEXT', text: 'hello'}]],
    ['GET_ML_PERMISSION_STATUS', {type: 'GET_ML_PERMISSION_STATUS'}, 'permissionStatus', []],
    ['NOTIFY_ML_PERMISSION_GRANTED', {type: 'NOTIFY_ML_PERMISSION_GRANTED'}, 'notifyPermission', []],
    ['CLEAR_ML_CACHE', {type: 'CLEAR_ML_CACHE'}, 'clearMLCache', []],
    ['CHECK_ML_AVAILABILITY', {type: 'CHECK_ML_AVAILABILITY'}, 'checkAvailability', []],
    ['CLASSIFY_WITH_AGENT', {type: 'CLASSIFY_WITH_AGENT', summary: 'hello', agentId: 'agent', agentVersion: 'v1'}, 'classifyWithAgent', [{type: 'CLASSIFY_WITH_AGENT', summary: 'hello', agentId: 'agent', agentVersion: 'v1'}]],
  ] as const satisfies readonly RouterCase[])('%s delegates its request arguments and returns the handler result', async (_type, request, handler, args) => {
    const result = {type: 'HANDLER_RESULT', success: true};
    const handlers: Record<string, ReturnType<typeof vi.fn>> = {
      summarize: dependencies.summarize, getSettings: dependencies.getSettings, saveSettings: dependencies.saveSettings,
      testProvider: dependencies.testProvider, refreshModels: dependencies.refreshModels, clearCache: dependencies.clearCache,
      classifyText: dependencies.classifyText, permissionStatus: dependencies.permissionStatus,
      notifyPermission: dependencies.notifyPermission, clearMLCache: dependencies.clearMLCache,
      checkAvailability: dependencies.checkAvailability, classifyWithAgent: dependencies.classifyWithAgent,
    };
    handlers[handler].mockResolvedValue(result);
    await expect(handleMessage(request)).resolves.toBe(result);
    expect(handlers[handler]).toHaveBeenCalledWith(...args);
  });

  it('extracts with the requested tab and adds article metadata to the summary response', async () => {
    const article: ArticleData = {url: 'https://example.test/story', title: 'Story', textContent: 'article body', byline: 'Author', length: 12};
    const summary = {type: 'SUMMARIZE_RESPONSE', success: true, summary: 'Short version'};
    dependencies.extract.mockResolvedValue(article);
    dependencies.summarize.mockResolvedValue(summary);

    await expect(handleMessage({type: 'EXTRACT_AND_SUMMARIZE', tabId: 27})).resolves.toEqual({
      ...summary, title: 'Story', articleUrl: article.url,
    });
    expect(dependencies.extract).toHaveBeenCalledWith(27);
    expect(dependencies.summarize).toHaveBeenCalledWith(article);
  });

  it('returns an extraction failure when no article is available or extraction throws', async () => {
    dependencies.extract.mockResolvedValueOnce(null);
    await expect(handleMessage({type: 'EXTRACT_AND_SUMMARIZE'})).resolves.toEqual({
      type: 'SUMMARIZE_RESPONSE', error: 'Could not extract article content', success: false,
    });
    dependencies.extract.mockRejectedValueOnce(new Error('restricted page'));
    await expect(handleMessage({type: 'EXTRACT_AND_SUMMARIZE', tabId: 9})).resolves.toEqual({
      type: 'SUMMARIZE_RESPONSE', error: 'Extraction error: restricted page', permissionRequired: false, tabId: undefined, success: false,
    });
  });

  it('returns website permission recovery metadata for host permission failures', async () => {
    dependencies.extract.mockRejectedValueOnce(new TabExtractionError(
      'Could not access this page: Missing host permission for the tab', 9, 'https://example.test/story',
    ));
    await expect(handleMessage({type: 'EXTRACT_AND_SUMMARIZE', tabId: 9})).resolves.toEqual({
      type: 'SUMMARIZE_RESPONSE',
      error: 'Firefox has not granted this extension access to the website. Choose “Grant website access” to allow access on all websites, then retry.',
      permissionRequired: true,
      tabId: 9,
      success: false,
    });
  });

  it.each(['about:addons', 'https://addons.mozilla.org/en-US/firefox/addon/example/'])('explains that restricted page %s cannot be read', async tabUrl => {
    dependencies.extract.mockRejectedValueOnce(new TabExtractionError('Could not access this page: restricted', 9, tabUrl));
    await expect(handleMessage({type: 'EXTRACT_AND_SUMMARIZE', tabId: 9})).resolves.toEqual({
      type: 'SUMMARIZE_RESPONSE',
      error: 'Firefox does not allow extensions to read this page. Open a regular website and try again.',
      permissionRequired: false,
      tabId: 9,
      success: false,
    });
  });

  it('routes a real extraction failure through the recovery response', async () => {
    const actual = await vi.importActual<typeof import('./article-extraction')>('./article-extraction');
    dependencies.tabsQuery.mockResolvedValueOnce([{id: 33, url: 'https://example.test/story'}]);
    dependencies.tabsSendMessage.mockRejectedValueOnce(new Error('no listener'));
    dependencies.executeScript.mockRejectedValueOnce(new Error('Missing host permission for the tab'));
    dependencies.extract.mockImplementationOnce(actual.extractArticleFromActiveTab);
    await expect(handleMessage({type: 'EXTRACT_AND_SUMMARIZE'})).resolves.toMatchObject({
      permissionRequired: true, tabId: 33,
      error: 'Firefox has not granted this extension access to the website. Choose “Grant website access” to allow access on all websites, then retry.',
    });
  });

  it('reports unknown message types', async () => {
    await expect(handleMessage({type: 'NOT_A_MESSAGE'} as never)).resolves.toEqual({
      type: 'UNKNOWN_REQUEST', error: 'Unknown message type: NOT_A_MESSAGE', success: false,
    });
  });

  it('broadcasts theme changes and returns success even when no page receives the broadcast', async () => {
    dependencies.sendMessage.mockRejectedValue(new Error('no listeners'));
    await expect(handleMessage({type: 'SET_THEME', theme: 'dark'})).resolves.toEqual({type: 'SET_THEME_RESPONSE', success: true});
    expect(dependencies.sendMessage).toHaveBeenCalledWith({type: 'THEME_CHANGED', theme: 'dark'});
  });
});
