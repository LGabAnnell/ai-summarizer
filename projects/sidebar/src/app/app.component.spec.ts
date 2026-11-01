import {signal, WritableSignal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {of} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AppComponent} from './app.component';
import {ClassificationService, HistoryItem, HistoryService, SettingsService, SummaryService, SummaryState, ThemeService} from '@shared/public-api';

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
  let historyItems: WritableSignal<HistoryItem[]>;
  let selectedHistory: WritableSignal<HistoryItem | null>;
  let classifyWithMistralAgent: ReturnType<typeof vi.fn>;
  let addSummary: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    summary = {
      state: signal<SummaryState>({state: 'idle'}),
      extractAndSummarize: vi.fn(() => of({})),
      setPermissionRequestError(error: string) { this.state.update(state => state.state === 'error' && state.permissionRequired ? {...state, error} : state); },
    };
    historyItems = signal<HistoryItem[]>([]);
    selectedHistory = signal<HistoryItem | null>(null);
    classifyWithMistralAgent = vi.fn(() => of({labels: ['one', 'two', 'three', 'four', 'five']}));
    addSummary = vi.fn();
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        {provide: SummaryService, useValue: summary},
        {provide: SettingsService, useValue: {getMLSettings: () => ({mlEnabled: false})}},
        {provide: ClassificationService, useValue: {checkMLAvailability: () => of({available: false, apiAvailable: false, permissionGranted: false}), classifyWithMistralAgent}},
        {provide: HistoryService, useValue: {getSelectedItem: () => selectedHistory(), getItems: () => historyItems(), getCount: () => historyItems().length, addSummary, selectItem: (item: HistoryItem) => { selectedHistory.set(item); }}},
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

  it('shows stored agent labels in the current summary, history row, and history detail without classifying on open', () => {
    const labels = ['minecraft', 'virtual_reality', 'open_data', 'gaming_project', '3d_modeling'];
    const item: HistoryItem = {
      id: 'item-1', summary: 'Saved summary', title: 'Saved article', articleUrl: 'https://example.com',
      cached: false, timestamp: new Date(), preview: 'Saved preview', agentLabels: labels,
    };
    const summaryResult = {summary: item.summary, title: item.title, articleUrl: item.articleUrl, timestamp: item.timestamp, cached: false, agentLabels: labels};
    summary.state.set({state: 'success', summary: summaryResult});
    fixture.componentInstance.summaryState.set({state: 'success', summary: summaryResult});
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.summary-view').textContent).toContain('Virtual reality');

    historyItems.set([item]);
    fixture.componentInstance.setView('history');
    fixture.detectChanges();
    const row = fixture.nativeElement.querySelector('.history-item');
    expect(Array.from(row.querySelectorAll('.history-agent-label'), (label: Element) => label.textContent?.trim())).toEqual(['Minecraft', 'Virtual reality']);
    expect(row.querySelector('.history-agent-label-count').textContent).toContain('+3');
    expect(row.querySelector('.history-agent-labels').getAttribute('aria-label')).toBe('Agent classification: Minecraft, Virtual reality, Open data, Gaming project, 3d modeling');

    row.click();
    fixture.detectChanges();
    const detailLabels = fixture.nativeElement.querySelectorAll('.agent-labels-section .agent-label-badge');
    expect(Array.from(detailLabels, (label: Element) => label.textContent?.trim())).toEqual(['Minecraft', 'Virtual reality', 'Open data', 'Gaming project', '3d modeling']);
    expect(item.agentLabels).toEqual(labels);
    expect(summary.extractAndSummarize).not.toHaveBeenCalled();
    expect(classifyWithMistralAgent).not.toHaveBeenCalled();
  });

  it('shows a classifier error separately while keeping the summary visible', () => {
    const result = {summary: 'Summary text', title: 'Article', timestamp: new Date(), cached: false, agentClassificationError: 'Agent timed out'};
    summary.state.set({state: 'success', summary: result});
    fixture.componentInstance.summaryState.set({state: 'success', summary: result});
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.summary-text').textContent).toContain('Summary text');
    expect(fixture.nativeElement.querySelector('.agent-classification-error').textContent).toContain('Agent timed out');
  });

  it('auto-adds a completed summary only once across effect cycles', async () => {
    const result = {summary: 'Summary text', title: 'Article', timestamp: new Date(), cached: false, agentLabels: ['one', 'two', 'three', 'four', 'five']};
    summary.state.set({state: 'success', summary: result});
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    fixture.detectChanges();
    expect(addSummary).toHaveBeenCalledTimes(1);
  });

  it('opens an older history item without labels and does not classify it', () => {
    const legacy: HistoryItem = {id: 'legacy', summary: 'Old summary', title: 'Old', articleUrl: '', cached: false, timestamp: new Date(), preview: 'Old summary'};
    historyItems.set([legacy]);
    fixture.componentInstance.setView('history');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.history-agent-labels')).toBeNull();
    fixture.componentInstance.viewHistoryDetail(legacy);
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedHistoryItem()?.agentLabels).toBeUndefined();
    expect(classifyWithMistralAgent).not.toHaveBeenCalled();
  });

  it('does not show an overflow count when two labels fit', () => {
    const item: HistoryItem = {id: 'two', summary: 'Summary', title: 'Article', articleUrl: '', cached: false, timestamp: new Date(), preview: 'Summary', agentLabels: ['one', 'two']};
    historyItems.set([item]);
    fixture.componentInstance.setView('history');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.history-agent-label').length).toBe(2);
    expect(fixture.nativeElement.querySelector('.history-agent-label-count')).toBeNull();
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
