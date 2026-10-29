import {beforeEach, describe, expect, it, vi} from 'vitest';

const setup = vi.hoisted(() => ({
  listener: undefined as ((request: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean) | undefined,
  addListener: vi.fn((listener: (request: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean) => { setup.listener = listener; }),
  handleMessage: vi.fn(),
  setupProgress: vi.fn(),
  setupSidebar: vi.fn(),
}));
vi.mock('webextension-polyfill', () => ({default: {runtime: {onMessage: {addListener: setup.addListener}}}}));
vi.mock('./background/message-router', () => ({handleMessage: setup.handleMessage}));
vi.mock('./background/ml-progress', () => ({setupMLProgressBroadcasting: setup.setupProgress}));
vi.mock('./sidebar-shortcut', () => ({setupSidebarShortcut: setup.setupSidebar}));

describe('background service worker entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    setup.listener = undefined;
  });

  async function startBackground(): Promise<void> {
    await import('./background');
  }

  it('registers one async response listener and initializes background facilities', async () => {
    await startBackground();
    expect(setup.addListener).toHaveBeenCalledOnce();
    expect(setup.setupProgress).toHaveBeenCalledOnce();
    expect(setup.setupSidebar).toHaveBeenCalledOnce();
    expect(setup.listener).toBeTypeOf('function');

    let resolveHandler!: (value: unknown) => void;
    setup.handleMessage.mockReturnValue(new Promise(resolve => { resolveHandler = resolve; }));
    const sendResponse = vi.fn();
    const keepChannelOpen = setup.listener?.({type: 'GET_SETTINGS'}, {}, sendResponse);
    expect(keepChannelOpen).toBe(true);
    expect(sendResponse).not.toHaveBeenCalled();
    resolveHandler({type: 'GET_SETTINGS_RESPONSE', success: true});
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({type: 'GET_SETTINGS_RESPONSE', success: true}));
    expect(setup.handleMessage).toHaveBeenCalledWith({type: 'GET_SETTINGS'});
  });

  it('responds with an error envelope when a message handler rejects', async () => {
    await startBackground();
    setup.handleMessage.mockRejectedValue(new Error('unexpected failure'));
    const sendResponse = vi.fn();
    expect(setup.listener?.({type: 'CLEAR_CACHE'}, {}, sendResponse)).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({
      type: 'ERROR_RESPONSE', error: 'Unhandled error: unexpected failure', success: false,
    }));
  });
});
