import {Component, inject, OnDestroy, signal} from '@angular/core';
import {DecimalPipe} from '@angular/common';
import browser from 'webextension-polyfill';
import {ErrorStateComponent, LoadingStateComponent, MarkdownPipe, SummaryHeaderComponent, SummaryMetaComponent, ThemeService} from '@shared/public-api';
import type {PanelClientMessage, PanelServerMessage, PanelState} from '@shared/lib/models/panel.model';

@Component({
  selector: 'panel-root',
  imports: [DecimalPipe, ErrorStateComponent, LoadingStateComponent, MarkdownPipe, SummaryHeaderComponent, SummaryMetaComponent],
  host: {'(document:keydown.escape)': 'close()', '(click)': 'openSummaryLink($event)', '(auxclick)': 'openSummaryLink($event)'},
  templateUrl: './app.component.html',
  styles: [`
    :host { display:block; height:100%; }
    main { box-sizing:border-box; min-height:100%; padding:16px; display:flex; flex-direction:column; }
    .body { flex:1; min-width:0; overflow-wrap:anywhere; }
    footer { display:flex; justify-content:flex-end; margin-top:16px; }
    button { padding:8px 12px; cursor:pointer; }
    button:focus-visible { outline:3px solid #386de0; }
    [role=alert] { color:var(--error-color, #b42318); }
    h1 { font-size:1.2rem; }
    .summary-classification, .agent-labels-section { margin-top:12px; }
    .classification-badge, .agent-label-badge { display:inline-block; border-radius:12px; background:var(--bg-secondary, #eceef3); padding:4px 9px; font-size:12px; }
    .agent-labels-header { font-weight:600; margin-bottom:6px; }
    .agent-labels { display:flex; flex-wrap:wrap; gap:6px; }
    .classification-error { color:var(--error-color, #b42318); font-size:12px; }
  `]
})
export class AppComponent implements OnDestroy {
  readonly state = signal<PanelState | null>(null);
  readonly authorized = signal(false);
  readonly rejected = signal('');
  readonly copied = signal(false);
  readonly copyError = signal('');
  readonly settingsError = signal('');
  readonly linkError = signal('');
  readonly errorPageFeedback = signal('');
  readonly errorVerified = signal(false);
  readonly errorPage: string;
  readonly errorPagePermission = signal(false);
  readonly errorPageRetryable = signal(false);
  private readonly sessionId: string;
  private readonly errorToken: string;
  private port?: browser.Runtime.Port;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private destroyed = false;

  constructor() {
    const query = new URLSearchParams(location.search);
    this.errorPage = query.get('error') || '';
    this.errorToken = query.get('token') || '';
    this.sessionId = query.get('session') || '';
    if (this.errorPage) {
      if (window.top !== window || !this.errorToken) {
        this.errorPageFeedback.set('This error page is not authorized.');
        return;
      }
      void browser.runtime.sendMessage({type: 'PANEL_ERROR_VERIFY', token: this.errorToken}).then(response => {
        const result = response as {success: boolean; error?: string; retryable?: boolean; permissionRequired?: boolean};
        if (result.success) {
          this.errorPageRetryable.set(result.retryable === true);
          this.errorPagePermission.set(result.permissionRequired === true);
          this.errorVerified.set(true);
        }
        else this.errorPageFeedback.set(result.error || 'This retry has expired. Use the extension button again.');
      }).catch(() => this.errorPageFeedback.set('This retry has expired. Use the extension button again.'));
      return;
    }
    if (!this.sessionId) { this.rejected.set('This panel must be opened using the extension button.'); return; }
    inject(ThemeService);
    this.connect();
  }

  formatAgentLabel(label: string): string {
    const formatted = label.replace(/_/g, ' ');
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }

