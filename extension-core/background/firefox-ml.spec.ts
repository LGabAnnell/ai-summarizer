import {beforeEach, describe, expect, it, vi} from 'vitest';

const api = vi.hoisted(() => ({contains: vi.fn(), runEngine: vi.fn()}));
vi.mock('webextension-polyfill', () => ({default: {permissions: {contains: api.contains}}}));
vi.mock('../ml/ml-engine-manager', () => ({mlEngineManager: {runEngine: api.runEngine}}));
import {callFirefoxMLProvider, getSystemPrompt} from './firefox-ml';
import {DEFAULT_SETTINGS} from './settings';

const article = {url: 'https://example.com', title: 'Title', textContent: 'Body', byline: '', length: 4};
const settings = {...DEFAULT_SETTINGS, provider: 'firefox-ml' as const, model: 'model', mlTimeout: 1000};

describe('Firefox ML summary provider', () => {
  beforeEach(() => { vi.clearAllMocks(); api.contains.mockResolvedValue(true); });
  it('requires permission and maps errors', async () => {
    api.contains.mockResolvedValueOnce(false);
    await expect(callFirefoxMLProvider(article, settings)).resolves.toMatchObject({error: expect.stringContaining('trialML permission is required')});
  });
  it('passes the existing prompt and engine config, then trims and counts tokens', async () => {
    api.runEngine.mockResolvedValueOnce([{summary_text: '  summary  '}]);
    await expect(callFirefoxMLProvider(article, {...settings, customPrompt: 'Custom instruction'})).resolves.toEqual({summary: 'summary', tokenCount: 2});
    expect(api.runEngine).toHaveBeenCalledWith('Custom instruction\n\nArticle: Title\n\nBody', 1000, expect.objectContaining({modelId: 'model', taskName: 'summarization'}));
    expect(api.contains).toHaveBeenCalledWith({permissions: ['trialML']});
    expect(api.runEngine.mock.calls[0][2]).toMatchObject({taskOptions: {max_length: 500, min_length: 30, do_sample: true, temperature: 0.7, num_return_sequences: 1}});
  });
  it('keeps Firefox prompt text and custom prompt priority', () => {
    expect(getSystemPrompt('concise')).toBe('You are a helpful assistant that summarizes articles. Please provide a concise summary in 2-3 sentences.');
    expect(getSystemPrompt('detailed', ' custom ')).toBe(' custom ');
  });

  it('handles empty and malformed model results', async () => {
    api.runEngine.mockResolvedValueOnce([]);
    await expect(callFirefoxMLProvider(article, settings)).resolves.toMatchObject({error: 'Firefox ML error: Firefox ML error: Firefox ML returned no results'});
    api.runEngine.mockResolvedValueOnce([{summary_text: '  '}]);
    await expect(callFirefoxMLProvider(article, settings)).resolves.toMatchObject({error: 'Firefox ML error: Firefox ML error: Firefox ML returned empty summary'});
  });

  it.each([
    ['permission denied', 'ML permission denied. Please grant trialML permission in extension settings and ensure Firefox ML is enabled in about:config (browser.ml.enable and extensions.ml.enabled must be true).'],
    ['model missing', 'Model model not available. Firefox ML models need to be downloaded on first use. Check that you have internet connectivity for the initial model download.'],
    ['API unavailable', 'Firefox ML API is not available in this Firefox version. Requires Firefox Nightly or Beta with ML enabled in about:config.'],
  ])('translates engine error: %s', async (cause, expected) => {
    api.runEngine.mockRejectedValueOnce(new Error(cause));
    await expect(callFirefoxMLProvider(article, settings)).resolves.toMatchObject({error: `Firefox ML error: ${expected}`});
  });
});
