/**
 * Background Service Worker for Article Summarizer Extension
 * Handles communication between popup, content scripts, and AI providers
 */
import browser from 'webextension-polyfill';
import {Message} from '@shared/lib/models/summary.model';
import {handlePanelControl, isAuthorizedPanelSender, setupPanelController} from './panel/controller';
import {setupSidebarShortcut} from './sidebar-shortcut';
import {handleMessage} from './background/message-router';
import {setupMLProgressBroadcasting} from './background/ml-progress';

// Set up message listener
browser.runtime.onMessage.addListener(((request: unknown, sender: browser.Runtime.MessageSender, sendResponse: (response: unknown) => void): true | void => {
  const type = (request as {type?: string})?.type;
  if (type === 'PANEL_REOPEN' || type === 'PANEL_ERROR_VERIFY' || type === 'PANEL_ERROR_TAB') {
    void handlePanelControl(request, sender).then(sendResponse).catch(error => sendResponse({success: false, error: String(error)}));
    return true;
  }
  if (!isAuthorizedPanelSender(sender)) {
    sendResponse({success: false, error: 'Panel session is not authorized.'});
    return;
  }
  handleMessage(request as Message)
    .then(response => sendResponse(response))
    .catch(error => sendResponse({
      type: 'ERROR_RESPONSE',
      error: `Unhandled error: ${error instanceof Error ? error.message : String(error)}`,
      success: false,
    }));

  // Return true to indicate we will send a response asynchronously
  return true;
}) as browser.Runtime.OnMessageListener);

setupMLProgressBroadcasting();

setupSidebarShortcut(browser);
setupPanelController();

console.log('Article Summarizer background service worker loaded');
