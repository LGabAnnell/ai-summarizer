/**
 * Summary Service for managing article summarization
 */

import { Injectable, inject, signal } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { MessagingService, MessageResponse } from './messaging.service';
import { SettingsService } from './settings.service';
import {
  ArticleData,
  SummaryResult,
  SummaryState
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

  private messaging = inject(MessagingService);
  private settings = inject(SettingsService);

  constructor() {}

  /**
   * Extract data from response, handling both wrapped (data property) and unwrapped formats
   */
  private extractResponseData<T>(response: MessageResponse<T>): T {
    return response.data !== undefined ? response.data : (response as unknown as T);
  }

  /**
   * Extract and summarize the current article
   */
  extractAndSummarize(): Observable<SummaryResult> {
    console.log('SummaryService.extractAndSummarize: Called');
    this._state.set({ state: 'loading', loadingMessage: 'Extracting article...' });
    console.log('State set to loading with message: Extracting article...');
    this._article.set(null);
    this.resetCopyState();

    return this.messaging.extractAndSummarize().pipe(
      switchMap((response) => {
        console.log('SummaryService.extractAndSummarize: Response received:', response);
        if (response.success) {
          console.log('Response successful, extracting data...');
          // Extract data, handling both wrapped and unwrapped response formats
          const data = this.extractResponseData<{
            summary: string;
            title: string;
            articleUrl: string;
            cached: boolean;
            classification?: {
              label?: string;
              score?: number;
              modelId?: string;
              inferenceTime?: number;
              error?: string;
            };
          }>(response);
          
          const result: SummaryResult = {
            summary: data.summary,
            cached: data.cached || false,
            timestamp: new Date(),
            title: data.title,
            articleUrl: data.articleUrl,
            // NEW: Include classification if present
            classification: data.classification ? {
              ok: true,
              label: data.classification.label,
              score: data.classification.score,
              modelId: data.classification.modelId,
              inferenceTime: data.classification.inferenceTime,
              error: data.classification.error,
            } : undefined,
          };
          
          console.log('Summary result created:', result.title, 'length:', result.summary.length);
          this._state.set({ state: 'success', summary: result });
          console.log('State set to success');
          return of(result);
        } else {
          const error = response.error || 'Failed to summarize article';
          console.error('SummaryService.extractAndSummarize: Response error:', error);
          this._state.set({ state: 'error', error });
          console.log('State set to error:', error);
          return throwError(() => new Error(error));
        }
      }),
      catchError((error) => {
        const errorMessage = error instanceof Error ? error.message : 'Failed to summarize article';
        console.error('SummaryService.extractAndSummarize: Caught error:', errorMessage);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        this._state.set({ state: 'error', error: errorMessage });
        console.log('State set to error:', errorMessage);
        return throwError(() => error);
      })
    );
  }

  /**
   * Summarize with specific article data
   */
  summarize(article: ArticleData): Observable<SummaryResult> {
    console.log('SummaryService.summarize: Called with article data');
    console.log('Article data:', JSON.stringify(article, null, 2));
    
    this._state.set({ state: 'loading', loadingMessage: 'Summarizing...' });
    console.log('State set to loading with message: Summarizing...');
    this._article.set(article);
    this.resetCopyState();

    const settings = this.settings.settings();
    console.log('Using settings:', settings.provider, settings.model);
    
    return this.messaging.summarizeArticle(article, settings.provider).pipe(
      switchMap((response) => {
        console.log('SummaryService.summarize: Response received:', response);
        if (response.success) {
          console.log('Response successful, extracting data...');
          // Extract data, handling both wrapped and unwrapped response formats
          const data = this.extractResponseData<{
            summary: string;
            cached: boolean;
            tokenCount?: number;
            classification?: {
              label?: string;
              score?: number;
              modelId?: string;
              inferenceTime?: number;
              error?: string;
            };
          }>(response);
          
          const result: SummaryResult = {
            summary: data.summary,
            cached: data.cached || false,
            tokenCount: data.tokenCount,
            timestamp: new Date(),
            provider: settings.provider,
            model: settings.model,
            // NEW: Include classification if present
            classification: data.classification ? {
              ok: true,
              label: data.classification.label,
              score: data.classification.score,
              modelId: data.classification.modelId,
              inferenceTime: data.classification.inferenceTime,
              error: data.classification.error,
            } : undefined,
          };
          
          console.log('Summary result created:', result.provider, result.model, 'length:', result.summary.length);
          this._state.set({ state: 'success', summary: result });
          console.log('State set to success');
          return of(result);
        } else {
          const error = response.error || 'Failed to summarize article';
          console.error('SummaryService.summarize: Response error:', error);
          this._state.set({ state: 'error', error });
          console.log('State set to error:', error);
          return throwError(() => new Error(error));
        }
      }),
      catchError((error) => {
        const errorMessage = error instanceof Error ? error.message : 'Failed to summarize article';
        console.error('SummaryService.summarize: Caught error:', errorMessage);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        this._state.set({ state: 'error', error: errorMessage });
        console.log('State set to error:', errorMessage);
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
    } catch /* (error) */ {
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
