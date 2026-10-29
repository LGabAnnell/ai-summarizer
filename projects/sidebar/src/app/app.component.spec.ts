import {signal, WritableSignal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {of} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AppComponent} from './app.component';
import {ClassificationService, HistoryService, SettingsService, SummaryService, SummaryState, ThemeService} from '@shared/public-api';

const browserMock = vi.hoisted(() => {
  let onMessage: ((message: unknown) => void) | undefined;
  const port = {
    onMessage: {addListener: vi.fn((listener: (message: unknown) => void) => { onMessage = listener; })},
    disconnect: vi.fn(),
    postMessage: vi.fn(),
    deliver: (message: unknown) => onMessage?.(message),
  };
  return {
    port,
    api: {
      runtime: {connect: vi.fn(() => port), onMessage: {removeListener: vi.fn()}},
      windows: {getCurrent: vi.fn(() => Promise.resolve({id: 1}))},
      permissions: {request: vi.fn(() => Promise.resolve(true))},
    },
  };
});

vi.mock('webextension-polyfill', () => ({default: browserMock.api}));

describe('Sidebar shortcut action', () => {
  let summary: {state: WritableSignal<SummaryState>; extractAndSummarize: ReturnType<typeof vi.fn>; setPermissionRequestError: (error: string) => void};
  let fixture: ReturnType<typeof TestBed.createComponent<AppComponent>>;

  beforeEach(async () => {
    summary = {
      state: signal<SummaryState>({state: 'idle'}),
      extractAndSummarize: vi.fn(() => of({})),
      setPermissionRequestError(error: string) { this.state.update(state => state.state === 'error' && state.permissionRequired ? {...state, error} : state); },
    };
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        {provide: SummaryService, useValue: summary},
        {provide: SettingsService, useValue: {getMLSettings: () => ({mlEnabled: false})}},
        {provide: ClassificationService, useValue: {checkMLAvailability: () => of({available: false, apiAvailable: false, permissionGranted: false})}},
        {provide: HistoryService, useValue: {getSelectedItem: () => null, getItems: () => [], getCount: () => 0, addSummary: vi.fn()}},
        {provide: ThemeService, useValue: {isDarkTheme: () => false, getTheme: () => 'light', setTheme: vi.fn()}},
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AppComponent);
    fixture.componentInstance.ngOnInit();
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('starts summarization for the captured tab and switches from history to current', () => {
    fixture.componentInstance.setView('history');
    browserMock.port.deliver({type: 'SUMMARIZE_ACTIVE_TAB', tabId: 19});
    expect(fixture.componentInstance.currentView()).toBe('current');
    expect(summary.extractAndSummarize).toHaveBeenCalledWith(19);
  });

  it('shows the in-flight summary view and ignores duplicate actions while loading', () => {
    fixture.componentInstance.setView('history');
    summary.state.set({state: 'loading'});
    browserMock.port.deliver({type: 'SUMMARIZE_ACTIVE_TAB', tabId: 20});
    expect(fixture.componentInstance.currentView()).toBe('current');
    expect(summary.extractAndSummarize).not.toHaveBeenCalled();
  });

  it('does not start summarization just because the sidebar opens', () => {
    expect(summary.extractAndSummarize).not.toHaveBeenCalled();
  });

  it('requests website access in the retry click and retries the same captured tab', async () => {
    const initial = {
      state: 'error',
      error: 'Firefox has not granted website access.',
      permissionRequired: true,
      tabId: 19,
    } as const;
    summary.state.set(initial);
    fixture.componentInstance.summaryState.set(initial);
    fixture.detectChanges();

    fixture.componentInstance.retry();
    expect(browserMock.api.permissions.request).toHaveBeenCalledWith({origins: ['<all_urls>']});
    await Promise.resolve();
    fixture.detectChanges();
    expect(summary.extractAndSummarize).toHaveBeenCalledWith(19);
  });

  it('does not retry the summary when website access is denied', async () => {
    browserMock.api.permissions.request.mockResolvedValueOnce(false);
    const initial = {state: 'error' as const, permissionRequired: true, tabId: 21};
    summary.state.set(initial);
    fixture.componentInstance.summaryState.set(initial);
    fixture.detectChanges();

    fixture.componentInstance.retry();
    await Promise.resolve();
    fixture.detectChanges();
    expect(summary.extractAndSummarize).not.toHaveBeenCalled();
    expect(fixture.componentInstance.summaryState()).toMatchObject({state: 'error', permissionRequired: true, tabId: 21, error: expect.stringContaining('Website access was not granted')});
  });

  it('keeps permission request rejection errors in the service state', async () => {
    browserMock.api.permissions.request.mockRejectedValueOnce(new Error('Permission API failed'));
    const initial = {state: 'error' as const, error: 'old', permissionRequired: true, tabId: 22};
    summary.state.set(initial);
    fixture.componentInstance.summaryState.set(initial);
    fixture.detectChanges();
    fixture.componentInstance.retry();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    expect(fixture.componentInstance.summaryState()).toMatchObject({error: 'Permission API failed', permissionRequired: true, tabId: 22});
    await new Promise(resolve => setTimeout(resolve, 0));
    browserMock.api.permissions.request.mockRejectedValueOnce('unknown failure');
    fixture.componentInstance.retry();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    expect(fixture.componentInstance.summaryState()).toMatchObject({error: 'Could not request website access.', permissionRequired: true, tabId: 22});
  });
});
