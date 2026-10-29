import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {ArticleData} from '@shared/lib/models/article.model';
import type {ResolvedSettings} from './settings';

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  getCachedSummary: vi.fn(),
  cacheSummary: vi.fn(),
  callProviderAPI: vi.fn(),
  classifyText: vi.fn(),
}));

vi.mock('./settings', () => ({getSettings: mocks.getSettings}));
vi.mock('./summary-cache', () => ({cacheSummary: mocks.cacheSummary, getCachedSummary: mocks.getCachedSummary}));
vi.mock('./provider-client', () => ({callProviderAPI: mocks.callProviderAPI}));
vi.mock('../ml/text-classifier.service', () => ({textClassifierService: {classifyText: mocks.classifyText}}));

import {handleSummarize} from './summarization';

const article: ArticleData = {
  url: 'https://example.com/article',
  title: 'Example',
  textContent: 'Article text',
  byline: '',
  length: 12,
};

const settings: ResolvedSettings = {
  provider: 'mistral',
  apiKey: 'key',
  model: 'mistral-small',
  summaryStyle: 'concise',
  customPrompt: '',
  maxTokens: 500,
  temperature: 0.7,
  cacheEnabled: true,
  cacheTTL: 7,
  mlEnabled: true,
  mlModelHub: 'mozilla',
  mlTimeout: 1234,
};

const classification = {
  ok: true,
  label: 'positive',
  score: 0.9,
  modelId: 'classifier',
  inferenceTime: 45,
  error: 'ignored error field',
  extra: 'ignored extra field',
};

function enableCacheMiss(): void {
  mocks.getCachedSummary.mockResolvedValue(null);
  mocks.callProviderAPI.mockResolvedValue({summary: 'Fresh summary', tokenCount: 9});
}

describe('handleSummarize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSettings.mockResolvedValue({...settings});
    mocks.getCachedSummary.mockResolvedValue(null);
    mocks.cacheSummary.mockResolvedValue(undefined);
    mocks.callProviderAPI.mockResolvedValue({summary: 'Fresh summary', tokenCount: 9});
    mocks.classifyText.mockResolvedValue(classification);
  });

  it('projects successful classification fields on fresh summaries and caches first', async () => {
    const response = await handleSummarize(article);
    expect(response).toEqual({
      type: 'SUMMARIZE_RESPONSE',
      summary: 'Fresh summary',
      success: true,
      cached: false,
      tokenCount: 9,
      classification: {ok: true, label: 'positive', score: 0.9, modelId: 'classifier', inferenceTime: 45},
    });
    expect(mocks.cacheSummary).toHaveBeenCalledBefore(mocks.classifyText);
    expect(mocks.classifyText).toHaveBeenCalledWith('Fresh summary', {timeout: settings.mlTimeout, modelHub: settings.mlModelHub});
    expect(mocks.classifyText.mock.calls[0][1]).not.toHaveProperty('modelId');
  });

  it('returns cached labels and classification while omitting TTL from lookup settings', async () => {
    mocks.getCachedSummary.mockResolvedValue({summary: 'Cached summary', agentLabels: ['a', 'b']});
    const response = await handleSummarize(article, 'openai');
    expect(response).toMatchObject({
      type: 'SUMMARIZE_RESPONSE', summary: 'Cached summary', success: true, cached: true,
      agentLabels: ['a', 'b'],
      classification: {ok: true, label: 'positive', score: 0.9, modelId: 'classifier', inferenceTime: 45},
    });
    expect(mocks.getCachedSummary).toHaveBeenCalledWith(article, {
      provider: 'openai', model: settings.model, customPrompt: settings.customPrompt, summaryStyle: settings.summaryStyle,
    });
    expect(mocks.getCachedSummary.mock.calls[0][1]).not.toHaveProperty('cacheTTL');
    expect(mocks.callProviderAPI).not.toHaveBeenCalled();
    expect(mocks.cacheSummary).not.toHaveBeenCalled();
    expect(mocks.classifyText).toHaveBeenCalledWith('Cached summary', {timeout: settings.mlTimeout, modelHub: settings.mlModelHub});
  });

  it('uses the configured provider for the API when a lookup override misses', async () => {
    enableCacheMiss();
    await handleSummarize(article, 'openai');
    expect(mocks.getCachedSummary.mock.calls[0][1].provider).toBe('openai');
    expect(mocks.callProviderAPI).toHaveBeenCalledWith(article, settings);
  });

  it('does not read or write cache when caching is disabled', async () => {
    mocks.getSettings.mockResolvedValue({...settings, cacheEnabled: false});
    const response = await handleSummarize(article);
    expect(response.success).toBe(true);
    expect(mocks.getCachedSummary).not.toHaveBeenCalled();
    expect(mocks.cacheSummary).not.toHaveBeenCalled();
  });

  it('does not cache or classify provider errors', async () => {
    mocks.callProviderAPI.mockResolvedValue({summary: '', error: 'Provider failed'});
    await expect(handleSummarize(article)).resolves.toEqual({
      type: 'SUMMARIZE_RESPONSE', error: 'Provider failed', success: false,
    });
    expect(mocks.cacheSummary).not.toHaveBeenCalled();
    expect(mocks.classifyText).not.toHaveBeenCalled();
  });

  it.each([
    ['failed classification', () => mocks.classifyText.mockResolvedValue({ok: false, error: 'classification failed'})],
    ['thrown classification', () => mocks.classifyText.mockRejectedValue(new Error('classification crashed'))],
  ])('keeps fresh summary success after %s', async (_description, configureClassification) => {
    configureClassification();
    const response = await handleSummarize(article);
    expect(response).toMatchObject({success: true, summary: 'Fresh summary', cached: false});
    expect(response.classification).toBeUndefined();
  });

  it('keeps cached summary success when classification fails', async () => {
    mocks.getCachedSummary.mockResolvedValue({summary: 'Cached summary'});
    mocks.classifyText.mockResolvedValue({ok: false, error: 'classification failed'});
    const response = await handleSummarize(article);
    expect(response).toMatchObject({success: true, summary: 'Cached summary', cached: true});
    expect(response.classification).toBeUndefined();
  });

  it('returns a summary error when cache storage fails', async () => {
    mocks.cacheSummary.mockRejectedValue(new Error('storage full'));
    await expect(handleSummarize(article)).resolves.toEqual({
      type: 'SUMMARIZE_RESPONSE', success: false, error: 'Summarization error: storage full',
    });
    expect(mocks.classifyText).not.toHaveBeenCalled();
  });
});
