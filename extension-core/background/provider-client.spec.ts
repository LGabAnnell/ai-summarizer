import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  createProvider: vi.fn(),
  permissionContains: vi.fn(),
  fetch: vi.fn(),
  provider: {
    buildRequest: vi.fn(),
    parseResponse: vi.fn(),
    fetchModels: vi.fn(),
  },
}));
vi.mock('../providers', () => ({createProvider: mocks.createProvider}));
vi.mock('webextension-polyfill', () => ({default: {permissions: {contains: mocks.permissionContains}}}));
import {callProviderAPI, handleRefreshModels, testProviderConnection} from './provider-client';
import {DEFAULT_SETTINGS} from './settings';

const article = {url: 'https://example.com', title: 'Title', textContent: 'Body', byline: '', length: 4};
const settings = {...DEFAULT_SETTINGS, provider: 'custom' as const, apiKey: 'secret', model: 'my-model', customEndpoint: 'https://api.example/v1', temperature: 0.2, maxTokens: 80};
const response = (ok: boolean, body: unknown, status = 401) => ({
  ok, status, json: vi.fn().mockResolvedValue(body), text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
});

describe('provider client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.createProvider.mockReturnValue(mocks.provider);
    mocks.provider.buildRequest.mockReturnValue({url: 'https://api.example/v1', method: 'POST', headers: {Authorization: 'Bearer secret'}, body: {model: 'my-model'}});
    mocks.provider.parseResponse.mockReturnValue({summary: 'Summary', tokenCount: 17});
    mocks.provider.fetchModels.mockResolvedValue(['z-model', 'a-model']);
    mocks.fetch.mockResolvedValue(response(true, {result: true}));
    mocks.permissionContains.mockResolvedValue(true);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('forwards endpoint and summary settings, sends request and returns parsed token count', async () => {
    await expect(callProviderAPI(article, settings)).resolves.toEqual({summary: 'Summary', tokenCount: 17});
    expect(mocks.createProvider).toHaveBeenCalledWith('custom', 'secret', {endpoint: 'https://api.example/v1'});
    expect(mocks.provider.buildRequest).toHaveBeenCalledWith('Body', 'Title', expect.objectContaining({model: 'my-model', temperature: 0.2, maxTokens: 80}));
    expect(mocks.fetch).toHaveBeenCalledWith('https://api.example/v1', expect.objectContaining({method: 'POST', body: JSON.stringify({model: 'my-model'})}));
    expect(mocks.provider.parseResponse).toHaveBeenCalledWith({result: true});
  });

  it('reports empty summaries and fetch failures', async () => {
    mocks.provider.parseResponse.mockReturnValueOnce({summary: ''});
    await expect(callProviderAPI(article, settings)).resolves.toEqual({summary: '', error: 'Provider error: No summary returned from provider'});
    mocks.fetch.mockRejectedValueOnce(new Error('offline'));
    await expect(callProviderAPI(article, settings)).resolves.toEqual({summary: '', error: 'Provider error: offline'});
  });

  it('preserves JSON and plain-text HTTP errors', async () => {
    mocks.fetch.mockResolvedValueOnce(response(false, {error: {message: 'bad key'}}));
    await expect(callProviderAPI(article, settings)).resolves.toMatchObject({error: 'Provider error: HTTP 401: {"error":{"message":"bad key"}}'});
    mocks.fetch.mockResolvedValueOnce(response(false, 'gateway down', 502));
    await expect(callProviderAPI(article, settings)).resolves.toMatchObject({error: 'Provider error: HTTP 502: gateway down'});
  });

  it('sorts refreshed models, handles missing keys and supplies Firefox models', async () => {
    await expect(handleRefreshModels('custom', 'key')).resolves.toEqual({success: true, data: {models: ['a-model', 'z-model']}});
    await expect(handleRefreshModels('custom', '')).resolves.toEqual({success: false, error: 'API key is required'});
    await expect(handleRefreshModels('firefox-ml', '')).resolves.toEqual({success: true, data: {models: ['Xenova/distilbart-cnn-6-6', 'Xenova/distilbart-cnn-12-6']}});
  });

  it('keeps connection test envelope and Firefox ML permission gating', async () => {
    mocks.provider.fetchModels.mockRejectedValueOnce(new Error('unreachable'));
    await expect(testProviderConnection('custom', 'key')).resolves.toEqual({type: 'TEST_PROVIDER_RESPONSE', success: true, data: {valid: false}, error: 'Failed to refresh models: unreachable'});
    mocks.permissionContains.mockResolvedValueOnce(false);
    await expect(testProviderConnection('firefox-ml', '')).resolves.toMatchObject({success: false, error: expect.stringContaining('trialML permission is required')});
  });
});
