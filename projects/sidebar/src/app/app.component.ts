import { Component, inject, signal, OnInit, OnDestroy, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MarkdownPipe,
  SummaryService,
  MessagingService,
  SettingsService,
  HistoryService,
  ThemeService,
  SummaryState,
  SummaryResult,
  HistoryItem
} from '@shared/public-api';

// Declare browser API for Firefox extensions
declare const browser: any;

/**
 * View modes for the sidebar
 */
type ViewMode = 'current' | 'history' | 'history-detail';

@Component({
  selector: 'sidebar-root',
  standalone: true,
  imports: [CommonModule, MarkdownPipe],
  template: `
    <div class="container" [class.dark-theme]="themeService.isDarkTheme()">
      <!-- Header -->
      <div class="header">
        <div class="logo">
          <div class="icon">AS</div>
          <span>Article Summarizer</span>
        </div>
        <div class="header-controls">
          <button 
            class="theme-toggle" 
            [class.theme-toggle--active]="themeService.getTheme() !== 'light'"
            (click)="toggleTheme()"
            [attr.aria-label]="themeService.isDarkTheme() ? 'Switch to light mode' : 'Switch to dark mode'"
            title="Toggle theme">
            @if (themeService.isDarkTheme()) {
              <span>☀️</span>
            } @else {
              <span>🌙</span>
            }
          </button>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs">
        <button 
          class="tab" 
          [class.tab--active]="currentView() === 'current'"
          (click)="setView('current')">
          Current
        </button>
        <button 
          class="tab tab--count" 
          [class.tab--active]="currentView() === 'history' || currentView() === 'history-detail'"
          (click)="setView('history')">
          History
          @if (historyService.getCount() > 0) {
            <span class="count-badge">{{ historyService.getCount() }}</span>
          }
        </button>
      </div>

      <!-- Main Content -->
      <div class="main-content">
        <!-- Current Summary View -->
        @if (currentView() === 'current') {
          @if (summaryState().state === 'idle') {
            <div class="empty-state">
              <div class="empty-icon">📰</div>
              <div class="empty-title">Ready to summarize</div>
              <div class="empty-message">Click the button below to summarize the current article</div>
            </div>
          }
          
          @if (summaryState().state === 'loading') {
            <div class="loading-state">
              <div class="loading-spinner"></div>
              <div class="loading-text">{{ summaryState().loadingMessage || 'Processing...' }}</div>
            </div>
          }
          
          @if (summaryState().state === 'error') {
            <div class="error-state">
              <div class="error-icon">⚠️</div>
              <div class="error-title">Error</div>
              <div class="error-message">{{ summaryState().error || 'Failed to summarize article' }}</div>
              <button class="retry-btn" (click)="retry()">Retry</button>
            </div>
          }
          
          @if (summaryState().state === 'success' && currentSummary()) {
            <div class="current-summary-view">
              <div class="summary-header">
                <div class="summary-title">{{ currentSummary()?.title || 'Article Summary' }}</div>
                <div class="summary-actions">
                  <button 
                    class="copy-btn" 
                    [class.copy-btn--success]="copySuccess()"
                    (click)="copyToClipboard()"
                    [disabled]="copying()">
                    @if (copying()) {
                      <span class="spinner"></span>
                      Copying...
                    } @else if (copySuccess()) {
                      ✓ Copied!
                    } @else {
                      Copy
                    }
                  </button>
                  <button class="expand-btn" (click)="addToHistory()" title="Save to history">
                    💾 Save
                  </button>
                </div>
              </div>
              <div class="summary-text markdown-content" [innerHTML]="currentSummary()?.summary | markdown"></div>
              <div class="summary-meta">
                <span>{{ characterCount() }} characters</span>
                @if (isCached()) {
                  <span class="cached-badge">Cached</span>
                }
                @if (currentSummary()?.provider) {
                  <span class="text-muted">{{ currentSummary()?.provider }} / {{ currentSummary()?.model }}</span>
                }
              </div>
            </div>
          }
        }

        <!-- History List View -->
        @if (currentView() === 'history') {
          @if (historyItems().length === 0) {
            <div class="empty-history">
              <div class="empty-icon">📜</div>
              <div class="empty-title">No history yet</div>
              <div class="empty-message">Summarize articles to save them to your history</div>
            </div>
          } @else {
            <div class="history-list">
              @for (item of historyItems(); track item.id) {
                <div 
                  class="history-item" 
                  [class.history-item--selected]="selectedHistoryItem()?.id === item.id"
                  (click)="viewHistoryDetail(item)">
                  <div class="history-icon">📄</div>
                  <div class="history-content">
                    <div class="history-title">{{ item.title }}</div>
                    <div class="history-preview">{{ item.preview }}</div>
                    <div class="history-meta">
                      <span class="history-date">{{ formatDate(item.timestamp) }}</span>
                      @if (item.provider) {
                        <span class="text-muted">{{ item.provider }}</span>
                      }
                    </div>
                  </div>
                  <div class="history-actions">
                    <button class="delete-btn" (click)="deleteHistoryItem($event, item.id)" title="Delete">
                      🗑️
                    </button>
                  </div>
                </div>
              }
            </div>
          }
        }

        <!-- Single History Detail View -->
        @if (currentView() === 'history-detail' && selectedHistoryItem()) {
          <div class="single-history-view">
            <button class="back-btn" (click)="setView('history')">
              ← Back to History
            </button>
            <div class="history-detail-header">
              <div class="history-detail-title">{{ selectedHistoryItem()?.title }}</div>
              <div class="history-detail-actions">
                <button 
                  class="copy-btn" 
                  [class.copy-btn--success]="detailCopySuccess()"
                  (click)="copyHistoryToClipboard()"
                  [disabled]="detailCopying()">
                  @if (detailCopying()) {
                    <span class="spinner"></span>
                    Copying...
                  } @else if (detailCopySuccess()) {
                    ✓ Copied!
                  } @else {
                    Copy
                  }
                </button>
                <button class="delete-btn" (click)="deleteSelectedHistoryItem()" title="Delete">
                  🗑️ Delete
                </button>
              </div>
            </div>
            <div class="history-detail-content">
              <div class="history-detail-text markdown-content" [innerHTML]="selectedHistoryItem()?.summary | markdown"></div>
            </div>
            <div class="history-detail-meta">
              <div class="meta-item">
                <span>📅 {{ formatDate(selectedHistoryItem()!.timestamp) }}</span>
              </div>
              @if (selectedHistoryItem()?.articleUrl) {
                <div class="meta-item">
                  <span>🔗 <a [href]="selectedHistoryItem()?.articleUrl" target="_blank" class="url-link">View Article</a></span>
                </div>
              }
              @if (selectedHistoryItem()?.provider) {
                <div class="meta-item">
                  <span>⚙️ {{ selectedHistoryItem()?.provider }} / {{ selectedHistoryItem()?.model }}</span>
                </div>
              }
              @if (selectedHistoryItem()?.tokenCount) {
                <div class="meta-item">
                  <span>🪙 {{ selectedHistoryItem()?.tokenCount }} tokens</span>
                </div>
              }
              <div class="meta-item">
                <span>📊 {{ (selectedHistoryItem()?.summary || '').length }} characters</span>
              </div>
              @if (selectedHistoryItem()?.cached) {
                <div class="meta-item">
                  <span class="cached-badge">Cached</span>
                </div>
              }
            </div>
          </div>
        }
      </div>

      <!-- Footer -->
      <div class="footer">
        <div class="footer-left">
          @if (summaryState().state === 'success' && currentArticleUrl()) {
            <a [href]="currentArticleUrl()" target="_blank" class="settings-link">View article</a>
          }
        </div>
        <div class="footer-right">
          @if (historyService.getCount() > 0) {
            <button class="settings-link" (click)="clearAllHistory()" style="background: none; border: none; cursor: pointer; color: var(--text-muted);">
              Clear History
            </button>
          }
          <a class="settings-link" (click)="openOptions()">Settings</a>
        </div>
      </div>

      <!-- Action Button -->
      <button 
        class="btn btn--primary btn--full-width"
        (click)="summarize()"
        [disabled]="summaryState().state === 'loading'">
        @if (summaryState().state === 'loading') {
          <span class="spinner"></span>
          Summarizing...
        } @else {
          Summarize Current Article
        }
      </button>
    </div>
  `,
  styles: [
    `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    
    .spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid rgba(0, 0, 0, 0.1);
      border-radius: 50%;
      border-top-color: #666;
      animation: spin 1s ease-in-out infinite;
    }
    
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    
    button {
      font-family: inherit;
    }
    
    .settings-link {
      cursor: pointer;
    }
    `
  ],
})
export class AppComponent implements OnInit, OnDestroy {
  // Services
  private summaryService = inject(SummaryService);
  private messagingService = inject(MessagingService);
  private settingsService = inject(SettingsService);
  public historyService = inject(HistoryService);
  public themeService = inject(ThemeService);

