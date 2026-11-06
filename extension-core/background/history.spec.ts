import {beforeEach, describe, expect, it, vi} from 'vitest';

const storage = vi.hoisted(() => ({items: [] as {id: string; summary: string}[], get: vi.fn(), set: vi.fn()}));
vi.mock('webextension-polyfill', () => ({default: {storage: {local: {get: storage.get, set: storage.set}}}}));
import {getHistoryGeneration, mutateHistory} from './history';

beforeEach(() => {
  storage.items = [];
  storage.get.mockImplementation(async () => ({'ai-summarizer-history': [...storage.items]}));
  storage.set.mockImplementation(async (value: Record<string, unknown>) => {
    await Promise.resolve();
    storage.items = value['ai-summarizer-history'] as typeof storage.items;
  });
});

describe('background history queue', () => {
  it('serializes concurrent writes and ignores repeated job IDs', async () => {
    const summary = (text: string) => ({summary: text, cached: false, timestamp: new Date()});
    await Promise.all([
      mutateHistory({type: 'HISTORY_ADD', id: 'one', summary: summary('one')}),
      mutateHistory({type: 'HISTORY_ADD', id: 'two', summary: summary('two')}),
      mutateHistory({type: 'HISTORY_ADD', id: 'one', summary: summary('one')}),
    ]);
    expect(storage.items.map(item => item.id).sort()).toEqual(['one', 'two']);
    await mutateHistory({type: 'HISTORY_DELETE', id: 'one'});
    expect(storage.items.map(item => item.id)).toEqual(['two']);
    await mutateHistory({type: 'HISTORY_CLEAR'});
    expect(storage.items).toEqual([]);
  });

  it('discards old jobs after a clear while preserving jobs started during the clear', async () => {
    const summary = (text: string) => ({summary: text, cached: false, timestamp: new Date()});
    const oldGeneration = getHistoryGeneration();
    let finishClear!: () => void;
    storage.set.mockImplementationOnce((value: Record<string, unknown>) => new Promise<void>(resolve => {
      finishClear = () => { storage.items = value['ai-summarizer-history'] as typeof storage.items; resolve(); };
    }));
    const clear = mutateHistory({type: 'HISTORY_CLEAR'});
    const newGeneration = getHistoryGeneration();
    const oldJob = mutateHistory({type: 'HISTORY_ADD', id: 'old', summary: summary('old'), generation: oldGeneration});
    const newJob = mutateHistory({type: 'HISTORY_ADD', id: 'new', summary: summary('new'), generation: newGeneration});
    await vi.waitFor(() => expect(storage.set).toHaveBeenCalled());
    finishClear();
    await Promise.all([clear, oldJob, newJob]);
    expect(storage.items.map(item => item.id)).toEqual(['new']);
  });
});
