import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {ArticleData} from '@shared/lib/models/article.model';
import type {ResolvedSettings} from './settings';

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  getCachedSummary: vi.fn(),
  cacheSummary: vi.fn(),
  callProviderAPI: vi.fn(),
  classifyText: vi.fn(),
  classifyAgent: vi.fn(),
  updateCachedAgentLabels: vi.fn(),
}));

vi.mock('./settings', () => ({getSettings: mocks.getSettings}));
vi.mock('./summary-cache', () => ({cacheSummary: mocks.cacheSummary, getCachedSummary: mocks.getCachedSummary, updateCachedAgentLabels: mocks.updateCachedAgentLabels}));
vi.mock('./provider-client', () => ({callProviderAPI: mocks.callProviderAPI}));
vi.mock('../ml/text-classifier.service', () => ({textClassifierService: {classifyText: mocks.classifyText}}));
vi.mock('./agent-classification', () => ({classifySummaryWithMistralAgent: mocks.classifyAgent}));

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
  mistralAgentEnabled: true,
  mistralAgentId: 'agent-id',
  mistralAgentVersion: 'v2',
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
    mocks.classifyAgent.mockResolvedValue({labels: ['one', 'two', 'three', 'four', 'five']});
  });

  it.each([false, undefined])('skips agent classification when enabled is %s for fresh and cached summaries', async enabled => {
    mocks.getSettings.mockResolvedValue({...settings, mistralAgentEnabled: enabled});
    const fresh = await handleSummarize(article);
    expect(fresh.success).toBe(true);
    expect(fresh.agentLabels).toBeUndefined();
    mocks.getCachedSummary.mockResolvedValue({summary: 'Cached', agentLabels: ['one', 'two', 'three', 'four', 'five'], agentId: 'agent-id', agentVersion: 'v2'});
    const cached = await handleSummarize(article);
    expect(cached.success).toBe(true);
    expect(cached.agentLabels).toBeUndefined();
    expect(mocks.classifyAgent).not.toHaveBeenCalled();
    expect(mocks.updateCachedAgentLabels).not.toHaveBeenCalled();
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
      agentLabels: ['one', 'two', 'three', 'four', 'five'],
    });
    expect(mocks.cacheSummary).toHaveBeenCalledWith(article, expect.objectContaining({provider: 'mistral'}), 'Fresh summary', ['one', 'two', 'three', 'four', 'five']);
    expect(mocks.classifyAgent).toHaveBeenCalledOnce();
    expect(mocks.classifyText).toHaveBeenCalledWith('Fresh summary', {timeout: settings.mlTimeout, modelHub: settings.mlModelHub});
    expect(mocks.classifyText.mock.calls[0][1]).not.toHaveProperty('modelId');
  });

  it('returns cached labels and classification while omitting TTL from lookup settings', async () => {
    mocks.getCachedSummary.mockResolvedValue({summary: 'Cached summary', agentLabels: ['a', 'b']});
    const response = await handleSummarize(article, 'openai');
    expect(response).toMatchObject({
      type: 'SUMMARIZE_RESPONSE', summary: 'Cached summary', success: true, cached: true,
      classification: {ok: true, label: 'positive', score: 0.9, modelId: 'classifier', inferenceTime: 45},
    });
    expect(mocks.getCachedSummary).toHaveBeenCalledWith(article, {
      provider: 'openai', model: settings.model, customPrompt: settings.customPrompt, summaryStyle: settings.summaryStyle,
    });
    expect(mocks.getCachedSummary.mock.calls[0][1]).not.toHaveProperty('cacheTTL');
    expect(mocks.callProviderAPI).not.toHaveBeenCalled();
    expect(mocks.cacheSummary).not.toHaveBeenCalled();
    expect(mocks.classifyText).toHaveBeenCalledWith('Cached summary', {timeout: settings.mlTimeout, modelHub: settings.mlModelHub});
    expect(mocks.classifyAgent).not.toHaveBeenCalled();
  });

  it('uses matching cached agent labels without calling the agent', async () => {
    mocks.getCachedSummary.mockResolvedValue({summary: 'Cached summary', agentLabels: ['one', 'two', 'three', 'four', 'five'], agentId: 'agent-id', agentVersion: 'v2'});
    const response = await handleSummarize(article);
    expect(response.agentLabels).toEqual(['one', 'two', 'three', 'four', 'five']);
    expect(mocks.classifyAgent).not.toHaveBeenCalled();
    expect(mocks.updateCachedAgentLabels).not.toHaveBeenCalled();
  });

  it.each([
    ['missing labels', {summary: 'Cached summary', timestamp: 123}],
    ['changed agent ID and version', {summary: 'Cached summary', agentLabels: ['one', 'two', 'three', 'four', 'old'], agentId: 'old-agent-id', agentVersion: 'v1'}],
  ])('classifies cached summaries with %s and updates only classification metadata', async (_case, cached) => {
    mocks.getCachedSummary.mockResolvedValue(cached);
    const response = await handleSummarize(article);
    expect(response.agentLabels).toEqual(['one', 'two', 'three', 'four', 'five']);
    expect(mocks.updateCachedAgentLabels).toHaveBeenCalledWith(article, expect.objectContaining({mistralAgentId: 'agent-id', mistralAgentVersion: 'v2'}), ['one', 'two', 'three', 'four', 'five']);
  });

  it('returns a cached summary when label persistence fails after classification', async () => {
    mocks.getCachedSummary.mockResolvedValue({summary: 'Cached summary', timestamp: 123});
    mocks.updateCachedAgentLabels.mockRejectedValue(new Error('storage unavailable'));
    const response = await handleSummarize(article);
    expect(response).toMatchObject({success: true, summary: 'Cached summary', cached: true, agentLabels: ['one', 'two', 'three', 'four', 'five']});
    expect(response.agentClassificationError).toBeUndefined();
    expect(mocks.callProviderAPI).not.toHaveBeenCalled();
    expect(mocks.classifyText).toHaveBeenCalledWith('Cached summary', {timeout: settings.mlTimeout, modelHub: settings.mlModelHub});
  });

  it('reports agent errors while preserving summary success and does not cache stale labels', async () => {
    mocks.classifyAgent.mockResolvedValue({error: 'Agent timed out'});
    const response = await handleSummarize(article);
    expect(response).toMatchObject({success: true, agentClassificationError: 'Agent timed out'});
    expect(response.agentLabels).toBeUndefined();
    expect(mocks.cacheSummary).toHaveBeenCalledWith(article, expect.anything(), 'Fresh summary', undefined);
  });

  it('rejects invalid agent output and skips the agent for a non-Mistral provider', async () => {
    mocks.classifyAgent.mockResolvedValue({labels: ['only', 'four', 'labels', 'here']});
    const invalid = await handleSummarize(article);
    expect(invalid).toMatchObject({success: true, agentClassificationError: 'Mistral agent returned invalid labels'});
    expect(invalid.agentLabels).toBeUndefined();

    vi.clearAllMocks();
    mocks.getSettings.mockResolvedValue({...settings, provider: 'openai'});
    mocks.classifyAgent.mockResolvedValue({labels: ['one', 'two', 'three', 'four', 'five']});
    const otherProvider = await handleSummarize(article);
    expect(otherProvider.success).toBe(true);
    expect(otherProvider.agentLabels).toBeUndefined();
    expect(mocks.classifyAgent).not.toHaveBeenCalled();
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