  // State signals
  currentView = signal<ViewMode>('current');
  summaryState = signal<SummaryState>({ state: 'idle' });
  
  // Track last added summary to prevent infinite loop
  private lastAddedSummaryId = signal<string | null>(null);
  
  // Store message listener for cleanup
  private messageListener: any = null;
  
  // Copy state for current summary
  copying = signal<boolean>(false);
  copySuccess = signal<boolean>(false);
  
  // Copy state for history detail
  detailCopying = signal<boolean>(false);
  detailCopySuccess = signal<boolean>(false);

  // Computed values
  currentSummary = computed<SummaryResult | null>(() => {
    const state = this.summaryState();
    return state.state === 'success' ? state.summary || null : null;
  });

  currentArticleUrl = computed<string>(() => {
    const summary = this.currentSummary();
    return summary?.articleUrl || '';
  });

  isCached = computed<boolean>(() => {
    const summary = this.currentSummary();
    return summary?.cached || false;
  });

  selectedHistoryItem = computed<HistoryItem | null>(() => {
    return this.historyService.getSelectedItem();
  });

  historyItems = computed<HistoryItem[]>(() => {
    return this.historyService.getItems();
  });

  constructor() {
    // Apply theme to document on initialization
    this.themeService.applyThemeToDocument();
    
    // Set up effect to apply theme changes
    effect(() => {
      this.themeService.applyThemeToDocument();
    });
    
    // Set up effect to watch summary state changes
    effect(() => {
      const state = this.summaryService.state();
      console.log('Summary service state changed:', state);
      
      // Only update local state if it actually changed to avoid infinite loop
      const currentState = this.summaryState();
      if (JSON.stringify(currentState) !== JSON.stringify(state)) {
        this.summaryState.set(state);
      }
      
      // Auto-add to history when a new summary is generated
      if (state.state === 'success' && state.summary) {
        // Generate a unique identifier for this summary using timestamp + content hash
        const summaryId = state.summary.timestamp.getTime().toString() + state.summary.summary.substring(0, 50);
        
        // Only add if we haven't added this exact summary already
        if (this.lastAddedSummaryId() !== summaryId) {
          console.log('Adding successful summary to history:', state.summary.title);
          this.historyService.addSummary(state.summary);
          this.lastAddedSummaryId.set(summaryId);
          console.log('Summary added to history');
        }
      }
      
      if (state.state === 'error') {
        console.error('Summary service entered error state:', state.error);
      }
      
      if (state.state === 'loading') {
        console.log('Summary service entered loading state:', state.loadingMessage);
      }
    });
  }

