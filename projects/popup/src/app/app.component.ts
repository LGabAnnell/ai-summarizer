import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MarkdownPipe } from '@shared/lib/pipes/markdown.pipe';

// Declare browser API for Firefox extensions
declare const browser: any;

@Component({
  selector: 'popup-root',
  standalone: true,
  imports: [CommonModule, MarkdownPipe],
  template: `
    <div class="container">
      <div class="header">
        <div class="logo">
          <div class="icon">AS</div>
          <span>Article Summarizer</span>
        </div>
      </div>
      
      <div class="main-content">
        @if (state() === 'idle') {
          <div class="empty-state">
            <div class="empty-icon">📰</div>
            <div class="empty-title">Ready to summarize</div>
            <div class="empty-message">Click the button below to summarize the current article</div>
          </div>
        }
        
        @if (state() === 'loading') {
          <div class="loading-state">
            <div class="loading-spinner"></div>
            <div class="loading-text">{{ loadingMessage() }}</div>
          </div>
        }
        
        @if (state() === 'error') {
          <div class="error-state">
            <div class="error-icon">⚠️</div>
            <div class="error-title">Error</div>
            <div class="error-message">{{ errorMessage() }}</div>
            <button class="btn btn--primary" (click)="retry()">Retry</button>
          </div>
        }
        
        @if (state() === 'success' && summary()) {
          <div class="summary-view">
            <div class="summary-header">
              <div class="summary-title">{{ title() }}</div>
              <button class="copy-btn" (click)="copyToClipboard()" [disabled]="copying()">
                @if (copying()) {
                  <span class="spinner"></span>
                  Copying...
                } @else if (copied()) {
                  ✓ Copied!
                } @else {
                  Copy
                }
              </button>
            </div>
            <div class="summary-text markdown-content" [innerHTML]="summary() | markdown"></div>
            <div class="summary-meta">
              <span>{{ characterCount() }} characters</span>
              @if (cached()) {
                <span class="cached-badge">Cached</span>
              }
            </div>
          </div>
        }
      </div>
      
      <div class="footer">
        <div class="footer-left">
          @if (state() === 'success' && articleUrl()) {
            <a [href]="articleUrl()" target="_blank" class="settings-link">View article</a>
          }
        </div>
        <div class="footer-right">
          <a class="settings-link" (click)="openOptions()">Settings</a>
        </div>
      </div>
      
      <button 
        class="btn btn--primary btn--full-width"
        (click)="summarize()"
        [disabled]="state() === 'loading'">
        @if (state() === 'loading') {
          <span class="spinner"></span>
          Summarizing...
        } @else {
          Summarize Article
        }
      </button>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    
    button.btn--full-width {
      margin-top: 12px;
      margin-bottom: 12px;
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
      browser.runtime.onMessage.addListener((message: any) => {
        console.log('Popup received message:', message);
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
      });

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
   * Open options page
   */
  openOptions(): void {
    if (typeof browser !== 'undefined') {
      browser.runtime.openOptionsPage();
    }
  }
}
