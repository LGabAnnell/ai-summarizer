import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MarkdownPipe } from '@shared/lib/pipes/markdown.pipe';
import browser from 'webextension-polyfill';
import {SummaryResult} from "@shared/lib/models/summary.model";
import {
  HeaderComponent,
  EmptyStateComponent,
  LoadingStateComponent,
  ErrorStateComponent,
  SummaryHeaderComponent,
  SummaryMetaComponent,
  FooterComponent,
  SummarizeButtonComponent
} from '@shared/public-api';

@Component({
  selector: 'popup-root',
  standalone: true,
  imports: [CommonModule, MarkdownPipe, HeaderComponent, EmptyStateComponent, LoadingStateComponent, ErrorStateComponent, SummaryHeaderComponent, SummaryMetaComponent, FooterComponent, SummarizeButtonComponent],
  template: `
    <div class="container">
      <shared-header></shared-header>
      
      <div class="main-content">
        @if (state() === 'idle') {
          <shared-empty-state
            icon="📰"
            title="Ready to summarize"
            message="Click the button below to summarize the current article">
          </shared-empty-state>
        }
        
        @if (state() === 'loading') {
          <shared-loading-state [message]="loadingMessage()"></shared-loading-state>
        }
        
        @if (state() === 'error') {
          <shared-error-state 
            [error]="errorMessage()" 
            [showRetry]="true" 
            [retryText]="'Retry'" 
            (retry)="retry()">
          </shared-error-state>
        }
        
        @if (state() === 'success' && summary()) {
          <div class="summary-view">
            <shared-summary-header
              [title]="title()"
              [showActions]="true"
              [showCopyButton]="true"
              [copying]="copying()"
              [copied]="copied()"
              [copyDisabled]="false"
              (copyClick)="copyToClipboard()">
            </shared-summary-header>
            <div class="summary-text markdown-content" [innerHTML]="summary() | markdown"></div>
            <shared-summary-meta
              [characterCount]="characterCount()"
              [cached]="cached()">
            </shared-summary-meta>
          </div>
        }
      </div>
      
      <shared-footer
        [showViewArticle]="state() === 'success' && !!articleUrl()"
        [articleUrl]="articleUrl()"
        [showClearHistory]="false"
        [historyCount]="0"
        (viewArticle)="viewArticle()"
        (clearHistory)="clearHistory()"
        (openSettings)="openOptions()">
      </shared-footer>
      
      <shared-summarize-button
        [loading]="state() === 'loading'"
        [disabled]="false"
        [text]="'Summarize Article'"
        [loadingText]="'Summarizing...'"
        (buttonClick)="summarize()">
      </shared-summarize-button>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    

  `],
})
export class AppComponent implements OnInit {
  // State management
  state = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  summary = signal<string>('');
  title = signal<string>('');
  articleUrl = signal<string>('');
  errorMessage = signal<string>('');
  loadingMessage = signal<string>('Extracting article...');
  cached = signal<boolean>(false);
  
  // Copy to clipboard state
  copying = signal<boolean>(false);
  copied = signal<boolean>(false);

  constructor() {}

  ngOnInit(): void {
    // Check if we're in a browser extension context
    if (typeof browser !== 'undefined') {
      // Listen for any messages that might be relevant
      browser.runtime.onMessage.addListener((message: unknown) => {
      });
    }
  }

  characterCount() {
    return this.summary().length;
  }

  /**
   * Trigger article summarization
   */
  async summarize(): Promise<void> {
    if (this.state() === 'loading') return;

    this.state.set('loading');
    this.loadingMessage.set('Extracting article...');
    this.errorMessage.set('');
    this.summary.set('');
    this.title.set('');
    this.articleUrl.set('');
    this.cached.set(false);

    try {
      // Check if we're in a browser extension context
      if (typeof browser === 'undefined') {
        throw new Error('Not running in a browser extension context');
      }

      // Send message to background script to extract and summarize
      const response = await browser.runtime.sendMessage({ 
        type: 'EXTRACT_AND_SUMMARIZE' 
      }) as SummaryResult & { success: boolean, error: string };

      if (response.success) {
        this.state.set('success');
        this.summary.set(response.summary || '');
        this.title.set(response.title || 'Article Summary');
        this.articleUrl.set(response.articleUrl || '');
        this.cached.set(response.cached || false);
      } else {
        throw new Error(response.error || 'Failed to summarize article');
      }
    } catch (error) {
      console.error('Summarization error:', error);
      this.state.set('error');
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to summarize article');
    }
  }

  /**
   * Retry summarization
   */
  retry(): void {
    this.summarize();
  }

  /**
   * Copy summary to clipboard
   */
  async copyToClipboard(): Promise<void> {
    if (this.copying()) return;

    const summary = this.summary();
    if (!summary) return;

    this.copying.set(true);
    this.copied.set(false);

    try {
      await navigator.clipboard.writeText(summary);
      this.copied.set(true);
      
      // Reset copied state after 2 seconds
      setTimeout(() => {
        this.copied.set(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      // Show error briefly
      setTimeout(() => {
        this.copying.set(false);
      }, 1000);
    } finally {
      this.copying.set(false);
    }
  }

  /**
   * View article
   */
  viewArticle(): void {
    // Implementation for viewing article
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    // Implementation for clearing history
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
