import browser from 'webextension-polyfill';
import type {PanelClientMessage, PanelServerMessage, PanelState} from '@shared/lib/models/panel.model';
import type {SummaryResult} from '@shared/lib/models/summary.model';
import {handleMessage} from '../background/message-router';
import {mutateHistory} from '../background/history';

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
const sessions = new Map<number, Session>();
const opening = new Map<number, Promise<void>>();
const errorTokens = new Map<string, number>();
const trustedFrames = new Map<string, {sessionId: string; port: browser.Runtime.Port}>();
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
async function persist(session: Session): Promise<void> {
  if (sessions.get(session.tabId) !== session) return;
  const snapshot: Snapshot = {id: session.id, tabId: session.tabId, url: session.url, documentId: session.documentId, state: session.state};
  try { await browser.storage.session.set({[SNAPSHOT_PREFIX + session.tabId]: snapshot}); }
  catch (error) { console.error('Could not save panel state:', error); }
}
async function errorTab(tabId: number, reason: string, permission = false): Promise<void> {
  const token = crypto.randomUUID();
  errorTokens.set(token, tabId);
  const query = new URLSearchParams({error: reason, token, permission: permission ? '1' : '0'});
  await browser.tabs.create({url: `${panelUrl}?${query}`});
}
async function createOrRestore(tabId: number, url: string, documentId: string): Promise<Session> {
  const previous = sessions.get(tabId);
  if (previous?.url === url && previous.documentId === documentId) return previous;
  const key = SNAPSHOT_PREFIX + tabId;
  const stored = await browser.storage.session.get(key) as Record<string, Snapshot | undefined>;
  const snapshot = stored[key];
  let state = snapshot?.url === url && snapshot.documentId === documentId ? snapshot.state : undefined;
  if (state?.state === 'loading') state = {...state, state: 'error', error: 'The summary was interrupted. Try again.'};
  const session: Session = {id: snapshot?.url === url && snapshot.documentId === documentId ? snapshot.id : crypto.randomUUID(), tabId, url, documentId, state, ports: new Set(), running: false};
  sessions.set(tabId, session);
  await persist(session);
  return session;
}

async function launch(tabId: number): Promise<void> {
  let sourceUrl = '';
  try {
    const tab = await browser.tabs.get(tabId);
    sourceUrl = tab.url ?? '';
    if (!tab.url) throw new Error('Firefox could not access this page. Open a regular website and try again.');
    let identity: {success: boolean; documentId: string; url: string};
    try {
      identity = await browser.tabs.sendMessage(tabId, {type: 'PANEL_IDENTITY'}, {frameId: 0}) as typeof identity;
    } catch {
      await browser.scripting.executeScript({target: {tabId, frameIds: [0]}, files: ['content.js']});
      identity = await browser.tabs.sendMessage(tabId, {type: 'PANEL_IDENTITY'}, {frameId: 0}) as typeof identity;
    }
    if (!identity?.success || !identity.documentId || canonical(identity.url) !== canonical(tab.url)) throw new Error('The page changed. Try again.');
    const session = await createOrRestore(tabId, canonical(identity.url), identity.documentId);
    const result = await browser.tabs.sendMessage(tabId, {type: 'PANEL_SHOW', sessionId: session.id, documentId: identity.documentId}, {frameId: 0}) as {success: boolean; error?: string};
    if (!result?.success) throw new Error(result?.error ?? 'Could not open the panel.');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    let restricted = true;
    try {
      const url = new URL(sourceUrl);
      const protectedHosts = ['addons.mozilla.org', 'support.mozilla.org', 'accounts.firefox.com', 'accounts-static.cdn.mozilla.net',
        'addons.cdn.mozilla.net', 'api.accounts.firefox.com', 'content.cdn.mozilla.net', 'discovery.addons.mozilla.org',
        'install.mozilla.org', 'oauth.accounts.firefox.com', 'profile.accounts.firefox.com', 'sync.services.mozilla.com'];
      restricted = !['https:', 'http:'].includes(url.protocol) || protectedHosts.includes(url.hostname) || url.pathname.toLowerCase().endsWith('.pdf');
    } catch { /* A missing or invalid URL cannot host the panel. */ }
    const needsPermission = !restricted && /missing host permission|host permission|cannot access contents|permission/i.test(detail);
    await errorTab(tabId, restricted
      ? 'Firefox does not allow the panel on this page. Open a regular website and try again.'
      : `Could not open the summary panel: ${detail}`, needsPermission);
  }
}
export function openPanel(tabId: number): Promise<void> {
  const pending = opening.get(tabId);
  if (pending) return pending;
  const operation = launch(tabId).finally(() => opening.delete(tabId));
  opening.set(tabId, operation);
  return operation;
}

