import {TestBed} from '@angular/core/testing';
import {of} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {MessagingService} from './messaging.service';
import {HistoryItem, HistoryService} from './history.service';

const storageHarness = vi.hoisted(() => ({
  history: [] as unknown[],
  listeners: [] as Array<(changes: Record<string, {oldValue?: unknown; newValue?: unknown}>, areaName: string) => void>,
}));
const storage = vi.hoisted(() => ({
  local: {get: vi.fn(), set: vi.fn()},
  onChanged: {
    addListener: vi.fn((listener: (changes: Record<string, {oldValue?: unknown; newValue?: unknown}>, areaName: string) => void) => {
      storageHarness.listeners.push(listener);
    }),
    removeListener: vi.fn((listener: (changes: Record<string, {oldValue?: unknown; newValue?: unknown}>, areaName: string) => void) => {
      storageHarness.listeners = storageHarness.listeners.filter(current => current !== listener);
    }),
  },
}));
const runtime = vi.hoisted(() => ({sendMessage: vi.fn()}));
vi.mock('webextension-polyfill', () => ({default: {storage, runtime}}));

const STORAGE_KEY = 'ai-summarizer-history';
const labels = ['one', 'two', 'three', 'four', 'five'];
const summaryResult = (summary: string, timestamp = new Date()): Parameters<HistoryService['addSummary']>[0] => ({
  summary, cached: false, timestamp, title: summary, articleUrl: '', agentLabels: labels,
});

