import browser from 'webextension-polyfill';
import type {PanelClientMessage, PanelServerMessage, PanelState} from '@shared/lib/models/panel.model';
import type {SummaryResult} from '@shared/lib/models/summary.model';
import {handleMessage} from '../background/message-router';
import {getHistoryGeneration, mutateHistory} from '../background/history';

interface Session {
  id: string;
  tabId: number;
  url: string;
  documentId: string;
  state?: PanelState;
  ports: Set<browser.Runtime.Port>;
  running: boolean;
}
interface Snapshot {id: string; tabId: number; url: string; documentId: string; state?: PanelState}
type OpenResult = {success: true} | {success: false; error: string; retryable: boolean; permissionRequired: boolean};
interface ErrorToken {tabId: number; retryable: boolean; permissionRequired: boolean}
const sessions = new Map<number, Session>();
const opening = new Map<number, Promise<OpenResult>>();
const reporting = new Map<number, Promise<void>>();
const errorTokens = new Map<string, ErrorToken>();
const trustedFrames = new Map<string, {sessionId: string; port: browser.Runtime.Port}>();
const snapshotQueues = new Map<number, Promise<void>>();
interface TabLifecycle {url?: string}
const tabLifecycles = new Map<number, TabLifecycle>();
const SNAPSHOT_PREFIX = 'panel-session-';
const panelUrl = browser.runtime.getURL('panel/index.html');

function canonical(url: string): string {
  try { const parsed = new URL(url); parsed.hash = ''; return parsed.href; } catch { return url; }
}
function frameKey(sender: browser.Runtime.MessageSender): string {
  return `${sender.tab?.id}:${sender.frameId}`;
}
export function isAuthorizedPanelSender(sender: browser.Runtime.MessageSender): boolean {
  if (!sender.url) return true;
  let url: URL;
  try { url = new URL(sender.url); } catch { return false; }
  const panel = new URL(panelUrl);
  if (url.protocol !== panel.protocol || url.host !== panel.host) return true;
  let path: string;
  try { path = decodeURIComponent(url.pathname); } catch { return false; }
  if (path !== panel.pathname) {
    // No other extension-origin page should run inside an arbitrary web page.
    return !sender.frameId;
  }
  // Only the exact packaged URL may connect; encoded aliases cannot bypass auth.
  if (url.pathname !== panel.pathname) return false;
  const tabId = sender.tab?.id;
  const session = tabId === undefined ? undefined : sessions.get(tabId);
  return !!session && trustedFrames.get(frameKey(sender))?.sessionId === session.id &&
    url.searchParams.get('session') === session.id;
}
function broadcast(session: Session): void {
  if (!session.state) return;
  const message: PanelServerMessage = {type: 'PANEL_STATE', state: session.state};
  for (const port of session.ports) {
    try { port.postMessage(message); } catch { session.ports.delete(port); }
  }
}
function queueSnapshot(tabId: number, action: () => Promise<void>): Promise<void> {
  const operation = (snapshotQueues.get(tabId) ?? Promise.resolve()).then(action);
  const settled = operation.catch(error => { console.error('Could not update panel state:', error); });
  snapshotQueues.set(tabId, settled);
  void settled.then(() => { if (snapshotQueues.get(tabId) === settled) snapshotQueues.delete(tabId); });
  return settled;
}
function lifecycleFor(tabId: number): TabLifecycle {
  let lifecycle = tabLifecycles.get(tabId);
  if (!lifecycle) { lifecycle = {}; tabLifecycles.set(tabId, lifecycle); }
  return lifecycle;
}
function assertCurrentLifecycle(tabId: number, lifecycle: object): void {
  if (tabLifecycles.get(tabId) !== lifecycle) throw new Error('The page changed. Try again.');
}
async function readSnapshot(tabId: number, lifecycle: object): Promise<Snapshot | undefined> {
  await snapshotQueues.get(tabId);
  assertCurrentLifecycle(tabId, lifecycle);
  const key = SNAPSHOT_PREFIX + tabId;
  const stored = await browser.storage.session.get(key) as Record<string, Snapshot | undefined>;
  assertCurrentLifecycle(tabId, lifecycle);
  return stored[key];
}
function persist(session: Session): Promise<void> {
  const snapshot: Snapshot = {
    id: session.id, tabId: session.tabId, url: session.url, documentId: session.documentId, state: session.state,
  };
  return queueSnapshot(session.tabId, async() => {
    if (sessions.get(session.tabId) === session) {
      await browser.storage.session.set({[SNAPSHOT_PREFIX + session.tabId]: snapshot});
    }
  });
}
async function errorTab(tabId: number, reason: string, permissionRequired = false, retryable = true): Promise<void> {
  const token = crypto.randomUUID();
  errorTokens.set(token, {tabId, retryable, permissionRequired});
  const query = new URLSearchParams({error: reason, token});
  try { await browser.tabs.create({url: `${panelUrl}?${query}`}); }
  catch (error) { errorTokens.delete(token); throw error; }
}
async function createOrRestore(tabId: number, url: string, documentId: string, lifecycle: object): Promise<Session> {
  assertCurrentLifecycle(tabId, lifecycle);
  const previous = sessions.get(tabId);
  if (previous?.url === url && previous.documentId === documentId) return previous;
  const snapshot = await readSnapshot(tabId, lifecycle);
  let state = snapshot?.url === url && snapshot.documentId === documentId ? snapshot.state : undefined;
  if (state?.state === 'loading') state = {...state, state: 'error', error: 'The summary was interrupted. Try again.'};
  const session: Session = {
    id: snapshot?.url === url && snapshot.documentId === documentId ? snapshot.id : crypto.randomUUID(),
    tabId, url, documentId, state, ports: new Set(), running: false,
  };
  sessions.set(tabId, session);
  await persist(session);
  assertCurrentLifecycle(tabId, lifecycle);
  return session;
}

