// @vitest-environment jsdom
import {beforeEach, describe, expect, it, vi} from 'vitest';

const harness = vi.hoisted(() => ({
  listener: undefined as ((message: unknown, sender: unknown, reply: (value: unknown) => void) => unknown) | undefined,
  installer: vi.fn(), shellHandler: vi.fn(),
}));
vi.mock('../panel/shell', () => ({installPanelShell: harness.installer}));
vi.mock('@mozilla/readability', () => ({Readability: class {parse() { return null; }}}));
vi.mock('webextension-polyfill', () => ({default: {
  runtime: {onMessage: {addListener: (listener: typeof harness.listener) => { harness.listener = listener; }}},
  storage: {local: {get: vi.fn(async () => ({}))}, onChanged: {addListener: vi.fn()}},
}}));

describe('content extraction', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    harness.shellHandler.mockReturnValue(true);
    harness.installer.mockReturnValue(harness.shellHandler);
    delete (globalThis as typeof globalThis & {__articleSummarizerInstalled?: boolean}).__articleSummarizerInstalled;
    document.body.innerHTML = '<main><h1>Article title</h1><p>The real article content.</p><div data-ai-summarizer-panel>Summary panel content must not leak.</div></main>';
    await import('./content');
  });
  it('excludes the extension panel from fallback article text', () => {
    const reply = vi.fn();
    harness.listener?.({type: 'EXTRACT_ARTICLE'}, {}, reply);
    const response = reply.mock.calls[0][0] as {data: {textContent: string}};
    expect(response.data.textContent).toContain('The real article content.');
    expect(response.data.textContent).not.toContain('Summary panel content must not leak.');
  });
  it('installs the panel shell only after a valid show request', () => {
    const reply = vi.fn();
    harness.listener?.({type: 'PANEL_IDENTITY'}, {}, reply);
    const identity = reply.mock.calls[0][0] as {documentId: string};
    harness.listener?.({type: 'EXTRACT_ARTICLE'}, {}, reply);
    harness.listener?.({type: 'PANEL_SHOW', sessionId: 'session', documentId: 'wrong'}, {}, reply);
    harness.listener?.({type: 'PANEL_SHOW', documentId: identity.documentId}, {}, reply);
    expect(harness.installer).not.toHaveBeenCalled();
    harness.listener?.({type: 'PANEL_SHOW', sessionId: 'session', documentId: identity.documentId}, {}, reply);
    harness.listener?.({type: 'PANEL_SHOW', sessionId: 'session', documentId: identity.documentId}, {}, reply);
    expect(harness.installer).toHaveBeenCalledOnce();
    expect(harness.shellHandler).toHaveBeenCalledTimes(2);
  });
  it('refuses extraction after a same-document navigation to a different URL', () => {
    const reply = vi.fn();
    harness.listener?.({type: 'EXTRACT_ARTICLE', documentUrl: 'https://other.test/old-article'}, {}, reply);
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({success: false, error: expect.stringContaining('changed')}));
  });
  it('refuses extraction against another document identity', () => {
    const reply = vi.fn();
    harness.listener?.({type: 'EXTRACT_ARTICLE', documentId: 'different-document'}, {}, reply);
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({success: false, error: expect.stringContaining('changed')}));
  });
});