  ngOnInit(): void {
    console.log('Sidebar component initialized');
    
    // Get current state from summary service
    const currentState = this.summaryService.state();
    this.summaryState.set(currentState);
    console.log('Initial summary state:', currentState);

    // Check if we're in a browser extension context
    if (typeof browser !== 'undefined') {
      console.log('Browser extension context detected, setting up message listener');
      this.messageListener = (message: any) => {
        console.log('Sidebar received message:', message);
        console.log('Message type:', message?.type);
        console.log('Message data:', JSON.stringify(message, null, 2));
        // Handle any relevant messages
      };
      browser.runtime.onMessage.addListener(this.messageListener);
      console.log('Message listener registered successfully');
    } else {
      console.log('Not in browser extension context');
    }
  }

  ngOnDestroy(): void {
    console.log('Sidebar component being destroyed, cleaning up resources');
    // Clean up message listener to prevent memory leaks
    if (this.messageListener && typeof browser !== 'undefined') {
      console.log('Removing message listener');
      browser.runtime.onMessage.removeListener(this.messageListener);
      this.messageListener = null;
      console.log('Message listener removed');
    } else {
      console.log('No message listener to remove');
    }
  }

  /**
   * Set the current view
   */
  setView(view: ViewMode): void {
    console.log('Setting view to:', view);
    this.currentView.set(view);
    
    // Clear copy states when switching views
    if (view !== 'history-detail') {
      console.log('Clearing detail copy states');
      this.detailCopying.set(false);
      this.detailCopySuccess.set(false);
    }
    
    if (view !== 'current') {
      console.log('Clearing current copy states');
      this.copying.set(false);
      this.copySuccess.set(false);
    }
    console.log('View changed to:', view);
  }

