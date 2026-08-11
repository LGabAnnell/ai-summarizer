import {Component, inject, signal, OnInit, OnDestroy, effect, computed, AfterViewInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {
  MarkdownPipe,
  SummaryService,
  MessagingService,
  SettingsService,
  HistoryService,
  ThemeService,
  SummaryState,
  SummaryResult,
  HistoryItem,
  ClassificationService,
  ClassificationResult,
  ClassificationState,
  MLSettings,
  HeaderComponent,
  EmptyStateComponent,
  LoadingStateComponent,
  ErrorStateComponent,
  SummaryHeaderComponent,
  SummaryMetaComponent,
  FooterComponent,
  SummarizeButtonComponent
} from '@shared/public-api';
import browser from "webextension-polyfill";

/**
 * View modes for the sidebar
 */
type ViewMode = 'current' | 'history' | 'history-detail';

@Component({
  selector: 'sidebar-root',
  standalone: true,
  imports: [CommonModule, MarkdownPipe, HeaderComponent, EmptyStateComponent, LoadingStateComponent, ErrorStateComponent, SummaryHeaderComponent, SummaryMetaComponent, FooterComponent, SummarizeButtonComponent],
  template: `
    <div class="container" [class.dark-theme]="themeService.isDarkTheme()">
      <shared-header
        [showThemeToggle]="true"
        [themeService]="themeService"
        (themeToggle)="toggleTheme()">
      </shared-header>

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
            <shared-empty-state
              icon="📰"
              title="Ready to summarize"
              message="Click the button below to summarize the current article">
            </shared-empty-state>
          }

          @if (summaryState().state === 'loading') {
            <shared-loading-state [message]="summaryState().loadingMessage || 'Processing...'"></shared-loading-state>
          }

          @if (summaryState().state === 'error') {
            <shared-error-state
              [error]="summaryState().error || 'Failed to summarize article'"
              [showRetry]="true"
              [retryText]="'Retry'"
              (retry)="retry()">
            </shared-error-state>
          }

          @if (summaryState().state === 'success' && currentSummary()) {
            <div class="summary-view">
              <shared-summary-header
                [title]="currentSummary()?.title || 'Article Summary'"
                [showActions]="true"
                [showCopyButton]="true"
                [copying]="copying()"
                [copied]="copySuccess()"
                [copyDisabled]="false"
                (copyClick)="copyToClipboard()">
                <button class="expand-btn" slot="additional-actions" (click)="addToHistory()" title="Save to history" [disabled]="isArticleInHistory()">
                  💾 Save
                </button>
              </shared-summary-header>
              <div class="summary-text markdown-content" [innerHTML]="currentSummary()?.summary | markdown"></div>
              <shared-summary-meta
                [characterCount]="characterCount()"
                [cached]="isCached()"
                [provider]="currentSummary()?.provider || ''"
                [model]="currentSummary()?.model || ''">
              </shared-summary-meta>
              <!-- NEW: Automatic classification display -->
              @if (classificationFromSummary()) {
                <div class="summary-classification">
                  <div class="classification-badge">
                    <span class="classification-label">{{ classificationFromSummary()?.label }}</span>
                    <span class="classification-confidence">{{ (classificationFromSummary()?.score || 0) * 100 | number:'1.0-0' }}%</span>
                  </div>
                </div>
              }
            </div>
          }
        }

        <!-- History List View -->
        @if (currentView() === 'history') {
          @if (historyItems().length === 0) {
            <shared-empty-state
              icon="📜"
              title="No history yet"
              message="Summarize articles to save them to your history">
            </shared-empty-state>
          } @else {
            <div class="history-list">
              @for (item of historyItems(); track item.id) {
                <div
                        class="history-item"
                        [class.history-item--selected]="selectedHistoryItem()?.id === item.id"
                        tabindex="0"
                        (click)="viewHistoryDetail(item)"
                        (keyup.enter)="viewHistoryDetail(item)"
                        (keyup.space)="viewHistoryDetail(item)">
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
          <button class="back-btn" (click)="setView('history')">
            ← Back to History
          </button>
          <shared-summary-header
            [title]="selectedHistoryItem()?.title || 'History Item'"
            [showActions]="true"
            [showCopyButton]="true"
            [copying]="detailCopying()"
            [copied]="detailCopySuccess()"
            [copyDisabled]="false"
            (copyClick)="copyHistoryToClipboard()">
            <button class="delete-btn" slot="additional-actions" (click)="deleteSelectedHistoryItem()" title="Delete">
              🗑️ Delete
            </button>
          </shared-summary-header>
          <div class="summary-text markdown-content" [innerHTML]="selectedHistoryItem()?.summary | markdown"></div>
          <shared-summary-meta
            [characterCount]="selectedHistoryItem()?.summary?.length || 0"
            [cached]="selectedHistoryItem()?.cached || false"
            [provider]="selectedHistoryItem()?.provider || ''"
            [model]="selectedHistoryItem()?.model || ''">
          </shared-summary-meta>
          <div class="summary-meta">
            <div class="meta-item">
              <span>📅 {{ formatDate(selectedHistoryItem()!.timestamp) }}</span>
            </div>
            @if (selectedHistoryItem()?.articleUrl) {
              <div class="meta-item">
                <span>🔗 <a [href]="selectedHistoryItem()?.articleUrl" target="_blank"
                           class="url-link">View Article</a></span>
              </div>
            }
          </div>
        }
      </div>

      <shared-footer
        [showViewArticle]="false"
        [articleUrl]="''"
        [showClearHistory]="historyService.getCount() > 0"
        [historyCount]="historyService.getCount()"
        (viewArticle)="viewArticle()"
        (clearHistory)="clearAllHistory()"
        (openSettings)="openOptions()">
      </shared-footer>

      <!-- Classification Section -->
      @if (isMLAvailable()) {
        <div class="classification-section">
          <div class="classification-header">
            <span>🤖</span>
            Local AI Classification
          </div>
          
          @if (classificationState().state === 'idle') {
            <button
                    class="btn btn--secondary btn--classification"
                    (click)="classifyArticle()"
                    [disabled]="!canClassify() || classificationState().state === 'loading'">
              @if (classificationState().state === 'loading') {
                <span class="spinner"></span>
                Classifying...
              } @else {
                Classify Article Content
              }
            </button>
            @if (classificationState().state === 'permission_required') {
              <div class="classification-hint">
                Enable ML in Options to use classification
              </div>
            }
            @if (classificationState().state === 'not_available') {
              <div class="classification-hint">
                Firefox ML API not available
              </div>
            }
          }
          
          @if (classificationState().state === 'loading') {
            <div class="classification-loading">
              <div class="spinner"></div>
              <div>Classifying article...</div>
              @if (classificationProgress() > 0) {
                <div class="classification-progress">
                  Downloading model: {{ classificationProgress() }}%
                </div>
              }
            </div>
          }
          
          @if (classificationState().state === 'success' && classificationResult()) {
            <div class="classification-result-card">
              <div class="classification-result-header">
                <span>Classification Result</span>
                <button class="close-btn" (click)="clearClassification()">×</button>
              </div>
              <div class="classification-result-content">
                <div class="classification-label">
                  {{ classificationResult()?.label || 'Unknown' }}
                </div>
                <div class="classification-score">
                  Confidence: {{ (classificationResult()?.score || 0) * 100 | number:'1.0-0' }}%
                </div>
                @if (classificationResult()?.inferenceTime) {
                  <div class="classification-time">
                    Processed in {{ classificationResult()?.inferenceTime }}ms
                  </div>
                }
              </div>
            </div>
          }
          
          @if (classificationState().state === 'error') {
            <div class="classification-error">
              <span class="error-icon">⚠️</span>
              <div class="error-message">{{ classificationState().error || 'Classification failed' }}</div>
              <button class="retry-btn" (click)="classifyArticle()">Retry</button>
            </div>
          }
        </div>
      }

      <shared-summarize-button
        [loading]="summaryState().state === 'loading'"
        [disabled]="false"
        [text]="'Summarize Current Article'"
        [loadingText]="'Summarizing...'"
        (buttonClick)="summarize()">
      </shared-summarize-button>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }



      .action-button {
        padding-top: 8px;
        padding-bottom: 8px;
      }

      /* Classification Styles */
      .classification-section {
        margin: 16px 0;
        padding: 12px;
        border-top: 1px solid var(--border-color, #e0e0e0);
        background: var(--bg-secondary, #f8f9fa);
        border-radius: 8px;
      }

      .classification-header {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        margin-bottom: 12px;
        font-size: 16px;
      }

      .btn--classification {
        width: 100%;
        margin-bottom: 8px;
      }

      .classification-hint {
        font-size: 12px;
        color: var(--text-muted, #6c757d);
        text-align: center;
        padding: 8px;
        background: var(--bg-primary, #fff);
        border-radius: 4px;
        margin-bottom: 8px;
      }

      .classification-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 16px;
        color: var(--text-muted, #6c757d);
      }

      .classification-progress {
        font-size: 12px;
        color: var(--text-muted, #6c757d);
        margin-top: 8px;
      }

      .classification-result-card {
        background: var(--bg-primary, #fff);
        border: 1px solid #d4edda;
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 12px;
      }

      .classification-result-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        font-weight: 600;
        color: #155724;
      }

      .close-btn {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 18px;
        color: var(--text-muted, #6c757d);
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .classification-result-content {
        text-align: center;
      }

      .classification-label {
        font-size: 20px;
        font-weight: bold;
        color: #155724;
        margin: 8px 0;
      }

      .classification-score {
        font-size: 14px;
        color: #28a745;
        margin: 4px 0;
      }

      .classification-time {
        font-size: 12px;
        color: var(--text-muted, #6c757d);
        margin: 4px 0;
      }

      .classification-error {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px;
        background: #f8d7da;
        border-radius: 8px;
        margin-bottom: 12px;
        color: #721c24;
      }

      .error-icon {
        font-size: 18px;
      }

      .retry-btn {
        margin-left: auto;
        background: #721c24;
        color: white;
        border: none;
        padding: 4px 8px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      }
      
      /* NEW: Automatic classification display styles */
      .summary-classification {
        margin-top: 12px;
        padding: 8px 0;
      }
      
      .classification-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        background: var(--bg-primary, #f0f0f0);
        border: 1px solid var(--border-color, #ddd);
        border-radius: 16px;
        font-size: 13px;
      }
      
      .classification-label {
        font-weight: 600;
        color: var(--text-primary, #333);
      }
      
      .classification-confidence {
        color: var(--text-muted, #666);
        font-size: 12px;
      }
    `
  ],
})
export class AppComponent implements OnInit, OnDestroy, AfterViewInit {
  // Services
  private summaryService = inject(SummaryService);
  private messagingService = inject(MessagingService);
  private settingsService = inject(SettingsService);
  private classificationService = inject(ClassificationService);
  public historyService = inject(HistoryService);
  public themeService = inject(ThemeService);