function isRestrictedUrl(sourceUrl: string): boolean {
  try {
    const url = new URL(sourceUrl);
    const protectedHosts = [
      'addons.mozilla.org', 'support.mozilla.org', 'accounts.firefox.com', 'accounts-static.cdn.mozilla.net',
      'addons.cdn.mozilla.net', 'api.accounts.firefox.com', 'content.cdn.mozilla.net', 'discovery.addons.mozilla.org',
      'install.mozilla.org', 'oauth.accounts.firefox.com', 'profile.accounts.firefox.com', 'sync.services.mozilla.com'];
    return !['https:', 'http:'].includes(url.protocol) || protectedHosts.includes(url.hostname) ||
      url.pathname.toLowerCase().endsWith('.pdf');
  } catch { return true; }
}

async function launch(tabId: number): Promise<OpenResult> {
  let sourceUrl = '';
  const lifecycle = lifecycleFor(tabId);
  try {
    const tab = await browser.tabs.get(tabId);
    assertCurrentLifecycle(tabId, lifecycle);
    sourceUrl = tab.url ?? '';
    if (!tab.url) throw new Error('Firefox could not access this page. Open a regular website and try again.');
    lifecycle.url = canonical(tab.url);
    if (isRestrictedUrl(sourceUrl)) throw new Error('This page is restricted.');
    let identity: {success: boolean; documentId: string; url: string};
    try {
      identity = await browser.tabs.sendMessage(tabId, {type: 'PANEL_IDENTITY'}, {frameId: 0}) as typeof identity;
    } catch {
      assertCurrentLifecycle(tabId, lifecycle);
      await browser.scripting.executeScript({target: {tabId, frameIds: [0]}, files: ['content.js']});
      assertCurrentLifecycle(tabId, lifecycle);
      identity = await browser.tabs.sendMessage(tabId, {type: 'PANEL_IDENTITY'}, {frameId: 0}) as typeof identity;
    }
    assertCurrentLifecycle(tabId, lifecycle);
    if (!identity?.success || !identity.documentId || canonical(identity.url) !== canonical(tab.url)) {
      throw new Error('The page changed. Try again.');
    }
    const session = await createOrRestore(tabId, canonical(identity.url), identity.documentId, lifecycle);
    assertCurrentLifecycle(tabId, lifecycle);
    const result = await browser.tabs.sendMessage(
      tabId, {type: 'PANEL_SHOW', sessionId: session.id, documentId: identity.documentId}, {frameId: 0},
    ) as {success: boolean; error?: string};
    if (!result?.success) throw new Error(result?.error ?? 'Could not open the panel.');
    return {success: true};
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const restricted = isRestrictedUrl(sourceUrl);
    const needsPermission = !restricted &&
      /missing host permission|host permission|cannot access contents|permission/i.test(detail);
    return {
      success: false, error: restricted
        ? 'Firefox does not allow the panel on this page. Open a regular website and try again.'
        : `Could not open the summary panel: ${detail}`, retryable: !restricted, permissionRequired: needsPermission,
    };
  }
}
export function openPanel(tabId: number): Promise<OpenResult> {
  const pending = opening.get(tabId);
  if (pending) return pending;
  const operation = launch(tabId).finally(() => { if (opening.get(tabId) === operation) opening.delete(tabId); });
  opening.set(tabId, operation);
  return operation;
}

