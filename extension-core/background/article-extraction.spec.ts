import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const api = vi.hoisted(() => ({
  tabsQuery: vi.fn(),
  tabsGet: vi.fn(),
  sendMessage: vi.fn(),
  executeScript: vi.fn(),
}));
vi.mock('webextension-polyfill', () => ({default: {
  tabs: {query: api.tabsQuery, get: api.tabsGet, sendMessage: api.sendMessage},
  scripting: {executeScript: api.executeScript},
}}));
import {extractArticleFromActiveTab} from './article-extraction';

const article = {url: 'https://example.com', title: 'Example', textContent: 'text', byline: '', length: 4};

describe('article extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.tabsQuery.mockResolvedValue([{id: 4}]);
    api.tabsGet.mockResolvedValue({id: 4, url: 'https://example.com'});
    api.sendMessage.mockResolvedValue({success: true, data: article});
    api.executeScript.mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  it('uses the requested tab without querying the active tab', async () => {
    await expect(extractArticleFromActiveTab(8)).resolves.toEqual(article);
    expect(api.tabsQuery).not.toHaveBeenCalled();
    expect(api.sendMessage).toHaveBeenCalledWith(8, {type: 'EXTRACT_ARTICLE'});
  });

  it('preserves tab metadata and the injection error cause for recovery handling', async () => {
    const cause = new Error('Missing host permission for the tab');
    api.sendMessage.mockRejectedValueOnce(new Error('no listener'));
    api.executeScript.mockRejectedValueOnce(cause);
    const error = await extractArticleFromActiveTab(8).catch(value => value);
    expect(error).toMatchObject({name: 'TabExtractionError', tabId: 8, tabUrl: 'https://example.com'});
    expect(error.cause).toBe(cause);
    expect(api.tabsGet).toHaveBeenCalledWith(8);
  });

  it('uses the active tab URL and tolerates unavailable tab metadata', async () => {
    api.tabsQuery.mockResolvedValueOnce([{id: 4, url: 'about:addons'}]);
    api.sendMessage.mockRejectedValueOnce(new Error('no listener'));
    api.executeScript.mockRejectedValueOnce(new Error('restricted'));
    const error = await extractArticleFromActiveTab().catch(value => value);
    expect(error).toMatchObject({tabId: 4, tabUrl: 'about:addons'});
    expect(api.tabsGet).not.toHaveBeenCalled();

    api.tabsQuery.mockResolvedValueOnce([{id: 4}]);
    api.tabsGet.mockRejectedValueOnce(new Error('tab closed'));
    api.sendMessage.mockRejectedValueOnce(new Error('no listener'));
    api.executeScript.mockRejectedValueOnce(new Error('restricted'));
    const withoutUrl = await extractArticleFromActiveTab().catch(value => value);
    expect(withoutUrl).toMatchObject({tabId: 4, tabUrl: undefined});
  });

  it('uses the active tab when no tab id is supplied', async () => {
    await extractArticleFromActiveTab();
    expect(api.tabsQuery).toHaveBeenCalledWith({active: true, currentWindow: true});
  });

  it('injects the content script then retries after 150ms', async () => {
    vi.useFakeTimers();
    api.sendMessage.mockRejectedValueOnce(new Error('not ready')).mockRejectedValueOnce(new Error('not ready'))
      .mockResolvedValueOnce({success: true, data: article});
    const result = extractArticleFromActiveTab(4);
    await vi.waitFor(() => expect(api.executeScript).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(150);
    await expect(result).resolves.toEqual(article);
    expect(api.executeScript).toHaveBeenCalledWith({target: {tabId: 4}, files: ['content.js']});
  });

  it('reports missing tabs, inaccessible pages, and extraction failures', async () => {
    api.tabsQuery.mockResolvedValueOnce([]);
    await expect(extractArticleFromActiveTab()).rejects.toThrow('No active tab found');
    api.sendMessage.mockRejectedValueOnce(new Error('missing'));
    api.executeScript.mockRejectedValueOnce(new Error('restricted'));
    await expect(extractArticleFromActiveTab(4)).rejects.toThrow('Could not access this page: restricted');
    api.sendMessage.mockResolvedValueOnce({success: false, error: 'no article'});
    await expect(extractArticleFromActiveTab(4)).rejects.toThrow('no article');
  });
});
