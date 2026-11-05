import {TestBed} from '@angular/core/testing';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ThemeService} from '@shared/public-api';
import {AppComponent} from './app.component';

const mock = vi.hoisted(() => ({connect: vi.fn(), request: vi.fn(), openOptions: vi.fn(), sendMessage: vi.fn()}));
vi.mock('webextension-polyfill', () => ({default: {
  runtime: {connect: mock.connect, openOptionsPage: mock.openOptions, sendMessage: mock.sendMessage},
  permissions: {request: mock.request},
}}));

interface MessageEvent {addListener: (fn: (message: unknown) => void) => void}
function makePort() {
  let listener: (message: unknown) => void = () => undefined;
  return {onMessage: {addListener: (fn: (message: unknown) => void) => { listener = fn; }} as MessageEvent,
    onDisconnect: {addListener: vi.fn()}, postMessage: vi.fn(), disconnect: vi.fn(),
    receive: (message: unknown) => listener(message)};
}

describe('floating summary view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    history.replaceState({}, '', '?session=test-session');
    TestBed.configureTestingModule({imports: [AppComponent], providers: [{provide: ThemeService, useValue: {}}]});
  });
  afterEach(() => { TestBed.resetTestingModule(); history.replaceState({}, '', location.pathname); });

  it('waits for an authorized state and renders sanitized summary content', async () => {
    const port = makePort(); mock.connect.mockReturnValue(port);
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(port.postMessage).toHaveBeenCalledWith({type: 'PANEL_READY', sessionId: 'test-session'});
    expect(fixture.componentInstance.authorized()).toBe(false);
    port.receive({type: 'PANEL_STATE', state: {state: 'success', jobId: 'job', tabId: 1, documentUrl: 'https://example.test',
      summary: {summary: '**Summary** <img src=x onerror=alert(1)>', title: 'Article', cached: false}}});
    fixture.detectChanges();
    expect(fixture.componentInstance.authorized()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Article');
    expect(fixture.nativeElement.querySelector('strong')?.textContent).toBe('Summary');
    expect(fixture.nativeElement.querySelector('[onerror]')).toBeNull();
    fixture.destroy();
  });

  it('shows denied permission feedback on the error state', async () => {
    const port = makePort(); mock.connect.mockReturnValue(port); mock.request.mockResolvedValue(false);
    const fixture = TestBed.createComponent(AppComponent);
    port.receive({type: 'PANEL_STATE', state: {state: 'error', jobId: 'job', tabId: 1, documentUrl: 'https://example.test',
      permissionRequired: true, error: 'Website access is needed.'}});
    fixture.componentInstance.retry();
    await Promise.resolve();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Website access was not granted.');
    expect(port.postMessage).not.toHaveBeenCalledWith({type: 'PANEL_RETRY', sessionId: 'test-session'});
    fixture.destroy();
  });

  it('renders local classification, agent labels, and classification errors', () => {
    const port = makePort(); mock.connect.mockReturnValue(port);
    const fixture = TestBed.createComponent(AppComponent);
    port.receive({type: 'PANEL_STATE', state: {state: 'success', jobId: 'job', tabId: 1, documentUrl: 'https://example.test',
      summary: {summary: 'Summary', cached: false, classification: {ok: true, label: 'Technology', score: 0.876},
        agentLabels: ['open_data', 'gaming'], agentClassificationError: 'Agent timed out'}}});
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.summary-classification').textContent).toContain('Technology');
    expect(fixture.nativeElement.querySelector('.summary-classification').textContent).toContain('88%');
    expect([...fixture.nativeElement.querySelectorAll('.agent-label-badge')].map((element: Element) => element.textContent?.trim())).toEqual(['Open data', 'Gaming']);
    expect(fixture.nativeElement.querySelector('[role="status"].classification-error').textContent).toContain('Agent timed out');
    port.receive({type: 'PANEL_STATE', state: {state: 'success', jobId: 'job', tabId: 1, documentUrl: 'https://example.test',
      summary: {summary: 'Summary', cached: false, classification: {ok: false, error: 'Model unavailable'}}}});
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.classification-error').textContent).toContain('Model unavailable');
    fixture.destroy();
  });

  it('hides retry for a verified restricted page and when a reopen becomes restricted', async () => {
    history.replaceState({}, '', '?error=Unable%20to%20open&token=token');
    mock.sendMessage.mockResolvedValueOnce({success: true, retryable: true, permissionRequired: false})
      .mockResolvedValueOnce({success: false, error: 'Restricted page', retryable: false, permissionRequired: false});
    const fixture = TestBed.createComponent(AppComponent);
    await Promise.resolve(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Try again');
    await fixture.componentInstance.reopen(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Restricted page');
    expect(fixture.nativeElement.textContent).not.toContain('Try again');
    fixture.destroy();

    mock.sendMessage.mockResolvedValueOnce({success: true, retryable: false, permissionRequired: false});
    const restricted = TestBed.createComponent(AppComponent);
    await Promise.resolve(); restricted.detectChanges();
    expect(restricted.nativeElement.textContent).not.toContain('Try again');
    restricted.destroy();
  });

  it('keeps the error page open after failure and closes it after a successful permission retry', async () => {
    history.replaceState({}, '', '?error=Unable%20to%20open&token=token');
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    mock.sendMessage.mockResolvedValueOnce({success: true, retryable: true, permissionRequired: true})
      .mockResolvedValueOnce({success: false, error: 'Still unavailable', retryable: true, permissionRequired: true})
      .mockResolvedValueOnce({success: true});
    mock.request.mockResolvedValue(true);
    const fixture = TestBed.createComponent(AppComponent);
    await Promise.resolve(); fixture.detectChanges();
    const retry = [...fixture.nativeElement.querySelectorAll('button')].find((element: Element) => element.textContent?.includes('Grant website access')) as HTMLButtonElement;
    retry.click();
    await vi.waitFor(() => expect(fixture.componentInstance.errorPageFeedback()).toBe('Still unavailable'));
    expect(close).not.toHaveBeenCalled();
    expect(mock.request).toHaveBeenCalledWith({origins: ['<all_urls>']});
    retry.click();
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(mock.sendMessage).toHaveBeenCalledWith({type: 'PANEL_REOPEN', token: 'token'});
    fixture.destroy();
    close.mockRestore();
  });

  it('requests settings through the authorized panel connection and displays failures', () => {
    const port = makePort(); mock.connect.mockReturnValue(port);
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Settings');
    port.receive({type: 'PANEL_STATE', state: {state: 'loading', jobId: 'job', tabId: 1, documentUrl: 'https://example.test'}});
    fixture.detectChanges();
    const button = [...fixture.nativeElement.querySelectorAll('button')].find((element: Element) => element.textContent?.trim() === 'Settings') as HTMLButtonElement;
    button.click();
    expect(port.postMessage).toHaveBeenCalledWith({type: 'PANEL_OPEN_SETTINGS', sessionId: 'test-session'});
    port.receive({type: 'PANEL_SETTINGS_ERROR', error: 'Could not open settings: Browser error'});
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Could not open settings: Browser error');
    fixture.destroy();
  });
});
