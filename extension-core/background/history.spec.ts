import {beforeEach, describe, expect, it, vi} from 'vitest';

const storage = vi.hoisted(() => ({items: [] as {id: string; summary: string}[], get: vi.fn(), set: vi.fn()}));
vi.mock('webextension-polyfill', () => ({default: {storage: {local: {get: storage.get, set: storage.set}}}}));
import {mutateHistory} from './history';

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
});