function openPanelWithErrorTab(tabId: number): Promise<void> {
  const pending = reporting.get(tabId);
  if (pending) return pending;
  const operation = (async() => {
    const result = await openPanel(tabId);
    if (!result.success) await errorTab(tabId, result.error, result.permissionRequired, result.retryable);
  })().finally(() => reporting.delete(tabId));
  reporting.set(tabId, operation);
  return operation;
}

async function runJob(session: Session): Promise<void> {
  if (session.running) return;
  session.running = true;
  const historyGeneration = getHistoryGeneration();
  const jobId = crypto.randomUUID();
  session.state = {
    jobId, tabId: session.tabId, documentUrl: session.url, documentId: session.documentId, state: 'loading',
  };
  broadcast(session);
  await persist(session);
  try {
    const response = await handleMessage({
      type: 'EXTRACT_AND_SUMMARIZE', tabId: session.tabId, documentId: session.documentId, documentUrl: session.url,
    }) as {
      success: boolean; summary?: string; title?: string; articleUrl?: string; cached?: boolean; tokenCount?: number;
      agentLabels?: string[]; agentClassificationError?: string; classification?: SummaryResult['classification'];
      error?: string; permissionRequired?: boolean;
    };
    if (!response.success) {
      session.state = {
        ...session.state, state: 'error', error: response.error ?? 'Failed to summarize article',
        permissionRequired: response.permissionRequired,
      };
    } else {
      const summary: SummaryResult = {
        summary: response.summary ?? '', title: response.title, articleUrl: response.articleUrl,
        cached: response.cached === true, timestamp: new Date(), tokenCount: response.tokenCount,
        agentLabels: response.agentLabels, agentClassificationError: response.agentClassificationError,
        classification: response.classification,
      };
      let historyError: string | undefined;
      try { await mutateHistory({type: 'HISTORY_ADD', summary, id: jobId, generation: historyGeneration}); }
      catch (error) {
        historyError = `Could not save to history: ${error instanceof Error ? error.message : String(error)}`;
      }
      session.state = {...session.state, state: 'success', summary, historyError};
    }
  } catch (error) {
    session.state = {...session.state, state: 'error', error: error instanceof Error ? error.message : String(error)};
  } finally {
    session.running = false;
    if (sessions.get(session.tabId) === session) { broadcast(session); await persist(session); }
  }
}