describe('HistoryService persistence and storage synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageHarness.history = [];
    storageHarness.listeners = [];
    storage.local.get.mockImplementation(async () => ({[STORAGE_KEY]: [...storageHarness.history]}));
    storage.local.set.mockImplementation(async (value: Record<string, unknown>) => {
      const oldValue = storageHarness.history;
      storageHarness.history = (value[STORAGE_KEY] as unknown[]) ?? [];
      for (const listener of storageHarness.listeners) {
        listener({[STORAGE_KEY]: {oldValue, newValue: storageHarness.history}}, 'local');
      }
    });
    runtime.sendMessage.mockImplementation(async (request: {type: string; id?: string; summary?: HistoryItem}) => {
      const items = [...storageHarness.history] as HistoryItem[];
      if (request.type === 'HISTORY_ADD' && request.summary) {
        const summary = request.summary;
        items.unshift({...summary, id: crypto.randomUUID(), preview: summary.summary.slice(0, 100)});
      } else if (request.type === 'HISTORY_DELETE') {
        const index = items.findIndex(item => item.id === request.id);
        if (index >= 0) items.splice(index, 1);
      } else if (request.type === 'HISTORY_CLEAR') items.length = 0;
      await storage.local.set({[STORAGE_KEY]: items});
      return {success: true, data: items};
    });
    TestBed.configureTestingModule({providers: [HistoryService, {provide: MessagingService, useValue: {clearCache: () => of({success: true})}}]});
  });

  afterEach(() => TestBed.resetTestingModule());

  it('saves labels, reloads labeled and legacy entries, and selects the loaded item', async () => {
    const service = TestBed.inject(HistoryService);
    await new Promise(resolve => setTimeout(resolve, 0));
    await service.addSummary(summaryResult('Saved summary', new Date('2026-10-31T10:00:00Z')));
    const saved = storageHarness.history as HistoryItem[];
    expect(saved[0].agentLabels).toEqual(labels);

    const legacy: HistoryItem = {
      id: 'legacy', summary: 'Legacy summary', title: 'Legacy', articleUrl: '', cached: true,
      timestamp: new Date('2026-10-30T10:00:00Z'), preview: 'Legacy summary',
    };
    storageHarness.history = [...saved, legacy];
    await TestBed.resetTestingModule();
    TestBed.configureTestingModule({providers: [HistoryService, {provide: MessagingService, useValue: {clearCache: () => of({success: true})}}]});
    const reloaded = TestBed.inject(HistoryService);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(reloaded.getItems()[0].agentLabels).toEqual(labels);
    expect(reloaded.getItems().find(item => item.id === 'legacy')).not.toHaveProperty('agentLabels');
    reloaded.selectItem(reloaded.getItems()[0]);
    expect(reloaded.getSelectedItem()?.agentLabels).toEqual(labels);
  });

  it('preserves initial history and both summaries when concurrent adds wait on deferred loading', async () => {
    let finishInitialLoad!: (value: Record<string, unknown>) => void;
    storage.local.get.mockImplementationOnce(() => new Promise(resolve => { finishInitialLoad = resolve; }));
    const service = TestBed.inject(HistoryService);
    const legacy: HistoryItem = {
      id: 'legacy', summary: 'Existing', title: 'Existing', articleUrl: '', cached: false,
      timestamp: new Date('2026-10-30T10:00:00Z'), preview: 'Existing',
    };
    storageHarness.history = [legacy];
    const firstAdd = service.addSummary(summaryResult('First'));
    const secondAdd = service.addSummary(summaryResult('Second'));
    finishInitialLoad({[STORAGE_KEY]: [legacy]});
    await Promise.all([firstAdd, secondAdd]);

    expect(service.getItems()).toHaveLength(3);
    expect(new Set(service.getItems().map(item => item.summary))).toEqual(new Set(['Existing', 'First', 'Second']));
    expect(storageHarness.history).toHaveLength(3);
  });

  it('keeps a newer storage update when the initial read finishes later', async () => {
    let finishInitialLoad!: (value: Record<string, unknown>) => void;
    storage.local.get.mockImplementationOnce(() => new Promise(resolve => { finishInitialLoad = resolve; }));
    const service = TestBed.inject(HistoryService);
    const item: HistoryItem = {id: 'new', summary: 'New', title: 'New', articleUrl: '', cached: false,
      timestamp: new Date(), preview: 'New'};
    for (const listener of storageHarness.listeners) listener({[STORAGE_KEY]: {newValue: [item]}}, 'local');
    finishInitialLoad({[STORAGE_KEY]: []});
    await vi.waitFor(() => expect(storage.local.get).toHaveResolved());
    expect(service.getItems()).toEqual([item]);
  });

  it('keeps newer history and selection when a stale mutation response arrives', async () => {
    const service = TestBed.inject(HistoryService);
    await new Promise(resolve => setTimeout(resolve, 0));
    const older: HistoryItem = {id: 'old', summary: 'Old', title: 'Old', articleUrl: '', cached: false,
      timestamp: new Date('2026-10-30T10:00:00Z'), preview: 'Old'};
    const newer: HistoryItem = {id: 'new', summary: 'New', title: 'New', articleUrl: '', cached: false,
      timestamp: new Date('2026-10-31T10:00:00Z'), preview: 'New'};
    let finishMutation!: (value: unknown) => void;
    runtime.sendMessage.mockImplementationOnce(() => new Promise(resolve => { finishMutation = resolve; }));
    const pending = service.addSummary(summaryResult('Old'));
    await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalled());
    storageHarness.history = [newer];
    for (const listener of storageHarness.listeners) listener({[STORAGE_KEY]: {newValue: [newer]}}, 'local');
    service.selectItem(newer);
    finishMutation({success: true, data: [older]});
    await pending;
    expect(service.getItems()).toEqual([newer]);
    expect(service.getSelectedItem()).toEqual(newer);
  });

  it('keeps a storage update that arrives while the post-mutation refresh is pending', async () => {
    const service = TestBed.inject(HistoryService);
    await new Promise(resolve => setTimeout(resolve, 0));
    const old: HistoryItem = {id: 'old', summary: 'Old', title: 'Old', articleUrl: '', cached: false,
      timestamp: new Date('2026-10-30T10:00:00Z'), preview: 'Old'};
    const latest: HistoryItem = {id: 'latest', summary: 'Latest', title: 'Latest', articleUrl: '', cached: false,
      timestamp: new Date('2026-10-31T10:00:00Z'), preview: 'Latest'};
    let finishMutation!: (value: unknown) => void;
    let finishRefresh!: (value: Record<string, unknown>) => void;
    runtime.sendMessage.mockImplementationOnce(() => new Promise(resolve => { finishMutation = resolve; }));
    storage.local.get.mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve; }));
    const pending = service.addSummary(summaryResult('Old'));
    await vi.waitFor(() => expect(runtime.sendMessage).toHaveBeenCalled());
    for (const listener of storageHarness.listeners) listener({[STORAGE_KEY]: {newValue: [old]}}, 'local');
    finishMutation({success: true, data: [old]});
    await vi.waitFor(() => expect(storage.local.get).toHaveBeenCalledTimes(2));
    for (const listener of storageHarness.listeners) listener({[STORAGE_KEY]: {newValue: [latest]}}, 'local');
    service.selectItem(latest);
    finishRefresh({[STORAGE_KEY]: [old]});
    await pending;
    expect(service.getItems()).toEqual([latest]);
    expect(service.getSelectedItem()).toEqual(latest);
  });

  it('applies only local history storage changes and updates or clears the selected item', async () => {
    const service = TestBed.inject(HistoryService);
    await new Promise(resolve => setTimeout(resolve, 0));
    await service.addSummary(summaryResult('Selected'));
    const selected = service.getSelectedItem();
    expect(selected).not.toBeNull();
    const updated: HistoryItem = {...selected!, summary: 'Updated', agentLabels: ['updated']};

    const dispatch = (changes: Record<string, {oldValue?: unknown; newValue?: unknown}>, area: string) => {
      for (const listener of storageHarness.listeners) listener(changes, area);
    };
    dispatch({unrelated: {newValue: true}}, 'local');
    dispatch({[STORAGE_KEY]: {newValue: [updated]}}, 'sync');
    expect(service.getItems()[0].summary).toBe('Selected');

    dispatch({[STORAGE_KEY]: {newValue: [updated]}}, 'local');
    expect(service.getItems()[0].summary).toBe('Updated');
    expect(service.getSelectedItem()).toMatchObject({id: selected!.id, agentLabels: ['updated']});
    dispatch({[STORAGE_KEY]: {newValue: []}}, 'local');
    expect(service.getItems()).toEqual([]);
    expect(service.getSelectedItem()).toBeNull();

    const listenersBeforeDestroy = storageHarness.listeners.length;
    await TestBed.resetTestingModule();
    expect(storage.onChanged.removeListener).toHaveBeenCalledTimes(listenersBeforeDestroy);
    expect(storageHarness.listeners).toEqual([]);
  });
});
