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
      this.summaryState.set(state);
      
      // Auto-add to history when a new summary is generated
      if (state.state === 'success' && state.summary) {
        this.historyService.addSummary(state.summary);
      }
    });
  }

  ngOnInit(): void {
    // Get current state from summary service
    const currentState = this.summaryService.state();
    this.summaryState.set(currentState);

    // Check if we're in a browser extension context
    if (typeof browser !== 'undefined') {
      this.messageListener = (message: any) => {
        console.log('Sidebar received message:', message);
        // Handle any relevant messages
      };
      browser.runtime.onMessage.addListener(this.messageListener);
    }
  }

  ngOnDestroy(): void {
    // Clean up message listener to prevent memory leaks
    if (this.messageListener && typeof browser !== 'undefined') {
      browser.runtime.onMessage.removeListener(this.messageListener);
      this.messageListener = null;
    }
  }

  /**
   * Set the current view
   */
  setView(view: ViewMode): void {
    this.currentView.set(view);
    
    // Clear copy states when switching views
    if (view !== 'history-detail') {
      this.detailCopying.set(false);
      this.detailCopySuccess.set(false);
    }
    
    if (view !== 'current') {
      this.copying.set(false);
      this.copySuccess.set(false);
    }
  }

  /**
   * Toggle theme between light and dark
   */
  toggleTheme(): void {
    const current = this.themeService.getTheme();
    const newTheme = current === 'light' ? 'dark' : 'light';
    this.themeService.setTheme(newTheme);
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
    const state = this.summaryState();
    if (state.state === 'loading') return;

    this.summaryService.extractAndSummarize().subscribe({
      next: (result) => {
        console.log('Summarization result:', result);
      },
      error: (error) => {
        console.error('Summarization error:', error);
      }
    });
  }

  /**
   * Retry summarization
   */
  retry(): void {
    this.summarize();
  }

  /**
   * Copy current summary to clipboard
   */
  async copyToClipboard(): Promise<void> {
    if (this.copying()) return;

    const summary = this.currentSummary();
    if (!summary?.summary) return;

    this.copying.set(true);
    this.copySuccess.set(false);

    try {
      await navigator.clipboard.writeText(summary.summary);
      this.copySuccess.set(true);
      
      setTimeout(() => {
        this.copySuccess.set(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      this.copying.set(false);
    } finally {
      this.copying.set(false);
    }
  }

  /**
   * Add current summary to history
   */
  async addToHistory(): Promise<void> {
    const summary = this.currentSummary();
    if (summary) {
      await this.historyService.addSummary(summary);
      // Switch to history view
      this.setView('history');
    }
  }

  /**
   * View history detail
   */
  viewHistoryDetail(item: HistoryItem): void {
    this.historyService.selectItem(item);
    this.setView('history-detail');
  }

  /**
   * Delete a history item
   */
  async deleteHistoryItem(event: Event, id: string): Promise<void> {
    event.stopPropagation(); // Prevent triggering the click on the item
    await this.historyService.deleteItem(id);
  }

  /**
   * Delete the selected history item
   */
  async deleteSelectedHistoryItem(): Promise<void> {
    const item = this.selectedHistoryItem();
    if (item) {
      await this.historyService.deleteItem(item.id);
      this.setView('history');
    }
  }

  /**
   * Copy history item to clipboard
   */
  async copyHistoryToClipboard(): Promise<void> {
    if (this.detailCopying()) return;

    const item = this.selectedHistoryItem();
    if (!item?.summary) return;

    this.detailCopying.set(true);
    this.detailCopySuccess.set(false);

    try {
      await navigator.clipboard.writeText(item.summary);
      this.detailCopySuccess.set(true);
      
      setTimeout(() => {
        this.detailCopySuccess.set(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      this.detailCopying.set(false);
    } finally {
      this.detailCopying.set(false);
    }
  }

  /**
   * Clear all history
   */
  async clearAllHistory(): Promise<void> {
    await this.historyService.clearAll();
  }

  /**
   * Open options page
   */
  openOptions(): void {
    if (typeof browser !== 'undefined') {
      browser.runtime.openOptionsPage();
    }
  }
}