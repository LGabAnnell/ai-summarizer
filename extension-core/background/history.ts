import browser from 'webextension-polyfill';
import type {HistoryMutation} from '@shared/lib/models/panel.model';
import type {SummaryResult} from '@shared/lib/models/summary.model';

const KEY = 'ai-summarizer-history';
interface HistoryEntry {
  id: string;
  summary: string;
  title: string;
  articleUrl: string;
  cached: boolean;
  timestamp: Date;
  provider?: string;
  model?: string;
  tokenCount?: number;
  agentLabels?: string[];
  preview: string;
}
let queue: Promise<unknown> = Promise.resolve();

export function mutateHistory(mutation: HistoryMutation): Promise<HistoryEntry[]> {
  const operation = queue.then(async() => {
    const data = await browser.storage.local.get(KEY) as Record<string, HistoryEntry[] | undefined>;
    let items = data[KEY] ?? [];
    if (mutation.type === 'HISTORY_ADD') {
      const summary: SummaryResult = mutation.summary;
      const id = mutation.id ?? crypto.randomUUID();
      if (!items.some(item => item.id === id)) {
        const preview = summary.summary.replace(/[#*_~`\\]/g, '').substring(0, 100) + (summary.summary.length > 100 ? '...' : '');
        items = [{id, summary: summary.summary, title: summary.title ?? 'Untitled Article', articleUrl: summary.articleUrl ?? '',
          cached: summary.cached, timestamp: summary.timestamp, provider: summary.provider, model: summary.model,
          tokenCount: summary.tokenCount, agentLabels: summary.agentLabels, preview}, ...items];
      }
    } else if (mutation.type === 'HISTORY_DELETE') {
      items = items.filter(item => item.id !== mutation.id);
    } else {
      items = [];
    }
    items = items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 50);
    await browser.storage.local.set({[KEY]: items});
    return items;
  });
  queue = operation.catch(() => undefined);
  return operation;
}
