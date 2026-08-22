/**
 * Messaging Service for extension communication
 * Provides a consistent interface for sending messages between extension components
 */

import {Injectable} from '@angular/core';
import {from, Observable, of, throwError} from 'rxjs';
import {catchError, map} from 'rxjs/operators';

import * as browser from 'webextension-polyfill';
import {ExtensionSettings, ProviderType} from '../models/settings.model';
import {ArticleData} from '../models/article.model';
import {Message, ThemeChangedMessage} from "../models/summary.model";
import {
  ClassificationResult,
  ModelDownloadProgress,
  ModelDownloadProgressMessage
} from "../models/classification.model";
import {Theme} from "../models/theme.model";

export interface MessageResponse<T = unknown> {
  type: string;
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Service for handling extension messaging
 * Works in both popup/options pages and content scripts
 */
@Injectable({
  providedIn: 'root'
})
export class MessagingService {

  constructor() {
  }

  /**
   * Send a message to the background script
   */
  sendMessage<T>(message: Message): Observable<MessageResponse<T>> {
    // Check if we're running in a browser extension context
    if (typeof browser === 'undefined') {
      console.error('MessagingService.sendMessage: Not running in a browser extension context');
      return throwError(() => new Error('Not running in a browser extension context'));
    }


    // Return an observable that wraps the message sending
    return from(browser.runtime.sendMessage(message)).pipe(
      map((response: unknown) => {

        // Handle both direct responses and wrapped responses
        if (response && typeof response === 'object' && !Array.isArray(response)) {
          // If response has a data property, use it. Otherwise, the response itself is the data
          // (excluding standard message fields)
          const responseObj = response as Record<string, unknown>;
          const standardFields = ['type', 'success', 'error', 'data'];
          const hasExplicitData = responseObj['data'] !== undefined;

          // Collect all non-standard fields as the actual data
          const responseData: Record<string, unknown> = {};
          for (const key in responseObj) {
            if (!standardFields.includes(key)) {
              responseData[key] = responseObj[key];
            }
          }

          const data = hasExplicitData ? responseObj['data'] : (Object.keys(responseData).length > 0 ? responseData : undefined);

          const result = {
            type: responseObj['type'] || message.type + '_RESPONSE',
            success: responseObj['success'] !== false, // Default to true if not specified
            data: data as T,
            error: responseObj['error'],
          } as MessageResponse<T>;

          return result;
        }
        console.error('Invalid response format, raw response:', response);
        return {type: 'UNKNOWN', success: false, error: 'Invalid response format'};
      }),
      catchError((error) => {
        console.error('Message sending failed:', error);
        console.error('Error details:', error instanceof Error ? error.message : JSON.stringify(error));
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace available');
        return of({
          type: message.type + '_RESPONSE',
          success: false,
          error: error instanceof Error ? error.message : 'Failed to send message'
        });
      })
    );
  }

  /**
   * Request article extraction and summarization
   */
  extractAndSummarize(): Observable<MessageResponse<{
    summary: string;
    title: string;
    articleUrl: string;
    cached: boolean;
  }>> {
    return this.sendMessage<{
      summary: string;
      title: string;
      articleUrl: string;
      cached: boolean;
    }>({type: 'EXTRACT_AND_SUMMARIZE'});
  }

  /**
   * Get extension settings
   */
  getSettings(): Observable<MessageResponse<ExtensionSettings>> {
    return this.sendMessage<ExtensionSettings>({type: 'GET_SETTINGS'});
  }

  /**
   * Save extension settings
   */
  saveSettings(settings: Partial<ExtensionSettings>): Observable<MessageResponse<void>> {
    return this.sendMessage({type: 'SAVE_SETTINGS', settings});
  }

  /**
   * Clear the summary cache
   */
  clearCache(): Observable<MessageResponse<{ cleared: number }>> {
    return this.sendMessage<{ cleared: number }>({type: 'CLEAR_CACHE'});
  }

  /**
   * Notify the background script of a theme change so it can broadcast it
   * to all extension contexts (popup, options, sidebar).
   */
  setTheme(theme: Theme): Observable<MessageResponse<void>> {
    return this.sendMessage({type: 'SET_THEME', theme});
  }

  /**
   * Summarize with specific article data
   */
  summarizeArticle(article: ArticleData, provider?: ProviderType): Observable<MessageResponse<{
    summary: string;
    cached: boolean;
    tokenCount?: number;
  }>> {
    return this.sendMessage({
      type: 'SUMMARIZE',
      article,
      provider
    });
  }

  /**
   * Test a provider connection
   */
  testProvider(provider: string, apiKey: string): Observable<MessageResponse<{ valid: boolean }>> {
    return this.sendMessage<{ valid: boolean }>({
      type: 'TEST_PROVIDER',
      provider,
      apiKey
    });
  }

  /**
   * Refresh models for a specific provider
   */
  refreshModels(provider: ProviderType, apiKey: string): Observable<MessageResponse<{ models: string[] }>> {
    return this.sendMessage<{ models: string[] }>({
      type: 'REFRESH_MODELS',
      provider,
      apiKey
    });
  }

  // ============================================================================
  // ML Classification Methods
  // ============================================================================

  /**
   * Classify text using ML
   */
  classifyText(text: string, modelId?: string, timeout?: number): Observable<ClassificationResult> {
    return this.sendMessage<ClassificationResult>({
      type: 'CLASSIFY_TEXT',
      text,
      modelId,
      timeout
    }).pipe(
      map(response => {
        // Handle both direct response and wrapped response formats
        let classificationData: ClassificationResult;
        if (response.data && typeof response.data === 'object') {
          classificationData = response.data as ClassificationResult;
        } else {
          classificationData = response as unknown as ClassificationResult;
        }
        return {
          ok: classificationData.ok || false,
          label: classificationData.label,
          score: classificationData.score,
          error: classificationData.error,
          modelId: classificationData.modelId,
          inferenceTime: classificationData.inferenceTime,
        };
      }),
      catchError((error) => {
        console.error('MessagingService.classifyText: Error:', error);
        return of({
          ok: false,
          error: error instanceof Error ? error.message : 'Classification failed',
        });
      })
    );
  }

