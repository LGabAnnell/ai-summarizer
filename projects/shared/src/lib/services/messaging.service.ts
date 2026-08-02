/**
 * Messaging Service for extension communication
 * Provides a consistent interface for sending messages between extension components
 */

import { Injectable } from '@angular/core';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import * as browser from 'webextension-polyfill';
import { ExtensionSettings } from '../models/settings.model';
import { ArticleData } from '../models/article.model';
import {Message} from "../models/summary.model";

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
  
  constructor() {}

  /**
   * Send a message to the background script
   */
  sendMessage<T>(message: Message): Observable<MessageResponse<T>> {
    // Check if we're running in a browser extension context
    if (typeof browser === 'undefined') {
      console.error('MessagingService.sendMessage: Not running in a browser extension context');
      return throwError(() => new Error('Not running in a browser extension context'));
    }

    console.log('MessagingService.sendMessage: Sending message:', message.type, message);
    console.log('Message details:', JSON.stringify(message, null, 2));

    // Return an observable that wraps the message sending
    return from(browser.runtime.sendMessage(message)).pipe(
      map((response: unknown) => {
        console.log('MessagingService.sendMessage: Raw response received:', response);
        
        // Handle both direct responses and wrapped responses
        if (response && typeof response === 'object' && !Array.isArray(response)) {
          console.log('Response is object, processing...');
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
          
          console.log('Processed response:', result);
          return result;
        }
        console.error('Invalid response format, raw response:', response);
        return { type: 'UNKNOWN', success: false, error: 'Invalid response format' };
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
    console.log('MessagingService.extractAndSummarize: Called');
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
  getSettings(): Observable<MessageResponse<ExtensionSettings>> {
    console.log('MessagingService.getSettings: Called');
    return this.sendMessage<ExtensionSettings>({ type: 'GET_SETTINGS' });
  }

  /**
   * Save extension settings
   */
  saveSettings(settings: Partial<ExtensionSettings>): Observable<MessageResponse<void>> {
    console.log('MessagingService.saveSettings: Called with settings:', JSON.stringify(settings, null, 2));
    return this.sendMessage({ type: 'SAVE_SETTINGS', settings });
  }

  /**
   * Clear the summary cache
   */
  clearCache(): Observable<MessageResponse<{ cleared: number }>> {
    console.log('MessagingService.clearCache: Called');
    return this.sendMessage<{ cleared: number }>({ type: 'CLEAR_CACHE' });
  }

  /**
   * Summarize with specific article data
   */
  summarizeArticle(article: ArticleData, provider?: string): Observable<MessageResponse<{
    summary: string;
    cached: boolean;
    tokenCount?: number;
  }>> {
    console.log('MessagingService.summarizeArticle: Called with article data');
    console.log('Article data:', JSON.stringify(article, null, 2));
    console.log('Provider:', provider);
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
    console.log('MessagingService.testProvider: Called for provider:', provider);
    return this.sendMessage<{ valid: boolean }>({ 
      type: 'TEST_PROVIDER', 
      provider, 
      apiKey 
    });
  }

  /**
   * Refresh models for a specific provider
   */
  refreshModels(provider: string, apiKey: string): Observable<MessageResponse<{ models: string[] }>> {
    console.log('MessagingService.refreshModels: Called for provider:', provider);
    return this.sendMessage<{ models: string[] }>({ 
      type: 'REFRESH_MODELS', 
      provider, 
      apiKey 
    });
  }

  /**
   * Open the options page
   */
  openOptionsPage(): void {
    console.log('MessagingService.openOptionsPage: Called');
    if (typeof browser !== 'undefined') {
      try {
        browser.runtime.openOptionsPage();
        console.log('Options page opened');
      } catch (error) {
        console.error('Failed to open options page:', error);
      }
    } else {
      console.log('Cannot open options page: not in browser extension context');
    }
  }

  /**
   * Get the current tab
   */
  getCurrentTab(): Observable<browser.Tabs.Tab> {
    console.log('MessagingService.getCurrentTab: Called');
    if (typeof browser === 'undefined') {
      console.error('MessagingService.getCurrentTab: Not running in a browser extension context');
      return throwError(() => new Error('Not running in a browser extension context'));
    }

    return from(browser.tabs.query({ active: true, currentWindow: true })).pipe(
      map((tabs: browser.Tabs.Tab[]) => {
        console.log('MessagingService.getCurrentTab: Received tabs:', tabs.length);
        if (tabs.length === 0) {
          console.error('MessagingService.getCurrentTab: No active tab found');
          throw new Error('No active tab found');
        }
        console.log('MessagingService.getCurrentTab: Returning tab:', tabs[0].id, tabs[0].url);
        return tabs[0];
      }),
      catchError((error) => {
        console.error('MessagingService.getCurrentTab: Error getting current tab:', error);
        return throwError(() => error);
      })
    );
  }
}