  // State signals
  currentView = signal<ViewMode>('current');
  summaryState = signal<SummaryState>({state: 'idle'});

  // Track last added summary to prevent infinite loop
  private lastAddedSummaryId = signal<string | null>(null);

  // Store message listener for cleanup
  private messageListener: ((message: unknown) => void) | null = null;

  // Classification state
  classificationState = signal<ClassificationState>({ state: 'idle' });
  classificationResult = signal<ClassificationResult | undefined>(undefined);
  classificationProgress = signal<number>(0);
  mlSettings = signal<MLSettings | undefined>(undefined);

  // Private variables for cleanup
  private classificationSubscription: { unsubscribe: () => void } | null = null;

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

  // NEW: Classification from summary (automatic classification result)
  classificationFromSummary = computed<ClassificationResult | undefined>(() => {
    const summary = this.currentSummary();
    return summary?.classification;
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

  isArticleInHistory = computed<boolean>(() => {
    const currentUrl = this.currentArticleUrl();
    if (!currentUrl) return false;
    const items = this.historyItems();
    return items.some(item => item.articleUrl === currentUrl);
  });

  // Classification computed properties
  isMLAvailable = computed<boolean>(() => {
    const mlSettings = this.mlSettings();
    return mlSettings?.mlEnabled === true;
  });

  canClassify = computed<boolean>(() => {
    const state = this.classificationState();
    return this.isMLAvailable() && state.state === 'idle';
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

    // Load ML settings on startup
    effect(() => {
      this.loadMLSettings();
      this.checkMLAvailability();
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
      this.messageListener = (message: unknown) => {
        console.log('Sidebar received message:', message);
        console.log('Message type:', message != null ? (message as { type: string })['type'] : null);
        console.log('Message data:', JSON.stringify(message, null, 2));
        // Handle any relevant messages
      };
      browser.runtime.onMessage.addListener(this.messageListener);
      console.log('Message listener registered successfully');
    } else {
      console.log('Not in browser extension context');
    }
  }

  ngAfterViewInit(): void {
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
    
    // Clean up classification progress listener
    this.cleanupClassificationProgressListener();
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
      return d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    }

    // Check if date is from yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }

    // For older dates, show date
    return d.toLocaleDateString([], {month: 'short', day: 'numeric'});
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
   * View article
   */
  viewArticle(): void {
    // Implementation for viewing article
    console.log('View article clicked');
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

  // ============================================================================
  // ML Classification Methods
  // ============================================================================

  /**
   * Load ML settings
   */
  loadMLSettings(): void {
    const mlSettings = this.settingsService.getMLSettings();
    this.mlSettings.set(mlSettings);
    console.log('Sidebar: ML settings loaded:', mlSettings);
  }

  /**
   * Check ML availability
   */
  checkMLAvailability(): void {
    console.log('Sidebar: Checking ML availability...');
    
    this.classificationService.checkMLAvailability().subscribe({
      next: (result) => {
        console.log('Sidebar: ML availability result:', result);
        
        if (result.available) {
          this.classificationState.set({ state: 'idle' });
        } else if (!result.apiAvailable) {
          this.classificationState.set({ state: 'not_available' });
        } else if (!result.permissionGranted) {
          this.classificationState.set({ state: 'permission_required' });
        } else {
          this.classificationState.set({ state: 'idle' });
        }
      },
      error: (error) => {
        console.error('Sidebar: Error checking ML availability:', error);
        this.classificationState.set({ state: 'not_available', error: 'API not available' });
      }
    });
  }

  /**
   * Classify the current article
   */
  classifyArticle(): void {
    console.log('Sidebar: Classifying article...');
    
    const currentSummary = this.currentSummary();
    if (!currentSummary?.summary) {
      console.log('Sidebar: No article content to classify');
      this.classificationState.set({ state: 'error', error: 'No article content available' });
      return;
    }

    this.classificationState.set({ state: 'loading' });
    this.classificationResult.set(undefined);

    // Use the article text for classification
    const articleText = currentSummary.summary;
    
    // Set up progress listener
    this.setupClassificationProgressListener();

    this.classificationService.classifyText(articleText).subscribe({
      next: (result) => {
        console.log('Sidebar: Classification result:', result);
        
        this.classificationState.set({
          state: result.ok ? 'success' : 'error',
          result,
          error: result.ok ? undefined : result.error,
        });
        
        if (result.ok) {
          this.classificationResult.set(result);
        } else {
          this.classificationResult.set(undefined);
        }

        // Clean up progress listener
        this.cleanupClassificationProgressListener();
      },
      error: (error) => {
        console.error('Sidebar: Classification error:', error);
        this.classificationState.set({ 
          state: 'error', 
          error: error instanceof Error ? error.message : 'Classification failed' 
        });
        this.classificationResult.set(undefined);
        this.cleanupClassificationProgressListener();
      }
    });
  }

  /**
   * Set up classification progress listener
   */
  setupClassificationProgressListener(): void {
    this.cleanupClassificationProgressListener();
    
    this.classificationSubscription = this.classificationService.onModelDownloadProgress().subscribe({
      next: (progress) => {
        console.log('Sidebar: Classification progress:', progress);
        this.classificationProgress.set(progress.progress);
        
        if (progress.status === 'complete') {
          // Progress is complete, don't reset yet as classification might still be running
          console.log('Sidebar: Model download complete');
        }
      },
      error: (error) => {
        console.error('Sidebar: Progress listener error:', error);
      }
    });
  }

  /**
   * Clean up classification progress listener
   */
  cleanupClassificationProgressListener(): void {
    if (this.classificationSubscription) {
      this.classificationSubscription.unsubscribe();
      this.classificationSubscription = null;
    }
    this.classificationProgress.set(0);
  }

  /**
   * Clear classification result
   */
  clearClassification(): void {
    this.classificationState.set({ state: 'idle' });
    this.classificationResult.set(undefined);
    this.classificationProgress.set(0);
  }

  /**
   * Clean up on destroy
   */
}