  /**
   * Notify background script that ML permission has been granted
   * This is called from the UI after the user has granted permission via browser.permissions.request()
   */
  notifyMLPermissionGranted(): Observable<{ success: boolean; error?: string }> {
    return this.sendMessage<{ success: boolean; error?: string }>({
      type: 'NOTIFY_ML_PERMISSION_GRANTED'
    }).pipe(
      map(response => {
        let result: { success: boolean; error?: string };
        if (response.data && typeof response.data === 'object') {
          result = response.data as { success: boolean; error?: string };
        } else {
          result = response as unknown as { success: boolean; error?: string };
        }
        return {
          success: result.success || false,
          error: result.error,
        };
      }),
      catchError((error) => {
        console.error('MessagingService.notifyMLPermissionGranted: Error:', error);
        return of({
          success: false,
          error: error instanceof Error ? error.message : 'Notification failed',
        });
      })
    );
  }

  /**
   * Check ML permission status
   */
  getMLPermissionStatus(): Observable<boolean> {
    return this.sendMessage<{ granted: boolean }>({
      type: 'GET_ML_PERMISSION_STATUS'
    }).pipe(
      map(response => {
        let result: { granted: boolean };
        if (response.data && typeof response.data === 'object') {
          result = response.data as { granted: boolean };
        } else {
          result = response as unknown as { granted: boolean };
        }
        return result.granted || false;
      }),
      catchError((error) => {
        console.error('MessagingService.getMLPermissionStatus: Error:', error);
        return of(false);
      })
    );
  }

  /**
   * Check if ML is available
   */
  checkMLAvailability(): Observable<{
    available: boolean;
    apiAvailable: boolean;
    permissionGranted: boolean;
  }> {
    return this.sendMessage<{
      available: boolean;
      apiAvailable: boolean;
      permissionGranted: boolean;
    }>({
      type: 'CHECK_ML_AVAILABILITY'
    }).pipe(
      map(response => {
        let result: { available: boolean; apiAvailable: boolean; permissionGranted: boolean };
        if (response.data && typeof response.data === 'object') {
          result = response.data as { available: boolean; apiAvailable: boolean; permissionGranted: boolean };
        } else {
          result = response as unknown as { available: boolean; apiAvailable: boolean; permissionGranted: boolean };
        }
        return {
          available: result.available || false,
          apiAvailable: result.apiAvailable || false,
          permissionGranted: result.permissionGranted || false,
        };
      }),
      catchError((error) => {
        console.error('MessagingService.checkMLAvailability: Error:', error);
        return of({
          available: false,
          apiAvailable: false,
          permissionGranted: false,
        });
      })
    );
  }

  /**
   * Clear ML model cache
   */
  clearMLCache(): Observable<{ success: boolean; error?: string }> {
    return this.sendMessage<{ success: boolean; error?: string }>({
      type: 'CLEAR_ML_CACHE'
    }).pipe(
      map(response => {
        let result: { success: boolean; error?: string };
        if (response.data && typeof response.data === 'object') {
          result = response.data as { success: boolean; error?: string };
        } else {
          result = response as unknown as { success: boolean; error?: string };
        }
        return {
          success: result.success || false,
          error: result.error,
        };
      }),
      catchError((error) => {
        console.error('MessagingService.clearMLCache: Error:', error);
        return of({
          success: false,
          error: error instanceof Error ? error.message : 'Cache clear failed',
        });
      })
    );
  }

  /**
   * Get model download progress as observable
   */
  onModelDownloadProgress(): Observable<ModelDownloadProgress> {

    if (typeof browser === 'undefined') {
      console.error('MessagingService.onModelDownloadProgress: Not running in browser extension context');
      return throwError(() => new Error('Not running in browser extension context'));
    }

    // Return an observable that listens for progress messages
    return new Observable<ModelDownloadProgress>(subscriber => {
      const listener = (message: unknown) => {

        const progressMessage = message as ModelDownloadProgressMessage;
        if (progressMessage && progressMessage.type === 'MODEL_DOWNLOAD_PROGRESS') {
          const progress: ModelDownloadProgress = {
            progress: progressMessage.progress || 0,
            modelId: progressMessage.modelId || 'unknown',
            status: progressMessage.status || 'downloading',
            message: progressMessage.message,
          };
          subscriber.next(progress);
        }
      };

      // Add listener
      browser.runtime.onMessage.addListener(listener);

      // Cleanup on unsubscribe
      return () => {
        browser.runtime.onMessage.removeListener(listener);
      };
    });
  }

  /**
   * Listen for theme-change broadcasts originated by the background script
   * in response to a SET_THEME message from any extension context.
   */
  onThemeChanged(): Observable<Theme> {
    if (typeof browser === 'undefined') {
      console.error('MessagingService.onThemeChanged: Not running in browser extension context');
      return throwError(() => new Error('Not running in browser extension context'));
    }

    return new Observable<Theme>(subscriber => {
      const listener = (message: unknown) => {
        const themeMessage = message as ThemeChangedMessage;
        if (themeMessage && themeMessage.type === 'THEME_CHANGED') {
          subscriber.next(themeMessage.theme);
        }
      };

      browser.runtime.onMessage.addListener(listener);

      return () => {
        browser.runtime.onMessage.removeListener(listener);
      };
    });
  }
}