  openSummaryLink(event: MouseEvent): void {
    if ((event.type === 'click' && event.button !== 0) || (event.type === 'auxclick' && event.button !== 1)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const container = target.closest('.markdown-content');
    if (!(container instanceof HTMLElement)) return;
    const link = target.closest('a[href]');
    if (!(link instanceof HTMLAnchorElement) || !container.contains(link)) return;
    event.preventDefault();
    const href = link.getAttribute('href') || '';
    this.linkError.set('');
    if (href.startsWith('#')) {
      let fragment: string;
      try { fragment = decodeURIComponent(href.slice(1)); } catch { return; }
      const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
      const heading = Array.from(headings).find(element =>
        (element.textContent || '').toLowerCase().trim().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s+/g, '-') === fragment.toLowerCase());
      heading?.scrollIntoView();
      return;
    }
    try {
      const url = new URL(href, this.state()?.summary?.articleUrl || this.state()?.documentUrl);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
      void browser.tabs.create({url: url.href}).catch(() => this.linkError.set('Could not open the link. Please try again.'));
    } catch {
      this.linkError.set('Could not open the link. Please try again.');
    }
  }

  private connect(): void {
    if (this.destroyed) return;
    const port = browser.runtime.connect({name: 'summarizer-panel'});
    this.port = port;
    port.onMessage.addListener((message: unknown) => {
      if (!message || typeof message !== 'object') return;
      const data = message as PanelServerMessage;
      if (data.type === 'PANEL_REJECTED') {
        this.rejected.set(data.error); this.authorized.set(false); this.destroyed = true;
      } else if (data.type === 'PANEL_STATE') {
        this.authorized.set(true); this.rejected.set(''); this.state.set(data.state);
      } else if (data.type === 'PANEL_SETTINGS_ERROR') {
        this.settingsError.set(data.error);
      }
    });
    port.onDisconnect.addListener(() => {
      this.authorized.set(false);
      if (!this.destroyed) this.reconnectTimer = setTimeout(() => this.connect(), 500);
    });
    const ready: PanelClientMessage = {type: 'PANEL_READY', sessionId: this.sessionId};
    port.postMessage(ready);
  }

  retry(): void {
    if (!this.authorized()) return;
    if (this.state()?.permissionRequired) {
      void browser.permissions.request({origins: ['<all_urls>']}).then(granted => {
        if (granted) this.sendRetry(); else this.copyError.set('Website access was not granted.');
      }).catch(error => this.copyError.set(String(error)));
    } else this.sendRetry();
  }
  private sendRetry(): void { this.port?.postMessage({type: 'PANEL_RETRY', sessionId: this.sessionId} satisfies PanelClientMessage); }
  close(): void {
    if (this.authorized()) this.port?.postMessage({type: 'PANEL_CLOSE', sessionId: this.sessionId} satisfies PanelClientMessage);
  }
  async copy(): Promise<void> {
    const summary = this.state()?.summary?.summary;
    if (!summary || !this.authorized()) return;
    this.copyError.set('');
    try {
      await navigator.clipboard.writeText(summary);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch (error) { this.copyError.set(`Could not copy summary: ${error instanceof Error ? error.message : String(error)}`); }
  }
  openSettings(): void {
    if (!this.authorized()) return;
    this.settingsError.set('');
    try { this.port?.postMessage({type: 'PANEL_OPEN_SETTINGS', sessionId: this.sessionId} satisfies PanelClientMessage); }
    catch { this.settingsError.set('Could not open settings. Please try again.'); }
  }
  grantAndReopen(): void {
    if (!this.errorToken || !this.errorVerified() || !this.errorPageRetryable() || !this.errorPagePermission()) return;
    // Call permissions.request directly in the click handler to preserve the user gesture.
    void browser.permissions.request({origins: ['<all_urls>']}).then(async granted => {
      if (!granted) { this.errorPageFeedback.set('Website access was not granted.'); return; }
      await this.reopen();
    }).catch(error => this.errorPageFeedback.set(error instanceof Error ? error.message : String(error)));
  }
  async reopen(): Promise<void> {
    if (!this.errorToken || !this.errorVerified() || !this.errorPageRetryable()) return;
    try {
      const response = await browser.runtime.sendMessage({type: 'PANEL_REOPEN', token: this.errorToken}) as {success: boolean; error?: string; retryable?: boolean; permissionRequired?: boolean};
      if (!response.success) {
        this.errorPageFeedback.set(response.error || 'Could not reopen the panel.');
        if (response.retryable !== undefined) this.errorPageRetryable.set(response.retryable);
        if (response.permissionRequired !== undefined) this.errorPagePermission.set(response.permissionRequired);
        return;
      }
      window.close();
    } catch (error) { this.errorPageFeedback.set(error instanceof Error ? error.message : String(error)); }
  }
  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.port?.disconnect();
  }
}
