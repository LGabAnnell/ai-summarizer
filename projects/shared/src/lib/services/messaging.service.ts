/**
 * Messaging Service for extension communication
 * Provides a consistent interface for sending messages between extension components
 */

import { Injectable } from '@angular/core';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import * as browser from 'webextension-polyfill';

// Message types
export interface Message {
  type: string;
  [key: string]: any;
}

export interface MessageResponse<T = any> {
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
  
  constructor() {}

  /**
   * Send a message to the background script
   */
  sendMessage<T>(message: Message): Observable<MessageResponse<T>> {
    // Check if we're running in a browser extension context
    if (typeof browser === 'undefined') {
      return throwError(() => new Error('Not running in a browser extension context'));
    }

    // Return an observable that wraps the message sending
    return from(browser.runtime.sendMessage(message)).pipe(
      map((response: any) => {
        // Handle both direct responses and wrapped responses
        if (response && typeof response === 'object') {
          return {
            type: response.type || message.type + '_RESPONSE',
            success: response.success !== false, // Default to true if not specified
            data: response.data,
            error: response.error,
          } as MessageResponse<T>;
        }
        return { type: 'UNKNOWN', success: false, error: 'Invalid response format' };
      }),
      catchError((error) => {
        console.error('Message sending failed:', error);
        return of({ 
          type: message.type + '_RESPONSE', 
          success: false, 
          error: error instanceof Error ? error.message : 'Failed to send message' 
        });
      })
    );
  }

  /**
   * Send message and get a typed response
   */
  sendMessageTyped<T, R>(message: Message & { type: T }): Observable<MessageResponse<R>> {
    return this.sendMessage<R>(message);
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
    }>({ type: 'EXTRACT_AND_SUMMARIZE' });
  }

  /**
   * Get extension settings
   */
  getSettings(): Observable<MessageResponse<any>> {
    return this.sendMessage({ type: 'GET_SETTINGS' });
  }

  /**
   * Save extension settings
   */
  saveSettings(settings: any): Observable<MessageResponse<void>> {
    return this.sendMessage({ type: 'SAVE_SETTINGS', settings });
  }

  /**
   * Clear the summary cache
   */
  clearCache(): Observable<MessageResponse<{ cleared: number }>> {
    return this.sendMessage<{ cleared: number }>({ type: 'CLEAR_CACHE' });
  }

  /**
   * Summarize with specific article data
   */
  summarizeArticle(article: any, provider?: string): Observable<MessageResponse<{
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
   * Open the options page
   */
  openOptionsPage(): void {
    if (typeof browser !== 'undefined') {
      browser.runtime.openOptionsPage();
    }
  }

  /**
   * Get the current tab
   */
  getCurrentTab(): Observable<browser.Tabs.Tab> {
    if (typeof browser === 'undefined') {
      return throwError(() => new Error('Not running in a browser extension context'));
    }

    return from(browser.tabs.query({ active: true, currentWindow: true })).pipe(
      map((tabs: browser.Tabs.Tab[]) => {
        if (tabs.length === 0) {
          throw new Error('No active tab found');
        }
        return tabs[0];
      })
    );
  }
}
