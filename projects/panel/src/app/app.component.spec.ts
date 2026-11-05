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
