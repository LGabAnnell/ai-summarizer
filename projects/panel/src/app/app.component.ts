import {Component, inject, OnDestroy, signal} from '@angular/core';
import browser from 'webextension-polyfill';
import {ErrorStateComponent, LoadingStateComponent, MarkdownPipe, SummaryHeaderComponent, SummaryMetaComponent, ThemeService} from '@shared/public-api';
import type {PanelClientMessage, PanelServerMessage, PanelState} from '@shared/lib/models/panel.model';

@Component({
  selector: 'panel-root',
  imports: [ErrorStateComponent, LoadingStateComponent, MarkdownPipe, SummaryHeaderComponent, SummaryMetaComponent],
  host: {'(document:keydown.escape)': 'close()'},
  template: `
    <main>
      @if (errorPage) {
        <h1>Unable to open the summary panel</h1>
        <p role="alert">{{ errorPage }}</p>
        @if (errorPageFeedback()) { <p role="alert">{{ errorPageFeedback() }}</p> }
        @if (errorVerified() && errorPagePermission) {
          <button type="button" (click)="grantAndReopen()">Grant website access and retry</button>
        } @else if (errorVerified()) {
          <button type="button" (click)="reopen()">Try again</button>
        }
      } @else if (rejected()) {
        <p role="alert">{{ rejected() }}</p>
      } @else {
        <div class="body" aria-live="polite">
          @if (!state() || state()?.state === 'loading') {
            <shared-loading-state message="Extracting and summarizing the article…"></shared-loading-state>
          }
          @if (state()?.state === 'error') {
            @if (copyError()) { <p role="alert">{{ copyError() }}</p> }
            <shared-error-state [error]="state()?.error || 'Failed to summarize article'" [retryText]="state()?.permissionRequired ? 'Grant website access and retry' : 'Retry'" (retry)="retry()"></shared-error-state>
          }
          @if (state()?.state === 'success' && state()?.summary; as summary) {
            <shared-summary-header [title]="summary.title || 'Article summary'" [copied]="copied()" (copyClick)="copy()"></shared-summary-header>
            <div class="markdown-content" [innerHTML]="summary.summary | markdown"></div>
            <shared-summary-meta [characterCount]="summary.summary.length" [cached]="summary.cached" [provider]="summary.provider || ''" [model]="summary.model || ''"></shared-summary-meta>
            @if (state()?.historyError) { <p role="alert">{{ state()?.historyError }}</p> }
            @if (copyError()) { <p role="alert">{{ copyError() }}</p> }
          }
        </div>
        @if (authorized()) {
          @if (settingsError()) { <p role="alert">{{ settingsError() }}</p> }
          <footer><button type="button" (click)="openSettings()">Settings</button></footer>
        }
      }
    </main>
  `,
  styles: [`
    :host { display:block; height:100%; }
    main { box-sizing:border-box; min-height:100%; padding:16px; display:flex; flex-direction:column; }
    .body { flex:1; min-width:0; overflow-wrap:anywhere; }
    footer { display:flex; justify-content:flex-end; margin-top:16px; }
    button { padding:8px 12px; cursor:pointer; }
    button:focus-visible { outline:3px solid #386de0; }
    [role=alert] { color:var(--error-color, #b42318); }
    h1 { font-size:1.2rem; }
  `]
})
export class AppComponent implements OnDestroy {
  readonly state = signal<PanelState | null>(null);
  readonly authorized = signal(false);
  readonly rejected = signal('');
  readonly copied = signal(false);
  readonly copyError = signal('');
  readonly settingsError = signal('');
  readonly errorPageFeedback = signal('');
  readonly errorVerified = signal(false);
  readonly errorPage: string;
  readonly errorPagePermission: boolean;
  private readonly sessionId: string;
  private readonly errorToken: string;
  private port?: browser.Runtime.Port;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private destroyed = false;

  constructor() {
    const query = new URLSearchParams(location.search);
    this.errorPage = query.get('error') || '';
    this.errorPagePermission = query.get('permission') === '1';
    this.errorToken = query.get('token') || '';
    this.sessionId = query.get('session') || '';
    if (this.errorPage) {
      if (window.top !== window || !this.errorToken) {
        this.errorPageFeedback.set('This error page is not authorized.');
        return;
      }
      void browser.runtime.sendMessage({type: 'PANEL_ERROR_VERIFY', token: this.errorToken}).then(response => {
        const result = response as {success: boolean; error?: string};
        if (result.success) this.errorVerified.set(true);
        else this.errorPageFeedback.set(result.error || 'This retry has expired. Use the extension button again.');
      }).catch(() => this.errorPageFeedback.set('This retry has expired. Use the extension button again.'));
      return;
    }
    if (!this.sessionId) { this.rejected.set('This panel must be opened using the extension button.'); return; }
    inject(ThemeService);
    this.connect();
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
    if (!this.errorToken || !this.errorVerified()) return;
    // Call permissions.request directly in the click handler to preserve the user gesture.
    void browser.permissions.request({origins: ['<all_urls>']}).then(async granted => {
      if (!granted) { this.errorPageFeedback.set('Website access was not granted.'); return; }
      await this.reopen();
    }).catch(error => this.errorPageFeedback.set(error instanceof Error ? error.message : String(error)));
  }
  async reopen(): Promise<void> {
    if (!this.errorToken || !this.errorVerified()) return;
    try {
      const response = await browser.runtime.sendMessage({type: 'PANEL_REOPEN', token: this.errorToken}) as {success: boolean; error?: string};
      if (!response.success) { this.errorPageFeedback.set(response.error || 'Could not reopen the panel.'); return; }
      window.close();
    } catch (error) { this.errorPageFeedback.set(error instanceof Error ? error.message : String(error)); }
  }
  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.port?.disconnect();
  }
}
