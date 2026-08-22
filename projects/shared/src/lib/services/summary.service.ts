/**
 * Summary Service for managing article summarization
 */

import {inject, Injectable, signal} from '@angular/core';
import {Observable, of, throwError} from 'rxjs';
import {catchError, switchMap} from 'rxjs/operators';
import {MessageResponse, MessagingService} from './messaging.service';
import {SettingsService} from './settings.service';
import {ArticleData, SummaryResult, SummaryState} from '../../public-api';

@Injectable({
  providedIn: 'root'
})
export class SummaryService {
  // State
  private _state = signal<SummaryState>({
    state: 'idle',
  });
  // Public readonly signals
  readonly state = this._state.asReadonly();
  private _article = signal<ArticleData | null>(null);
  readonly article = this._article.asReadonly();
  private _copyState = signal<{ copying: boolean; copied: boolean }>({copying: false, copied: false});
  private messaging = inject(MessagingService);
  private settings = inject(SettingsService);

  constructor() {
  }

  /**
   * Extract and summarize the current article
   */
  extractAndSummarize(): Observable<SummaryResult> {
    this._state.set({state: 'loading', loadingMessage: 'Extracting article...'});
    this._article.set(null);
    this.resetCopyState();

    return this.messaging.extractAndSummarize().pipe(
      switchMap((response) => {
        if (response.success) {
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

          this._state.set({state: 'success', summary: result});
          return of(result);
        } else {
          const error = response.error || 'Failed to summarize article';
          console.error('SummaryService.extractAndSummarize: Response error:', error);
          this._state.set({state: 'error', error});
          return throwError(() => new Error(error));
        }
      }),
      catchError((error) => {
        const errorMessage = error instanceof Error ? error.message : 'Failed to summarize article';
        console.error('SummaryService.extractAndSummarize: Caught error:', errorMessage);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        this._state.set({state: 'error', error: errorMessage});
        return throwError(() => error);
      })
    );
  }

  /**
   * Summarize with specific article data
   */
  summarize(article: ArticleData): Observable<SummaryResult> {

    this._state.set({state: 'loading', loadingMessage: 'Summarizing...'});
    this._article.set(article);
    this.resetCopyState();

    const settings = this.settings.settings();

    return this.messaging.summarizeArticle(article, settings.provider).pipe(
      switchMap((response) => {
        if (response.success) {
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

          this._state.set({state: 'success', summary: result});
          return of(result);
        } else {
          const error = response.error || 'Failed to summarize article';
          console.error('SummaryService.summarize: Response error:', error);
          this._state.set({state: 'error', error});
          return throwError(() => new Error(error));
        }
      }),
      catchError((error) => {
        const errorMessage = error instanceof Error ? error.message : 'Failed to summarize article';
        console.error('SummaryService.summarize: Caught error:', errorMessage);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        this._state.set({state: 'error', error: errorMessage});
        return throwError(() => error);
      })
    );
  }

  /**
   * Reset the copy state
   */
  resetCopyState(): void {
    this._copyState.set({copying: false, copied: false});
  }

  /**
   * Extract data from response, handling both wrapped (data property) and unwrapped formats
   */
  private extractResponseData<T>(response: MessageResponse<T>): T {
    return response.data !== undefined ? response.data : (response as unknown as T);
  }
}