export async function handlePanelControl(request: unknown, sender: browser.Runtime.MessageSender): Promise<unknown> {
  if (!request || typeof request !== 'object') return undefined;
  const message = request as {type?: string; token?: string; sessionId?: string};
  if (message.type === 'PANEL_ERROR_VERIFY' || message.type === 'PANEL_REOPEN') {
    if (!sender.url?.startsWith(`${panelUrl}?error=`) || sender.frameId !== 0 || !message.token) {
      return {success: false};
    }
    const token = errorTokens.get(message.token);
    if (!token) return {success: false, error: 'This retry has expired. Use the extension button again.'};
    if (message.type === 'PANEL_ERROR_VERIFY') {
      return {success: true, retryable: token.retryable, permissionRequired: token.permissionRequired};
    }
    if (!token.retryable) return {
      success: false, error: 'Firefox does not allow the panel on this page. Open a regular website and try again.',
      retryable: false, permissionRequired: false,
    };
    const result = await openPanel(token.tabId);
    if (result.success) errorTokens.delete(message.token);
    else { token.retryable = result.retryable; token.permissionRequired = result.permissionRequired; }
    return result;
  }
  if (message.type === 'PANEL_ERROR_TAB') {
    const tabId = sender.tab?.id;
    const session = tabId === undefined ? undefined : sessions.get(tabId);
    if (!session || sender.frameId !== 0 || message.sessionId !== session.id) return {success: false};
    await errorTab(session.tabId, 'The summary panel could not load on this page. Check website access and try again.');
    return {success: true};
  }
  return undefined;
}

interface PanelConnection {
  port: browser.Runtime.Port;
  sender: browser.Runtime.MessageSender;
  key: string;
  attached?: Session;
  disconnected: boolean;
}

async function attachPanel(connection: PanelConnection, sessionId: string): Promise<void> {
  const {port, sender, key} = connection;
  const tabId = sender.tab!.id!;
  const lifecycle = lifecycleFor(tabId);
  let session = sessions.get(tabId);
  if (!session) {
    const snapshot = await readSnapshot(tabId, lifecycle);
    if (snapshot) lifecycle.url = snapshot.url;
    const identity = await browser.tabs.sendMessage(tabId, {type: 'PANEL_IDENTITY'}, {frameId: 0}) as {
      success: boolean; documentId: string; url: string
    };
    assertCurrentLifecycle(tabId, lifecycle);
    if (snapshot?.id === sessionId && identity.success && snapshot.documentId === identity.documentId &&
        snapshot.url === canonical(identity.url)) {
      session = await createOrRestore(tabId, snapshot.url, snapshot.documentId, lifecycle);
    }
  }
  if (connection.disconnected) return;
  assertCurrentLifecycle(tabId, lifecycle);
  if (session?.id !== sessionId || new URL(sender.url!).searchParams.get('session') !== session.id) {
    const rejected: PanelServerMessage = {type: 'PANEL_REJECTED', error: 'This panel session is no longer available.'};
    port.postMessage(rejected); port.disconnect(); return;
  }
  connection.attached = session;
  session.ports.add(port);
  trustedFrames.set(key, {sessionId: session.id, port});
  void browser.tabs.sendMessage(session.tabId, {type: 'PANEL_FRAME_READY', sessionId: session.id}, {frameId: 0})
    .catch(() => undefined);
  if (session.state) broadcast(session); else void runJob(session);
}

async function openPanelSettings(port: browser.Runtime.Port): Promise<void> {
  try { await browser.runtime.openOptionsPage(); }
  catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    try {
      port.postMessage({
        type: 'PANEL_SETTINGS_ERROR', error: `Could not open settings: ${detail}`,
      } satisfies PanelServerMessage);
    }
    catch { /* The panel may have been closed. */ }
  }
}

function handlePanelMessage(connection: PanelConnection, incoming: unknown): void {
  if (!incoming || typeof incoming !== 'object') return;
  const message = incoming as PanelClientMessage;
  if (message.type === 'PANEL_READY') {
    void attachPanel(connection, message.sessionId).catch(() => {
      try { connection.port.disconnect(); } catch { /* disconnected */ }
    });
    return;
  }
  const attached = connection.attached;
  if (attached?.id !== message.sessionId || sessions.get(attached.tabId) !== attached) return;
  if (message.type === 'PANEL_RETRY' && !attached.running) void runJob(attached);
  if (message.type === 'PANEL_CLOSE') {
    void browser.tabs.sendMessage(attached.tabId, {type: 'PANEL_HIDE', sessionId: attached.id}, {frameId: 0})
      .catch(() => undefined);
  }
  if (message.type === 'PANEL_OPEN_SETTINGS') void openPanelSettings(connection.port);
}

