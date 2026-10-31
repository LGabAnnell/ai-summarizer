/**
 * History Service for managing summary history
 * Stores and retrieves recent summaries for the sidebar
 */

import {DestroyRef, inject, Injectable, signal} from '@angular/core';
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
const MAX_HISTORY_ITEMS = 50;

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
      await this.historyReady;
      await this.refreshHistoryFromStorage();
      const history = this._history();

      const newItem: HistoryItem = {
        id: this.generateId(),
        summary: summaryResult.summary,
        title: summaryResult.title || 'Untitled Article',
        articleUrl: summaryResult.articleUrl || '',
        cached: summaryResult.cached || false,
        timestamp: summaryResult.timestamp || new Date(),
        provider: summaryResult.provider,
        model: summaryResult.model,
        tokenCount: summaryResult.tokenCount,
        agentLabels: summaryResult.agentLabels,
        preview: this.generatePreview(summaryResult.summary),
      };

      this._history.set([newItem, ...history]);
      await this.saveHistory();

      if (history.length === 0 || new Date(newItem.timestamp) >= new Date(history[0].timestamp)) {
        this._selectedItem.set(newItem);
      }
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
      await this.historyReady;
      await this.refreshHistoryFromStorage();
      this._history.update(history => history.filter(item => item.id !== id));
      if (this._selectedItem()?.id === id) this._selectedItem.set(null);
      await this.saveHistory();
    });
  }

  /**
   * Clear all history
   */
  clearAll(): Promise<void> {
    return this.enqueueMutation(async () => {
      await this.historyReady;
      this._history.set([]);
      this._selectedItem.set(null);
      await this.saveHistory();

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

  /**
   * Save history to storage
   */
  private async saveHistory(): Promise<void> {
    try {
      // Check if we're in a browser extension context
      if (typeof browser !== 'undefined' && browser.storage) {
        const history = this._history();
        // Limit history to maximum items
        const limitedHistory = history.slice(0, MAX_HISTORY_ITEMS);
        await browser.storage.local.set({[HISTORY_STORAGE_KEY]: limitedHistory});
      }
    } catch (error) {
      console.error('Failed to save history:', error);
    }
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  /**
   * Generate a preview from summary text
   */
  private generatePreview(summary: string): string {
    if (!summary) return '';

    // Remove markdown formatting for preview
    let preview = summary.replace(/[#*_~`\\]/g, '');

    // Take first 100 characters
    preview = preview.substring(0, 100);

    // Add ellipsis if truncated
    if (summary.length > 100) {
      preview += '...';
    }

    return preview;
  }
}
