import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const api = vi.hoisted(() => ({
  progressListener: undefined as ((event: Record<string, unknown>) => void) | undefined,
  addProgressListener: vi.fn((listener: (event: Record<string, unknown>) => void) => { api.progressListener = listener; }),
  tabsQuery: vi.fn(),
  sendMessage: vi.fn(),
  trial: {ml: {onProgress: {addListener: vi.fn((listener: (event: Record<string, unknown>) => void) => { api.progressListener = listener; })}}} as unknown,
}));
vi.mock('webextension-polyfill', () => ({default: {
  get trial() { return api.trial; },
  tabs: {query: api.tabsQuery, sendMessage: api.sendMessage},
}}));

import {setupMLProgressBroadcasting} from './ml-progress';

describe('ML progress broadcasting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.progressListener = undefined;
    api.trial = {ml: {onProgress: {addListener: vi.fn((listener: (event: Record<string, unknown>) => void) => { api.progressListener = listener; })}}};
    api.tabsQuery.mockResolvedValue([{id: 1}, {}, {id: 3}]);
    api.sendMessage.mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('registers exactly one listener only when setup is explicitly invoked', async () => {
    const addListener = vi.mocked((api.trial as {ml: {onProgress: {addListener: typeof vi.fn}}}).ml.onProgress.addListener);
    expect(api.progressListener).toBeUndefined();
    setupMLProgressBroadcasting();
    expect(addListener).toHaveBeenCalledOnce();
    expect(api.progressListener).toBeTypeOf('function');
    api.progressListener?.({progress: 0.25});
    await vi.waitFor(() => expect(api.tabsQuery).toHaveBeenCalledWith({}));
  });

  it('rounds fractional progress, fills absent fields, and sends to identified tabs', async () => {
    setupMLProgressBroadcasting();
    api.progressListener?.({progress: 0.456, modelId: 'model-x', status: 'loading', message: 'fetching'});
    await vi.waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(2));
    expect(api.sendMessage).toHaveBeenNthCalledWith(1, 1, {
      type: 'MODEL_DOWNLOAD_PROGRESS', progress: 46, modelId: 'model-x', status: 'loading', message: 'fetching',
    });
    expect(api.sendMessage).toHaveBeenNthCalledWith(2, 3, {
      type: 'MODEL_DOWNLOAD_PROGRESS', progress: 46, modelId: 'model-x', status: 'loading', message: 'fetching',
    });
  });

  it('uses fallback progress metadata and ignores rejected tab sends', async () => {
    api.sendMessage.mockRejectedValue(new Error('no content script'));
    setupMLProgressBroadcasting();
    api.progressListener?.({progress: 0, message: 'waiting'});
    await vi.waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(2));
    expect(api.sendMessage).toHaveBeenCalledWith(1, {
      type: 'MODEL_DOWNLOAD_PROGRESS', progress: 0, modelId: 'unknown', status: 'downloading', message: 'waiting',
    });
  });

  it('logs and returns gracefully when the browser has no trial ML API', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    api.trial = undefined;
    expect(() => setupMLProgressBroadcasting()).not.toThrow();
    expect(error).toHaveBeenCalledOnce();
    expect(api.progressListener).toBeUndefined();
  });
});