function handlePanelConnection(port: browser.Runtime.Port): void {
  if (port.name !== 'summarizer-panel') return;
  const sender = port.sender;
  if (!sender?.url?.startsWith(`${panelUrl}?session=`) || sender.id !== browser.runtime.id ||
      sender.tab?.id === undefined || !sender.frameId) {
    port.disconnect(); return;
  }
  const connection: PanelConnection = {port, sender, key: frameKey(sender), disconnected: false};
  port.onMessage.addListener((incoming: unknown) => handlePanelMessage(connection, incoming));
  port.onDisconnect.addListener(() => {
    connection.disconnected = true;
    connection.attached?.ports.delete(port);
    if (trustedFrames.get(connection.key)?.port === port) trustedFrames.delete(connection.key);
  });
}

function handleAction(tab: browser.Tabs.Tab): void {
  if (tab.id !== undefined) void openPanelWithErrorTab(tab.id);
}

function handleCommand(command: string, tab: browser.Tabs.Tab | undefined): void {
  if (command !== 'open-sidebar-and-summarize') return;
  if (tab?.id !== undefined) void openPanelWithErrorTab(tab.id);
  else void browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
    if (tabs[0]?.id !== undefined) void openPanelWithErrorTab(tabs[0].id);
  });
}

function handleTabUpdated(tabId: number, change: browser.Tabs.OnUpdatedChangeInfoType): void {
  const session = sessions.get(tabId);
  if (!session) {
    const lifecycle = tabLifecycles.get(tabId);
    if (change.status === 'loading' || (change.url && (!lifecycle?.url || canonical(change.url) !== lifecycle.url))) {
      tabLifecycles.delete(tabId); opening.delete(tabId);
    }
    if (change.status === 'loading') void queueSnapshot(tabId, () => browser.storage.session.remove(SNAPSHOT_PREFIX + tabId));
    else if (change.url) void queueSnapshot(tabId, async() => {
      const data = await browser.storage.session.get(SNAPSHOT_PREFIX + tabId);
      const snapshot = data[SNAPSHOT_PREFIX + tabId] as Snapshot | undefined;
      if (snapshot && canonical(change.url!) !== snapshot.url) {
        await browser.storage.session.remove(SNAPSHOT_PREFIX + tabId);
      }
    });
    return;
  }
  if (change.status === 'loading' || (change.url && canonical(change.url) !== session.url)) {
    tabLifecycles.delete(tabId);
    opening.delete(tabId);
    sessions.delete(tabId);
    for (const port of session.ports) { try { port.disconnect(); } catch { /* already disconnected */ } }
    void browser.tabs.sendMessage(tabId, {type: 'PANEL_DISMISS'}, {frameId: 0}).catch(() => undefined);
    void queueSnapshot(tabId, () => browser.storage.session.remove(SNAPSHOT_PREFIX + tabId));
  }
}

function handleTabRemoved(tabId: number): void {
  tabLifecycles.delete(tabId);
  opening.delete(tabId);
  sessions.delete(tabId);
  void queueSnapshot(tabId, () => browser.storage.session.remove(SNAPSHOT_PREFIX + tabId));
}

export function setupPanelController(): void {
  browser.action.onClicked.addListener(handleAction);
  browser.commands.onCommand.addListener(handleCommand);
  browser.runtime.onConnect.addListener(handlePanelConnection);
  browser.tabs.onUpdated.addListener(handleTabUpdated);
  browser.tabs.onRemoved.addListener(handleTabRemoved);
}
