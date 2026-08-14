/**
 * Classification Service for frontend
 * Provides a thin client that wraps messaging to background script
 * NO direct dependency on browser.trial.ml - all ML complexity isolated to background
 */

import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError, from } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import * as browser from 'webextension-polyfill';
import { MessagingService } from './messaging.service';
import { ExtensionSettings } from '../models/settings.model';
import {
  ClassificationResult,
  MLSettings,
  ModelDownloadProgress,
  ModelDownloadProgressMessage
} from '../models/classification.model';

/**
 * Service for ML text classification
 * All ML complexity is handled in the background script
 */
@Injectable({
  providedIn: 'root'
})
export class ClassificationService {
  private messagingService = inject(MessagingService);

  constructor() {}

  /**
   * Classify text using ML
   * @param text The text to classify
   * @param modelId Optional specific model ID to use
   * @param timeout Optional timeout in milliseconds
   */
  classifyText(
    text: string,
    modelId?: string,
    timeout?: number
  ): Observable<ClassificationResult> {
    
    if (typeof browser === 'undefined') {
      console.error('ClassificationService.classifyText: Not running in browser extension context');
      return throwError(() => new Error('Not running in browser extension context'));
    }

    return this.messagingService.sendMessage<ClassificationResult>({
      type: 'CLASSIFY_TEXT',
      text,
      modelId,
      timeout
    }).pipe(
      map(response => {
        
        // Extract data from response
        let classificationData: ClassificationResult;
        if (response.data && typeof response.data === 'object') {
          classificationData = response.data as ClassificationResult;
        } else {
          classificationData = response as unknown as ClassificationResult;
        }
        
        // Ensure we have the expected structure
        if (classificationData && typeof classificationData === 'object') {
          return {
            ok: classificationData.ok || false,
            label: classificationData.label,
            score: classificationData.score,
            error: classificationData.error,
            modelId: classificationData.modelId,
            inferenceTime: classificationData.inferenceTime,
          };
        }
        
        console.error('ClassificationService.classifyText: Invalid response format:', response);
        return {
          ok: false,
          error: 'Invalid response format from classification',
        };
      }),
      catchError((error) => {
        console.error('ClassificationService.classifyText: Error:', error);
        return of({
          ok: false,
          error: error instanceof Error ? error.message : 'Classification failed',
        });
      })
    );
  }

  /**
   * Request ML permission from user - MUST be called from a user gesture context (e.g., button click)
   * This calls browser.permissions.request() directly in the UI context, then notifies the background script
   * 
   * NOTE: This method should be called directly from a user gesture context (button click handler).
   * For the Options page, use the requestMLPermission() method which handles this properly.
   */
  requestMLPermissionFromUserGesture(): Observable<{ granted: boolean; error?: string }> {
    
    if (typeof browser === 'undefined' || typeof browser.permissions === 'undefined') {
      console.error('ClassificationService.requestMLPermissionFromUserGesture: browser.permissions API not available');
      return of({
        granted: false,
        error: 'browser.permissions API not available - this must be called from extension UI context'
      });
    }

    // Call browser.permissions.request() directly - this must be synchronous from user gesture
    // We wrap it in from() to make it an Observable
    return from(
      browser.permissions.request({ permissions: ['trialML'] })
    ).pipe(
      mergeMap((granted: boolean) => {
        
        if (granted) {
          // Notify background script that permission was granted
          return this.messagingService.notifyMLPermissionGranted().pipe(
            map(() => ({
              granted: true,
              error: undefined
            })),
            catchError((error) => {
              console.error('ClassificationService.requestMLPermissionFromUserGesture: Failed to notify background:', error);
              // Even if notification fails, permission was granted
              return of({
                granted: true,
                error: 'Permission granted but failed to sync with background'
              });
            })
          );
        } else {
          // User denied permission
          return of({
            granted: false,
            error: 'User denied permission'
          });
        }
      }),
      catchError((error) => {
        console.error('ClassificationService.requestMLPermissionFromUserGesture: Error:', error);
        return of({
          granted: false,
          error: error instanceof Error ? error.message : 'Permission request failed'
        });
      })
    );
  }