async function runJob(session: Session): Promise<void> {
  if (session.running) return;
  session.running = true;
  const jobId = crypto.randomUUID();
  session.state = {jobId, tabId: session.tabId, documentUrl: session.url, documentId: session.documentId, state: 'loading'};
  broadcast(session);
  await persist(session);
  try {
    const response = await handleMessage({type: 'EXTRACT_AND_SUMMARIZE', tabId: session.tabId, documentId: session.documentId, documentUrl: session.url}) as {
      success: boolean; summary?: string; title?: string; articleUrl?: string; cached?: boolean; tokenCount?: number;
      agentLabels?: string[]; agentClassificationError?: string; classification?: SummaryResult['classification'];
      error?: string; permissionRequired?: boolean;
    };
    if (!response.success) {
      session.state = {...session.state, state: 'error', error: response.error ?? 'Failed to summarize article', permissionRequired: response.permissionRequired};
    } else {
      const summary: SummaryResult = {summary: response.summary ?? '', title: response.title, articleUrl: response.articleUrl,
        cached: response.cached === true, timestamp: new Date(), tokenCount: response.tokenCount, agentLabels: response.agentLabels,
        agentClassificationError: response.agentClassificationError, classification: response.classification};
      let historyError: string | undefined;
      try { await mutateHistory({type: 'HISTORY_ADD', summary, id: jobId}); }
      catch (error) { historyError = `Could not save to history: ${error instanceof Error ? error.message : String(error)}`; }
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
    if (!sender.url?.startsWith(`${panelUrl}?error=`) || sender.frameId !== 0 || !message.token) return {success: false};
    const tabId = errorTokens.get(message.token);
    if (tabId === undefined) return {success: false, error: 'This retry has expired. Use the extension button again.'};
    if (message.type === 'PANEL_ERROR_VERIFY') return {success: true};
    errorTokens.delete(message.token);
    await openPanel(tabId);
    return {success: true};
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

export function setupPanelController(): void {
  browser.action.onClicked.addListener(tab => { if (tab.id !== undefined) void openPanel(tab.id); });
  browser.commands.onCommand.addListener((command, tab) => {
    if (command !== 'open-sidebar-and-summarize') return;
    if (tab?.id !== undefined) void openPanel(tab.id);
    else void browser.tabs.query({active: true, currentWindow: true}).then(tabs => { if (tabs[0]?.id !== undefined) void openPanel(tabs[0].id); });
  });
  browser.runtime.onConnect.addListener(port => {
    if (port.name !== 'summarizer-panel') return;
    const sender = port.sender;
    if (!sender?.url?.startsWith(`${panelUrl}?session=`) || sender.id !== browser.runtime.id || sender.tab?.id === undefined || !sender.frameId) {
      port.disconnect(); return;
    }
    let attached: Session | undefined;
    let disconnected = false;
    const key = frameKey(sender);
    port.onMessage.addListener((incoming: unknown) => {
      if (!incoming || typeof incoming !== 'object') return;
      const message = incoming as PanelClientMessage;
      if (message.type === 'PANEL_READY') {
        void (async() => {
          const tabId = sender.tab!.id!;
          let session = sessions.get(tabId);
          if (!session) {
            const stored = await browser.storage.session.get(SNAPSHOT_PREFIX + tabId) as Record<string, Snapshot | undefined>;
            const snapshot = stored[SNAPSHOT_PREFIX + tabId];
            const identity = await browser.tabs.sendMessage(tabId, {type: 'PANEL_IDENTITY'}, {frameId: 0}) as {success: boolean; documentId: string; url: string};
            if (snapshot?.id === message.sessionId && identity.success && snapshot.documentId === identity.documentId && snapshot.url === canonical(identity.url)) {
              session = await createOrRestore(tabId, snapshot.url, snapshot.documentId);
            }
          }
          if (disconnected) return;
          if (session?.id !== message.sessionId || new URL(sender.url!).searchParams.get('session') !== session.id) {
            const rejected: PanelServerMessage = {type: 'PANEL_REJECTED', error: 'This panel session is no longer available.'};
            port.postMessage(rejected); port.disconnect(); return;
          }
          attached = session;
          session.ports.add(port);
          trustedFrames.set(key, {sessionId: session.id, port});
          void browser.tabs.sendMessage(session.tabId, {type: 'PANEL_FRAME_READY', sessionId: session.id}, {frameId: 0}).catch(() => undefined);
          if (session.state) broadcast(session); else void runJob(session);
        })().catch(() => { try { port.disconnect(); } catch { /* disconnected */ } });
      } else if (attached?.id === message.sessionId && sessions.get(attached.tabId) === attached) {
        if (message.type === 'PANEL_RETRY' && !attached.running) void runJob(attached);
        if (message.type === 'PANEL_CLOSE') void browser.tabs.sendMessage(attached.tabId, {type: 'PANEL_HIDE', sessionId: attached.id}, {frameId: 0}).catch(() => undefined);
      }
    });
    port.onDisconnect.addListener(() => { disconnected = true; attached?.ports.delete(port); if (trustedFrames.get(key)?.port === port) trustedFrames.delete(key); });
  });
  browser.tabs.onUpdated.addListener((tabId, change) => {
    const session = sessions.get(tabId);
    if (!session) {
      if (change.status === 'loading') void browser.storage.session.remove(SNAPSHOT_PREFIX + tabId);
      else if (change.url) void browser.storage.session.get(SNAPSHOT_PREFIX + tabId).then(data => {
        const snapshot = data[SNAPSHOT_PREFIX + tabId] as Snapshot | undefined;
        if (snapshot && canonical(change.url!) !== snapshot.url) return browser.storage.session.remove(SNAPSHOT_PREFIX + tabId);
        return undefined;
      });
      return;
    }
    if (change.status === 'loading' || (change.url && canonical(change.url) !== session.url)) {
      sessions.delete(tabId);
      for (const port of session.ports) { try { port.disconnect(); } catch { /* already disconnected */ } }
      void browser.tabs.sendMessage(tabId, {type: 'PANEL_DISMISS'}, {frameId: 0}).catch(() => undefined);
      void browser.storage.session.remove(SNAPSHOT_PREFIX + tabId);
    }
  });
  browser.tabs.onRemoved.addListener(tabId => { sessions.delete(tabId); void browser.storage.session.remove(SNAPSHOT_PREFIX + tabId); });
}
