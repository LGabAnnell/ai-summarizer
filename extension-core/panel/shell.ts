import browser from 'webextension-polyfill';

const HOST_ATTRIBUTE = 'data-ai-summarizer-panel';
interface PanelMessage {type?: string; sessionId?: string}

/** The page owns the shell; the extension page owns all summary content. */
export function installPanelShell(): (message: PanelMessage) => boolean {
  let host: HTMLDivElement | undefined;
  let frame: HTMLIFrameElement | undefined;
  let panel: HTMLDivElement;
  let heading: HTMLButtonElement;
  let closeButton: HTMLButtonElement;
  let resizeButton: HTMLButtonElement;
  let status: HTMLDivElement;
  let sessionId = '';
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  let previousFocus: HTMLElement | null = null;
  let position = {left: 0, top: 16, width: 420, height: 560};
  let initialized = false;
  let currentUrl = location.href.split('#')[0];
  let theme = 'light';
  let themeRevision = 0;
  const initialRevision = themeRevision;
  void browser.storage.local.get('ai-summarizer-theme').then(data => {
    if (themeRevision !== initialRevision) return;
    theme = data['ai-summarizer-theme'] === 'dark' ? 'dark' : 'light';
    host?.setAttribute('data-theme', theme);
  }).catch(() => undefined);
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes['ai-summarizer-theme']) {
      themeRevision += 1;
      theme = changes['ai-summarizer-theme'].newValue === 'dark' ? 'dark' : 'light';
      host?.setAttribute('data-theme', theme);
    }
  });

  function clamp(): void {
    const maxWidth = Math.max(1, innerWidth - 16);
    const maxHeight = Math.max(1, innerHeight - 16);
    position.width = Math.min(maxWidth, Math.max(Math.min(260, maxWidth), position.width));
    position.height = Math.min(maxHeight, Math.max(Math.min(180, maxHeight), position.height));
    position.left = Math.max(0, Math.min(position.left, innerWidth - position.width));
    position.top = Math.max(0, Math.min(position.top, innerHeight - position.height));
    Object.assign(panel.style, {left: `${position.left}px`, top: `${position.top}px`, width: `${position.width}px`, height: `${position.height}px`});
  }
  function hide(restoreFocus = true): void {
    if (readyTimer) clearTimeout(readyTimer);
    readyTimer = undefined;
    frame?.remove();
    frame = undefined;
    if (host) host.style.display = 'none';
    if (restoreFocus && previousFocus?.isConnected) previousFocus.focus();
    previousFocus = null;
  }
  function remove(): void {
    hide(false);
    host?.remove();
    host = undefined;
    initialized = false;
  }
  function startFrame(): void {
    frame?.remove();
    status.hidden = true;
    frame = document.createElement('iframe');
    frame.title = 'Article summary';
    frame.src = `${browser.runtime.getURL('panel/index.html')}?session=${encodeURIComponent(sessionId)}`;
    panel.insertBefore(frame, status);
    if (readyTimer) clearTimeout(readyTimer);
    readyTimer = setTimeout(() => {
      frame?.remove(); frame = undefined;
      status.hidden = false;
      status.querySelector('button')?.focus();
    }, 5000);
  }
  function beginDrag(event: PointerEvent, mode: 'move' | 'resize'): void {
    if (event.button !== 0) return;
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    const startX = event.clientX, startY = event.clientY, original = {...position};
    target.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => {
      if (mode === 'move') { position.left = original.left + next.clientX - startX; position.top = original.top + next.clientY - startY; }
      else { position.width = original.width + next.clientX - startX; position.height = original.height + next.clientY - startY; }
      clamp();
    };
    const end = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end);
  }
  function keyboard(event: KeyboardEvent, mode: 'move' | 'resize'): void {
    const delta = event.shiftKey ? 30 : 10;
    const x = event.key === 'ArrowRight' ? delta : event.key === 'ArrowLeft' ? -delta : 0;
    const y = event.key === 'ArrowDown' ? delta : event.key === 'ArrowUp' ? -delta : 0;
    if (!x && !y) return;
    event.preventDefault();
    if (mode === 'move') { position.left += x; position.top += y; }
    else { position.width += x; position.height += y; }
    clamp();
  }
  function create(): void {
    host = document.createElement('div');
    host.setAttribute(HOST_ATTRIBUTE, '');
    host.setAttribute('data-theme', theme);
    // Keep the page's styles from positioning, hiding, or stacking the host.
    host.style.cssText = 'all: initial !important; display: block !important; position: fixed !important; inset: 0 !important; width: 0 !important; height: 0 !important; z-index: 2147483647 !important;';
    const root = host.attachShadow({mode: 'closed'});
    const style = document.createElement('style');
    style.textContent = `
      .panel { position:fixed; display:flex; flex-direction:column; overflow:hidden; box-sizing:border-box; background:#fff; color:#191919; border:1px solid #777; border-radius:10px; box-shadow:0 8px 30px #0006; font:14px system-ui,sans-serif; }
      .bar { display:flex; align-items:center; flex:none; background:#eceef3; border-bottom:1px solid #ccc; }
      button { font:inherit; color:inherit; cursor:pointer; } button:focus-visible { outline:3px solid #386de0; outline-offset:-3px; }
      .drag { flex:1; padding:10px 12px; border:0; background:transparent; text-align:left; cursor:move; font-weight:600; touch-action:none; }
      .close { padding:6px 12px; border:0; background:transparent; font-size:22px; }
      iframe { flex:1; min-height:0; width:100%; border:0; background:#fff; }
      .resize { flex:none; align-self:flex-end; width:30px; height:24px; padding:0; border:0; background:transparent; cursor:nwse-resize; touch-action:none; }
      .status { flex:1; padding:20px; } .status[hidden] { display:none; }
      :host([data-theme='dark']) .panel { background:#1f2025; color:#f4f4f4; } :host([data-theme='dark']) .bar { background:#2c2e36; border-color:#555; }
    `;
    panel = document.createElement('div'); panel.className = 'panel'; panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', 'Article summary panel');
    const bar = document.createElement('div'); bar.className = 'bar';
    heading = document.createElement('button'); heading.className = 'drag'; heading.type = 'button'; heading.textContent = 'Article summary'; heading.setAttribute('aria-label', 'Move summary panel with arrow keys');
    closeButton = document.createElement('button'); closeButton.className = 'close'; closeButton.type = 'button'; closeButton.setAttribute('aria-label', 'Close summary panel'); closeButton.textContent = '×';
    resizeButton = document.createElement('button'); resizeButton.className = 'resize'; resizeButton.type = 'button'; resizeButton.setAttribute('aria-label', 'Resize summary panel with arrow keys'); resizeButton.textContent = '◢';
    status = document.createElement('div'); status.className = 'status'; status.hidden = true;
    const message = document.createElement('p'); message.textContent = 'The summary panel could not load on this page.';
    const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Retry'; retry.addEventListener('click', startFrame);
    const errorPage = document.createElement('button'); errorPage.type = 'button'; errorPage.textContent = 'Open help'; errorPage.addEventListener('click', () => { void browser.runtime.sendMessage({type: 'PANEL_ERROR_TAB', sessionId}); });
    status.append(message, retry, document.createTextNode(' '), errorPage);
    bar.append(heading, closeButton); panel.append(bar, status, resizeButton); root.append(style, panel); document.documentElement.append(host);
    closeButton.addEventListener('click', () => hide());
    panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); hide(); } });
    heading.addEventListener('pointerdown', event => beginDrag(event, 'move'));
    resizeButton.addEventListener('pointerdown', event => beginDrag(event, 'resize'));
    heading.addEventListener('keydown', event => keyboard(event, 'move'));
    resizeButton.addEventListener('keydown', event => keyboard(event, 'resize'));
    initialized = true;
    position = {left: Math.max(0, innerWidth - 420 - 16), top: 16, width: 420, height: 560};
    clamp();
  }
  window.addEventListener('resize', () => { if (host && initialized) clamp(); });
  window.addEventListener('pagehide', () => remove());
  return (message: PanelMessage): boolean => {
    if (message.type === 'PANEL_SHOW' && message.sessionId) {
      const url = location.href.split('#')[0];
      if (url !== currentUrl) { remove(); currentUrl = url; }
      if (!host?.isConnected) create();
      if (host!.style.display === 'none') host!.style.setProperty('display', 'block', 'important');
      if (frame && sessionId === message.sessionId) { closeButton.focus(); return true; }
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      sessionId = message.sessionId;
      startFrame();
      closeButton.focus();
      return true;
    }
    if (message.type === 'PANEL_FRAME_READY' && message.sessionId === sessionId) {
      if (readyTimer) clearTimeout(readyTimer);
      readyTimer = undefined;
      return true;
    }
    if (message.type === 'PANEL_HIDE' && message.sessionId === sessionId) { hide(); return true; }
    if (message.type === 'PANEL_DISMISS') { remove(); return true; }
    return false;
  };
}
