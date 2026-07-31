/**
 * Summary Service for managing article summarization
 */

import { Injectable, signal } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { MessagingService } from './messaging.service';
import { SettingsService } from './settings.service';
import {
  ArticleData,
  SummaryResult,
  SummaryState, 
  SummaryRequest 
} from '../../public-api';

@Injectable({
  providedIn: 'root'
})
export class SummaryService {
  // State
  private _state = signal<SummaryState>({
    state: 'idle',
  });

  private _article = signal<ArticleData | null>(null);
  private _copyState = signal<{ copying: boolean; copied: boolean }>({ copying: false, copied: false });

  // Public readonly signals
  readonly state = this._state.asReadonly();
  readonly article = this._article.asReadonly();
  readonly copyState = this._copyState.asReadonly();

  constructor(
    private messaging: MessagingService,
    private settings: SettingsService
  ) {}

  /**
   * Extract and summarize the current article
   */
  extractAndSummarize(): Observable<SummaryResult> {
    this._state.set({ state: 'loading', loadingMessage: 'Extracting article...' });
    this._article.set(null);
    this.resetCopyState();

    return this.messaging.extractAndSummarize().pipe(
      switchMap((response) => {
        if (response.success && response.data) {
          const result: SummaryResult = {
            summary: response.data.summary,
            cached: response.data.cached || false,
            timestamp: new Date(),
            title: response.data.title,
            articleUrl: response.data.articleUrl,
          };
          
          // Save article data if available
          // Note: In the current implementation, article data is handled by the background script
          // We might need to adjust this based on the actual message flow
          
          this._state.set({ state: 'success', summary: result });
          return of(result);
        } else {
          const error = response.error || 'Failed to summarize article';
          this._state.set({ state: 'error', error });
          return throwError(() => new Error(error));
        }
      }),
      catchError((error) => {
        const errorMessage = error instanceof Error ? error.message : 'Failed to summarize article';
        this._state.set({ state: 'error', error: errorMessage });
        return throwError(() => error);
      })
    );
  }

  /**
   * Summarize with specific article data
   */
  summarize(article: ArticleData): Observable<SummaryResult> {
    this._state.set({ state: 'loading', loadingMessage: 'Summarizing...' });
    this._article.set(article);
    this.resetCopyState();

    const settings = this.settings.settings();
    
    return this.messaging.summarizeArticle(article, settings.provider).pipe(
      switchMap((response) => {
        if (response.success && response.data) {
          const result: SummaryResult = {
            summary: response.data.summary,
            cached: response.data.cached || false,
            tokenCount: response.data.tokenCount,
            timestamp: new Date(),
            provider: settings.provider,
            model: settings.model,
          };
          
          this._state.set({ state: 'success', summary: result });
          return of(result);
        } else {
          const error = response.error || 'Failed to summarize article';
          this._state.set({ state: 'error', error });
          return throwError(() => new Error(error));
        }
      }),
      catchError((error) => {
        const errorMessage = error instanceof Error ? error.message : 'Failed to summarize article';
        this._state.set({ state: 'error', error: errorMessage });
        return throwError(() => error);
      })
    );
  }

  /**
   * Copy summary to clipboard
   */
  async copyToClipboard(): Promise<boolean> {
    const currentState = this._state();
    
    if (currentState.state !== 'success' || !currentState.summary) {
      return false;
    }

    this._copyState.set({ copying: true, copied: false });

    try {
      await navigator.clipboard.writeText(currentState.summary.summary);
      this._copyState.set({ copying: false, copied: true });
      
      // Reset copied state after 2 seconds
      setTimeout(() => {
        this.resetCopyState();
      }, 2000);
      
      return true;
    } catch (error) {
      this._copyState.set({ copying: false, copied: false });
      return false;
    }
  }

  /**
   * Reset the copy state
   */
  resetCopyState(): void {
    this._copyState.set({ copying: false, copied: false });
  }

  /**
   * Get the current summary
   */
  getCurrentSummary(): string | undefined {
    const currentState = this._state();
    return currentState.state === 'success' ? currentState.summary?.summary : undefined;
  }

  /**
   * Get the current title
   */
  getCurrentTitle(): string | undefined {
    const currentState = this._state();
    return currentState.state === 'success' ? currentState.summary?.title : undefined;
  }

  /**
   * Get the current article URL
   */
  getCurrentArticleUrl(): string | undefined {
    const currentState = this._state();
    return currentState.state === 'success' ? currentState.summary?.articleUrl : undefined;
  }

  /**
   * Check if current summary is cached
   */
  isCached(): boolean {
    const currentState = this._state();
    return currentState.state === 'success' ? currentState.summary?.cached || false : false;
  }

  /**
   * Clear the current state
   */
  clear(): void {
    this._state.set({ state: 'idle' });
    this._article.set(null);
    this.resetCopyState();
  }

  /**
   * Check if currently loading
   */
  isLoading(): boolean {
    return this._state().state === 'loading';
  }

  /**
   * Check if in error state
   */
  isError(): boolean {
    return this._state().state === 'error';
  }

  /**
   * Check if in success state
   */
  isSuccess(): boolean {
    return this._state().state === 'success';
  }

  /**
   * Get the current error message
   */
  getErrorMessage(): string | undefined {
    return this._state().error;
  }

  /**
   * Get the current loading message
   */
  getLoadingMessage(): string | undefined {
    return this._state().loadingMessage;
  }
}
