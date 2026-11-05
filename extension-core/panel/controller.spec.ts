import {beforeEach, describe, expect, it, vi} from 'vitest';

type Callback = (...args: never[]) => void;
function event() {
  const listeners: Callback[] = [];
  return {addListener: (listener: Callback) => listeners.push(listener), fire: (...args: unknown[]) => {
    for (const listener of listeners) (listener as (...values: unknown[]) => void)(...args);
  }};
}
const fixture = vi.hoisted(() => ({
  tabs: new Map<number, {id: number; url: string; documentId: string}>(),
  session: {} as Record<string, unknown>,
  action: undefined as unknown, command: undefined as unknown, connect: undefined as unknown,
  updated: undefined as unknown, removed: undefined as unknown,
  sendMessage: vi.fn(), sessionGet: vi.fn(), summarize: vi.fn(), history: vi.fn(),
}));
vi.mock('webextension-polyfill', () => ({default: {
  runtime: {id: 'extension-id', getURL: (path: string) => `moz-extension://extension/${path}`, onConnect: {addListener: (fn: unknown) => { fixture.connect = fn; }}},
  action: {onClicked: {addListener: (fn: unknown) => { fixture.action = fn; }}},
  commands: {onCommand: {addListener: (fn: unknown) => { fixture.command = fn; }}},
  tabs: {
    get: vi.fn(async (id: number) => fixture.tabs.get(id)),
    query: vi.fn(async () => [...fixture.tabs.values()].slice(0, 1)),
    create: vi.fn(async () => ({})),
    sendMessage: fixture.sendMessage,
    onUpdated: {addListener: (fn: unknown) => { fixture.updated = fn; }},
    onRemoved: {addListener: (fn: unknown) => { fixture.removed = fn; }},
  },
  scripting: {executeScript: vi.fn()},
  storage: {session: {
    get: fixture.sessionGet,
    set: vi.fn(async (items: Record<string, unknown>) => Object.assign(fixture.session, structuredClone(items))),
    remove: vi.fn(async (key: string) => { delete fixture.session[key]; }),
  }},
}}));
vi.mock('../background/message-router', () => ({handleMessage: fixture.summarize}));
vi.mock('../background/history', () => ({mutateHistory: fixture.history}));

interface Port {
  name: string;
  sender: {id: string; tab: {id: number}; frameId: number; url: string};
  onMessage: ReturnType<typeof event>;
  onDisconnect: ReturnType<typeof event>;
  postMessage: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}
function makePort(tabId: number, sessionId: string, frameId = 2): Port {
  const port: Port = {name: 'summarizer-panel', sender: {id: 'extension-id', tab: {id: tabId}, frameId,
    url: `moz-extension://extension/panel/index.html?session=${sessionId}`},
  onMessage: event(), onDisconnect: event(), postMessage: vi.fn(), disconnect: vi.fn()};
  return port;
}
async function connect(port: Port, sessionId: string): Promise<void> {
  (fixture.connect as (port: Port) => void)(port);
  port.onMessage.fire({type: 'PANEL_READY', sessionId});
  await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalled());
}

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); fixture.session = {};
  fixture.tabs = new Map([[1, {id: 1, url: 'https://example.test/article', documentId: 'doc-a'}]]);
  fixture.sessionGet.mockImplementation(async (key: string) => ({[key]: fixture.session[key]}));
  fixture.sendMessage.mockImplementation(async (tabId: number, message: {type: string; documentId?: string}) => {
    const tab = fixture.tabs.get(tabId);
    if (message.type === 'PANEL_IDENTITY') return {success: true, documentId: tab?.documentId, url: tab?.url};
    if (message.type === 'PANEL_SHOW') return {success: message.documentId === tab?.documentId};
    return {success: true};
  });
  fixture.history.mockResolvedValue([]);
});

