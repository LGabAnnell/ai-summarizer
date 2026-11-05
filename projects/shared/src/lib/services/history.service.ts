/**
 * History Service for managing summary history
 * Stores and retrieves recent summaries for the sidebar
 */

import {DestroyRef, inject, Injectable, signal} from '@angular/core';
import {HistoryMutation} from '../models/panel.model';
import {SummaryResult} from '../models/summary.model';
import {MessagingService} from './messaging.service';
import browser from 'webextension-polyfill';
import {firstValueFrom} from "rxjs";

/**
 * Summary history item with additional metadata
 */
export interface HistoryItem {
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
  // Preview text (first few lines of summary)
  preview: string;
}

/**
 * Maximum number of history items to store
 */


/**
 * Storage key for history
 */
const HISTORY_STORAGE_KEY = 'ai-summarizer-history';

@Injectable({
  providedIn: 'root'
})
export class HistoryService {
  // History items signal
  private _history = signal<HistoryItem[]>([]);
  readonly history = this._history.asReadonly();

  // Selected history item for viewing
  private _selectedItem = signal<HistoryItem | null>(null);

  private readonly messaging = inject(MessagingService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly historyReady: Promise<void>;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.historyReady = this.loadHistory();
    const storageChangedListener = (changes: Record<string, browser.Storage.StorageChange>, areaName: string) => {
      if (areaName !== 'local' || !changes[HISTORY_STORAGE_KEY]) return;
      const value = changes[HISTORY_STORAGE_KEY].newValue as HistoryItem[] | undefined;
      this._history.set(this.sortHistory(value ?? []));
      const selected = this._selectedItem();
      this._selectedItem.set(selected ? this._history().find(item => item.id === selected.id) ?? null : null);
    };
    if (typeof browser !== 'undefined') browser.storage?.onChanged?.addListener(storageChangedListener);
    this.destroyRef.onDestroy(() => {
      if (typeof browser !== 'undefined') browser.storage?.onChanged?.removeListener(storageChangedListener);
    });
  }

  /**
   * Add a new summary to history
   */
  addSummary(summaryResult: SummaryResult): Promise<void> {
    return this.enqueueMutation(async () => {
      const items = await this.mutate({type: 'HISTORY_ADD', summary: summaryResult});
      const selected = items.find(item => item.summary === summaryResult.summary && item.articleUrl === (summaryResult.articleUrl || ''));
      if (selected) this._selectedItem.set(selected);
    });
  }

  /**
   * Select a history item for viewing
   */
  selectItem(item: HistoryItem): void {
    this._selectedItem.set(item);
  }

  /**
   * Delete a history item
   */
  deleteItem(id: string): Promise<void> {
    return this.enqueueMutation(async () => {
      await this.mutate({type: 'HISTORY_DELETE', id});
      if (this._selectedItem()?.id === id) this._selectedItem.set(null);
    });
  }

  clearAll(): Promise<void> {
    return this.enqueueMutation(async () => {
      await this.mutate({type: 'HISTORY_CLEAR'});
      this._selectedItem.set(null);
      try {
        await firstValueFrom(this.messaging.clearCache());
      } catch (error) {
        console.error('Failed to clear summary cache while clearing history:', error);
      }
    });
  }

  /**
   * Get history items
   */
  getItems(): HistoryItem[] {
    return this._history();
  }

  /**
   * Get selected item
   */
  getSelectedItem(): HistoryItem | null {
    return this._selectedItem();
  }

  /**
   * Get history count
   */
  getCount(): number {
    return this._history().length;
  }

  /**
   * Load history from storage
   */
  private async loadHistory(): Promise<void> {
    try {
      await this.refreshHistoryFromStorage();
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  }

  private async refreshHistoryFromStorage(): Promise<void> {
    if (typeof browser === 'undefined' || !browser.storage) return;
    const result = await browser.storage.local.get([HISTORY_STORAGE_KEY]) as Record<string, HistoryItem[]>;
    this._history.set(this.sortHistory(result[HISTORY_STORAGE_KEY] ?? []));
  }

  private sortHistory(history: HistoryItem[]): HistoryItem[] {
    return [...history].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  private enqueueMutation(operation: () => Promise<void>): Promise<void> {
    const pending = this.mutationQueue.then(operation, operation);
    this.mutationQueue = pending.catch(() => undefined);
    return pending;
  }

  private async mutate(mutation: HistoryMutation): Promise<HistoryItem[]> {
    await this.historyReady;
    const response = await browser.runtime.sendMessage(mutation) as {success: boolean; data?: HistoryItem[]; error?: string};
    if (!response.success || !response.data) throw new Error(response.error || 'Failed to save history');
    const items = this.sortHistory(response.data);
    this._history.set(items);
    return items;
  }
}