  /**
   * Check current ML permission status
   */
  getMLPermissionStatus(): Observable<boolean> {
    
    if (typeof browser === 'undefined') {
      console.error('ClassificationService.getMLPermissionStatus: Not running in browser extension context');
      return throwError(() => new Error('Not running in browser extension context'));
    }

    return this.messagingService.sendMessage<{ granted: boolean }>({
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
        console.error('ClassificationService.getMLPermissionStatus: Error:', error);
        return of(false);
      })
    );
  }

  /**
   * Check if ML is available (API available and permission granted)
   */
  checkMLAvailability(): Observable<{ 
    available: boolean; 
    apiAvailable: boolean; 
    permissionGranted: boolean; 
  }> {
    
    if (typeof browser === 'undefined') {
      console.error('ClassificationService.checkMLAvailability: Not running in browser extension context');
      return throwError(() => new Error('Not running in browser extension context'));
    }

    return this.messagingService.sendMessage<{ 
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
        console.error('ClassificationService.checkMLAvailability: Error:', error);
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
    
    if (typeof browser === 'undefined') {
      console.error('ClassificationService.clearMLCache: Not running in browser extension context');
      return throwError(() => new Error('Not running in browser extension context'));
    }

    return this.messagingService.sendMessage<{ success: boolean; error?: string }>({
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
        console.error('ClassificationService.clearMLCache: Error:', error);
        return of({
          success: false,
          error: error instanceof Error ? error.message : 'Cache clear failed',
        });
      })
    );
  }

  /**
   * Get ML settings from extension settings
   */
  getMLSettings(): Observable<MLSettings> {
    
    return this.messagingService.getSettings().pipe(
      map(response => {
        const settingsData = response.data as ExtensionSettings || {} as ExtensionSettings;
        const mlSettings: MLSettings = {
          mlEnabled: settingsData.mlEnabled === true,
          mlModelHub: settingsData.mlModelHub === 'mozilla' || settingsData.mlModelHub === 'huggingface' 
            ? settingsData.mlModelHub 
            : 'mozilla',
          mlModelId: settingsData.mlModelId || 'distilbert-base-uncased-finetuned-sst-2-english',
        };
        return mlSettings;
      }),
      catchError((error) => {
        console.error('ClassificationService.getMLSettings: Error:', error);
        const defaultSettings: MLSettings = {
          mlEnabled: false,
          mlModelHub: 'mozilla',
          mlModelId: 'distilbert-base-uncased-finetuned-sst-2-english',
        };
        return of(defaultSettings);
      })
    );
  }

  /**
   * Save ML settings
   */
  saveMLSettings(settings: Partial<MLSettings>): Observable<void> {
    
    return this.messagingService.saveSettings(settings).pipe(
      mergeMap(response => {
        if (!response.success) {
          console.error('ClassificationService.saveMLSettings: Save failed:', response.error);
          return throwError(() => new Error(response.error || 'Failed to save ML settings'));
        }
        return of(void 0);
      })
    );
  }

  /**
   * Check if ML is enabled
   */
  isMLEnabled(): Observable<boolean> {
    return this.getMLSettings().pipe(
      map(settings => settings.mlEnabled === true)
    );
  }

  /**
   * Enable ML classification
   */
  enableML(): Observable<void> {
    return this.saveMLSettings({ mlEnabled: true });
  }

  /**
   * Disable ML classification
   */
  disableML(): Observable<void> {
    return this.saveMLSettings({ mlEnabled: false });
  }

  /**
   * Get model download progress as observable
   * This listens for broadcast messages from the background script
   */
  onModelDownloadProgress(): Observable<ModelDownloadProgress> {
    
    if (typeof browser === 'undefined') {
      console.error('ClassificationService.onModelDownloadProgress: Not running in browser extension context');
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
   * Classify article text (convenience method)
   * @param articleText The article text to classify
   */
  classifyArticle(articleText: string): Observable<ClassificationResult> {
    
    // Truncate very long articles for classification
    const maxLength = 10000;
    const text = articleText.length > maxLength 
      ? articleText.substring(0, maxLength) + '...' 
      : articleText;

    return this.classifyText(text);
  }
}