describe('floating panel coordinator', () => {
  it('starts once only after authentication and restores the result after hiding', async () => {
    let finish!: (value: unknown) => void;
    fixture.summarize.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const controller = await import('./controller'); controller.setupPanelController();
    await controller.openPanel(1);
    const shown = fixture.sendMessage.mock.calls.find(call => call[1].type === 'PANEL_SHOW')![1];
    expect(fixture.summarize).not.toHaveBeenCalled();
    const port = makePort(1, shown.sessionId);
    await connect(port, shown.sessionId);
    await vi.waitFor(() => expect(fixture.summarize).toHaveBeenCalledOnce());
    expect(fixture.summarize).toHaveBeenCalledWith({type: 'EXTRACT_AND_SUMMARIZE', tabId: 1, documentId: 'doc-a', documentUrl: 'https://example.test/article'});
    port.onDisconnect.fire();
    await controller.openPanel(1);
    const reopened = makePort(1, shown.sessionId, 3);
    await connect(reopened, shown.sessionId);
    expect(fixture.summarize).toHaveBeenCalledOnce();
    finish({success: true, summary: 'A concise summary', title: 'Article', articleUrl: 'https://example.test/article'});
    await vi.waitFor(() => expect(fixture.history).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(reopened.postMessage).toHaveBeenCalledWith(expect.objectContaining({type: 'PANEL_STATE', state: expect.objectContaining({state: 'success'})})));
    expect(fixture.session['panel-session-1']).not.toHaveProperty('articleText');
  });

  it('keeps concurrent tab jobs and results isolated', async () => {
    fixture.tabs.set(2, {id: 2, url: 'https://example.test/second', documentId: 'doc-b'});
    fixture.summarize.mockImplementation(async (request: {tabId: number}) => ({
      success: true, summary: `Summary for ${request.tabId}`, articleUrl: fixture.tabs.get(request.tabId)?.url,
    }));
    const controller = await import('./controller'); controller.setupPanelController();
    await Promise.all([controller.openPanel(1), controller.openPanel(2)]);
    const show1 = fixture.sendMessage.mock.calls.find(call => call[0] === 1 && call[1].type === 'PANEL_SHOW')![1];
    const show2 = fixture.sendMessage.mock.calls.find(call => call[0] === 2 && call[1].type === 'PANEL_SHOW')![1];
    expect(show1.sessionId).not.toBe(show2.sessionId);
    const first = makePort(1, show1.sessionId), second = makePort(2, show2.sessionId);
    await Promise.all([connect(first, show1.sessionId), connect(second, show2.sessionId)]);
    await vi.waitFor(() => expect(fixture.history).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => {
      expect(first.postMessage).toHaveBeenCalledWith(expect.objectContaining({state: expect.objectContaining({
        tabId: 1, summary: expect.objectContaining({summary: 'Summary for 1'}),
      })}));
      expect(second.postMessage).toHaveBeenCalledWith(expect.objectContaining({state: expect.objectContaining({
        tabId: 2, summary: expect.objectContaining({summary: 'Summary for 2'}),
      })}));
    });
  });

  it('routes the existing summarize shortcut and toolbar action to the supplied tabs', async () => {
    fixture.tabs.set(2, {id: 2, url: 'https://example.test/second', documentId: 'doc-b'});
    const controller = await import('./controller'); controller.setupPanelController();
    (fixture.command as (command: string, tab: {id: number}) => void)('open-sidebar-and-summarize', {id: 2});
    (fixture.action as (tab: {id: number}) => void)({id: 1});
    await vi.waitFor(() => {
      expect(fixture.sendMessage).toHaveBeenCalledWith(2, expect.objectContaining({type: 'PANEL_SHOW'}), {frameId: 0});
      expect(fixture.sendMessage).toHaveBeenCalledWith(1, expect.objectContaining({type: 'PANEL_SHOW'}), {frameId: 0});
    });
    expect(fixture.summarize).not.toHaveBeenCalled();
  });

  it('rejects a forged session without generating or granting frame access', async () => {
    const controller = await import('./controller'); controller.setupPanelController();
    await controller.openPanel(1);
    const port = makePort(1, 'forged');
    await connect(port, 'forged');
    expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({type: 'PANEL_REJECTED'}));
    expect(fixture.summarize).not.toHaveBeenCalled();
    expect(controller.isAuthorizedPanelSender(port.sender)).toBe(false);
    const encoded = {...port.sender, url: 'moz-extension://extension/panel/%69ndex.html?session=forged'};
    expect(controller.isAuthorizedPanelSender(encoded)).toBe(false);
  });

  it('saves a job finishing after navigation without delivering it to the next document', async () => {
    let finish!: (value: unknown) => void;
    fixture.summarize.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const controller = await import('./controller'); controller.setupPanelController();
    await controller.openPanel(1);
    const shown = fixture.sendMessage.mock.calls.find(call => call[1].type === 'PANEL_SHOW')![1];
    const port = makePort(1, shown.sessionId);
    await connect(port, shown.sessionId);
    await vi.waitFor(() => expect(fixture.summarize).toHaveBeenCalledOnce());
    const before = port.postMessage.mock.calls.length;
    (fixture.updated as (tabId: number, change: object) => void)(1, {status: 'loading'});
    finish({success: true, summary: 'Old article', title: 'Old'});
    await vi.waitFor(() => expect(fixture.history).toHaveBeenCalledOnce());
    expect(port.postMessage).toHaveBeenCalledTimes(before);
    expect(port.disconnect).toHaveBeenCalled();
  });

  it('never authorizes a frame that disconnects during session recovery', async () => {
    const snapshot = {id: 'saved-session', tabId: 1, url: 'https://example.test/article', documentId: 'doc-a'};
    let finish!: (value: Record<string, unknown>) => void;
    fixture.sessionGet.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const controller = await import('./controller'); controller.setupPanelController();
    const port = makePort(1, 'saved-session');
    (fixture.connect as (port: Port) => void)(port);
    port.onMessage.fire({type: 'PANEL_READY', sessionId: 'saved-session'});
    port.onDisconnect.fire();
    finish({'panel-session-1': snapshot});
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(port.postMessage).not.toHaveBeenCalled();
    expect(controller.isAuthorizedPanelSender(port.sender)).toBe(false);
    expect(fixture.summarize).not.toHaveBeenCalled();
  });

  it('restores an interrupted loading snapshot as a retryable error after restart', async () => {
    fixture.session['panel-session-1'] = {id: 'saved-session', tabId: 1, url: 'https://example.test/article', documentId: 'doc-a',
      state: {jobId: 'job', tabId: 1, documentUrl: 'https://example.test/article', state: 'loading'}};
    const controller = await import('./controller'); controller.setupPanelController();
    const port = makePort(1, 'saved-session');
    await connect(port, 'saved-session');
    expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({type: 'PANEL_STATE', state: expect.objectContaining({state: 'error', error: expect.stringContaining('interrupted')})}));
    expect(fixture.summarize).not.toHaveBeenCalled();
  });
});
