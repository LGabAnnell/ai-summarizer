import {TestBed} from '@angular/core/testing';
import {of} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AppComponent} from './app.component';
import {ClassificationService, HistoryService, SettingsService, SummaryService, ThemeService} from '@shared/public-api';

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
    },
  };
});

vi.mock('webextension-polyfill', () => ({default: browserMock.api}));

describe('Sidebar shortcut action', () => {
  let summary: {state: ReturnType<typeof import('@angular/core')['signal']>; extractAndSummarize: ReturnType<typeof vi.fn>};
  let fixture: ReturnType<typeof TestBed.createComponent<AppComponent>>;

  beforeEach(async () => {
    summary = {
      state: (await import('@angular/core')).signal({state: 'idle' as const}),
      extractAndSummarize: vi.fn(() => of({})),
    };
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        {provide: SummaryService, useValue: summary},
        {provide: SettingsService, useValue: {getMLSettings: () => ({mlEnabled: false})}},
        {provide: ClassificationService, useValue: {checkMLAvailability: () => of({available: false, apiAvailable: false, permissionGranted: false})}},
        {provide: HistoryService, useValue: {getSelectedItem: () => null, getItems: () => [], addSummary: vi.fn()}},
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
});