  /**
   * Toggle theme between light and dark
   */
  toggleTheme(): void {
    const current = this.themeService.getTheme();
    console.log('Toggling theme from:', current);
    const newTheme = current === 'light' ? 'dark' : 'light';
    this.themeService.setTheme(newTheme);
    console.log('Theme changed to:', newTheme);
  }

  /**
   * Get character count for current summary
   */
  characterCount(): number {
    const summary = this.currentSummary();
    return summary?.summary?.length || 0;
  }

  /**
   * Format date for display
   */
  formatDate(date: Date | string): string {
    if (!date) return '';
    
    const d = typeof date === 'string' ? new Date(date) : date;
    
    // Check if date is from today
    const today = new Date();
    if (d.toDateString() === today.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // Check if date is from yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    
    // For older dates, show date
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  /**
   * Trigger article summarization
   */
  async summarize(): Promise<void> {
    console.log('Summarize method called');
    const state = this.summaryState();
    console.log('Current state before summarization:', state);
    
    if (state.state === 'loading') {
      console.log('Already in loading state, skipping new request');
      return;
    }

    console.log('Starting article extraction and summarization');
    this.summaryService.extractAndSummarize().subscribe({
      next: (result) => {
        console.log('Summarization result:', result);
        console.log('Result summary length:', result?.summary?.length);
        console.log('Result title:', result?.title);
        console.log('Result URL:', result?.articleUrl);
        console.log('Result cached:', result?.cached);
      },
      error: (error) => {
        console.error('Summarization error:', error);
        console.error('Error details:', error instanceof Error ? error.message : JSON.stringify(error));
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace available');
      }
    });
    console.log('Summarization request submitted');
  }

  /**
   * Retry summarization
   */
  retry(): void {
    console.log('Retry method called');
    this.summarize();
  }

  /**
   * Copy current summary to clipboard
   */
  async copyToClipboard(): Promise<void> {
    console.log('Copy to clipboard requested');
    if (this.copying()) {
      console.log('Already copying, skipping');
      return;
    }

    const summary = this.currentSummary();
    if (!summary?.summary) {
      console.log('No summary available to copy');
      return;
    }
    
    console.log('Copying summary to clipboard, length:', summary.summary.length);

    this.copying.set(true);
    this.copySuccess.set(false);

    try {
      await navigator.clipboard.writeText(summary.summary);
      console.log('Successfully copied to clipboard');
      this.copySuccess.set(true);
      
      setTimeout(() => {
        this.copySuccess.set(false);
        console.log('Copy success state reset');
      }, 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      this.copying.set(false);
    } finally {
      this.copying.set(false);
      console.log('Copy operation completed');
    }
  }

  /**
   * Add current summary to history
   */
  async addToHistory(): Promise<void> {
    console.log('Add to history requested');
    const summary = this.currentSummary();
    if (summary) {
      console.log('Adding summary to history:', summary.title, 'length:', summary.summary.length);
      await this.historyService.addSummary(summary);
      // Track this summary as added to prevent duplicate auto-adds
      const summaryId = summary.timestamp.getTime().toString() + summary.summary.substring(0, 50);
      this.lastAddedSummaryId.set(summaryId);
      console.log('Summary added to history successfully');
      // Switch to history view
      this.setView('history');
      console.log('Switched to history view');
    } else {
      console.log('No current summary to add to history');
    }
  }

  /**
   * View history detail
   */
  viewHistoryDetail(item: HistoryItem): void {
    console.log('View history detail requested for item:', item.id, item.title);
    this.historyService.selectItem(item);
    console.log('Item selected in history service');
    this.setView('history-detail');
    console.log('Switched to history-detail view');
  }

  /**
   * Delete a history item
   */
  async deleteHistoryItem(event: Event, id: string): Promise<void> {
    console.log('Delete history item requested:', id);
    event.stopPropagation(); // Prevent triggering the click on the item
    await this.historyService.deleteItem(id);
    console.log('History item deleted:', id);
  }

  /**
   * Delete the selected history item
   */
  async deleteSelectedHistoryItem(): Promise<void> {
    console.log('Delete selected history item requested');
    const item = this.selectedHistoryItem();
    if (item) {
      console.log('Deleting selected item:', item.id, item.title);
      await this.historyService.deleteItem(item.id);
      console.log('Selected history item deleted');
      this.setView('history');
      console.log('Switched back to history view');
    } else {
      console.log('No selected history item to delete');
    }
  }

  /**
   * Copy history item to clipboard
   */
  async copyHistoryToClipboard(): Promise<void> {
    console.log('Copy history to clipboard requested');
    if (this.detailCopying()) {
      console.log('Already copying, skipping');
      return;
    }

    const item = this.selectedHistoryItem();
    if (!item?.summary) {
      console.log('No history item summary available to copy');
      return;
    }
    
    console.log('Copying history item to clipboard, length:', item.summary.length);

    this.detailCopying.set(true);
    this.detailCopySuccess.set(false);

    try {
      await navigator.clipboard.writeText(item.summary);
      console.log('Successfully copied history item to clipboard');
      this.detailCopySuccess.set(true);
      
      setTimeout(() => {
        this.detailCopySuccess.set(false);
        console.log('History copy success state reset');
      }, 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      this.detailCopying.set(false);
    } finally {
      this.detailCopying.set(false);
      console.log('History copy operation completed');
    }
  }

  /**
   * Clear all history
   */
  async clearAllHistory(): Promise<void> {
    console.log('Clear all history requested');
    await this.historyService.clearAll();
    console.log('All history cleared');
  }

  /**
   * Open options page
   */
  openOptions(): void {
    console.log('Open options page requested');
    if (typeof browser !== 'undefined') {
      console.log('Attempting to open options page via browser API');
      try {
        browser.runtime.openOptionsPage();
        console.log('Options page opened successfully');
      } catch (error) {
        console.error('Failed to open options page:', error);
      }
    } else {
      console.log('Cannot open options page: not in browser extension context');
    }
  }
}