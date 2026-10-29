import {beforeEach, describe, expect, it, vi} from 'vitest';

const storage = vi.hoisted(() => ({get: vi.fn(), set: vi.fn(), remove: vi.fn(), getKeys: vi.fn()}));
vi.mock('webextension-polyfill', () => ({default: {storage: {local: storage}}}));
import {getSettings, handleSaveSettings} from './settings';
import {cacheSummary, getCachedSummary, handleClearCache} from './summary-cache';

const article = {
  url: 'https://example.com/über',
  title: 'Test',
  textContent: 'Text',
  byline: '',
  length: 4,
};

describe('background settings and summary cache', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    storage.get.mockResolvedValue({});
    storage.set.mockResolvedValue(undefined);
    storage.remove.mockResolvedValue(undefined);
  });

  it('merges saved settings over defaults', async () => {
    storage.get.mockResolvedValueOnce({extension_settings: {apiKey: 'secret'}});
    const settings = await getSettings();
    expect(settings.apiKey).toBe('secret');
    expect(settings.provider).toBe('mistral');
    expect(settings.mlTimeout).toBe(720000);
    expect(settings.customPrompt).toBe('');
    expect(settings.cacheTTL).toBe(7);
  });

  it('preserves replacement-style partial saves and validates storage errors', async () => {
    await expect(handleSaveSettings({apiKey: 'key'})).resolves.toMatchObject({success: true});
    expect(storage.set).toHaveBeenCalledWith({extension_settings: {apiKey: 'key'}});
    storage.set.mockRejectedValueOnce(new Error('storage full'));
    await expect(handleSaveSettings({apiKey: 'key'})).resolves.toMatchObject({success: false, error: 'Failed to save settings: storage full'});
    await expect(handleSaveSettings({apiKey: 42} as never)).resolves.toMatchObject({success: false, error: 'Invalid API key format'});
  });

  it('stores and reads Unicode URLs with agent labels', async () => {
    await cacheSummary(article, {provider: 'mistral', model: 'mistral-small', mistralAgentId: 'agent', mistralAgentVersion: '1'}, 'Summary', ['a', 'b']);
    const [payload] = storage.set.mock.calls[0] as [Record<string, {agentLabels?: string[]; url: string}>];
    const [key, cached] = Object.entries(payload)[0];
    const expectedKey = `summary_cache_${btoa(encodeURIComponent([
      article.url, 'mistral', 'mistral-small', '', 'concise',
    ].join('|')))}`;
    expect(key).toBe(expectedKey);
    expect(cached.url).toBe(article.url);
    expect(cached.agentLabels).toEqual(['a', 'b']);
    storage.get.mockResolvedValueOnce(payload);
    await expect(getCachedSummary(article, {provider: 'mistral', model: 'mistral-small'})).resolves.toEqual({summary: 'Summary', agentLabels: ['a', 'b']});
    expect(storage.get).toHaveBeenLastCalledWith(expectedKey);
  });

  it('expires entries using configured TTL and defaults to seven days', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-10T00:00:00Z'));
    await cacheSummary(article, {provider: 'openai', model: 'm'}, 'Summary');
    const payload = storage.set.mock.calls[0][0];
    const key = Object.keys(payload)[0];
    storage.get.mockResolvedValueOnce(payload);
    vi.setSystemTime(new Date('2026-01-18T00:00:00Z'));
    await expect(getCachedSummary(article, {provider: 'openai', model: 'm'})).resolves.toBeNull();
    expect(storage.remove).toHaveBeenCalledWith(key);
    storage.get.mockResolvedValueOnce(payload);
    await expect(getCachedSummary(article, {provider: 'openai', model: 'm', cacheTTL: 10})).resolves.toMatchObject({summary: 'Summary'});
  });

  it('clears only summary cache keys and reports storage errors', async () => {
    storage.getKeys.mockResolvedValueOnce(['summary_cache_a', 'extension_settings', 'summary_cache_b']);
    await expect(handleClearCache()).resolves.toMatchObject({success: true, data: {cleared: 2}});
    expect(storage.remove).toHaveBeenCalledWith(['summary_cache_a', 'summary_cache_b']);
    storage.getKeys.mockRejectedValueOnce(new Error('unavailable'));
    await expect(handleClearCache()).resolves.toMatchObject({success: false, error: 'Failed to clear cache: Error: unavailable'});
  });
});
