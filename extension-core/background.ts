/**
 * Background Service Worker for Article Summarizer Extension
 * Handles communication between popup, content scripts, and AI providers
 */
import browser from 'webextension-polyfill';
import {Message} from '@shared/lib/models/summary.model';
import {setupSidebarShortcut} from './sidebar-shortcut';
import {handleMessage} from './background/message-router';
import {setupMLProgressBroadcasting} from './background/ml-progress';

// Set up message listener
browser.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  handleMessage(request as Message)
    .then(response => sendResponse(response))
    .catch(error => sendResponse({
      type: 'ERROR_RESPONSE',
      error: `Unhandled error: ${error instanceof Error ? error.message : String(error)}`,
      success: false,
    }));

  // Return true to indicate we will send a response asynchronously
  return true;
});

setupMLProgressBroadcasting();

setupSidebarShortcut(browser);

console.log('Article Summarizer background service worker loaded');
