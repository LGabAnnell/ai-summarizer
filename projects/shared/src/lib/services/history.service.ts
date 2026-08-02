/**
 * History Service for managing summary history
 * Stores and retrieves recent summaries for the sidebar
 */

import { Injectable, signal } from '@angular/core';
import { SummaryResult } from '../models/summary.model';
import browser from 'webextension-polyfill';

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
  readonly selectedItem = this._selectedItem.asReadonly();

  constructor() {
    this.loadHistory();
  }

  /**
   * Load history from storage
   */
  private async loadHistory(): Promise<void> {
    try {
      // Check if we're in a browser extension context
      if (typeof browser !== 'undefined' && browser.storage) {
        const result = await browser.storage.local.get([HISTORY_STORAGE_KEY]) as Record<string, HistoryItem[]> ;
        if (result[HISTORY_STORAGE_KEY]) {
          const storedHistory: HistoryItem[] = result[HISTORY_STORAGE_KEY];
          this._history.set(storedHistory.sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          ));
        }
      }
    } catch (error) {
      console.error('Failed to load history:', error);
    }
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
        await browser.storage.local.set({ [HISTORY_STORAGE_KEY]: limitedHistory });
      }
    } catch (error) {
      console.error('Failed to save history:', error);
    }
  }

  /**
   * Add a new summary to history
   */
  async addSummary(summaryResult: SummaryResult): Promise<void> {
    const history = this._history();
    
    // Create a new history item
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
      preview: this.generatePreview(summaryResult.summary)
    };

    // Add to beginning of history
    this._history.set([newItem, ...history]);
    
    // Save to storage
    await this.saveHistory();

    // If this is the first item or most recent, select it
    if (history.length === 0 || new Date(newItem.timestamp) >= new Date(history[0].timestamp)) {
      this._selectedItem.set(newItem);
    }
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
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

  /**
   * Select a history item for viewing
   */
  selectItem(item: HistoryItem): void {
    this._selectedItem.set(item);
  }

  /**
   * Clear selection
   */
  clearSelection(): void {
    this._selectedItem.set(null);
  }

  /**
   * Delete a history item
   */
  async deleteItem(id: string): Promise<void> {
    const history = this._history();
    const updatedHistory = history.filter(item => item.id !== id);
    this._history.set(updatedHistory);
    
    // If deleted item was selected, clear selection
    if (this._selectedItem()?.id === id) {
      this._selectedItem.set(null);
    }
    
    await this.saveHistory();
  }

  /**
   * Clear all history
   */
  async clearAll(): Promise<void> {
    this._history.set([]);
    this._selectedItem.set(null);
    await this.saveHistory();
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
   * Check if there are any history items
   */
  hasItems(): boolean {
    return this._history().length > 0;
  }

  /**
   * Get history count
   */
  getCount(): number {
    return this._history().length;
  }
}