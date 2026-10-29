import browser from 'webextension-polyfill';

// Set up ML progress event broadcasting
// This sends progress events to all connected front-ends (popup, sidebar, options)
export function setupMLProgressBroadcasting(): void {
  try {
    console.log('Background: Setting up ML progress event broadcasting');

    browser.trial.ml.onProgress.addListener((progressEvent: { [p: string]: unknown }) => {
      console.log('Background: ML progress event received:', progressEvent);

      const pEvent = progressEvent as {
        progress: number;
        modelId?: string;
        status?: string;
        message?: string;
      };

      // Broadcast progress to all connected front-ends
      const progressMessage = {
        type: 'MODEL_DOWNLOAD_PROGRESS',
        progress: Math.round(pEvent.progress * 100) || 0,
        modelId: pEvent.modelId ?? 'unknown',
        status: pEvent.status ?? 'downloading',
        message: pEvent.message,
      };

      // Send to all tabs that might be listening
      browser.tabs.query({}).then(tabs => {
        tabs.forEach(tab => {
          if (tab.id) {
            browser.tabs.sendMessage(tab.id, progressMessage).catch(() => {
              // Ignore errors - tab might not have our content script
            });
          }
        });
      });
    });

    console.log('Background: ML progress broadcasting enabled');
  } catch (error) {
    console.error('Background: Error setting up ML progress broadcasting:', error);
  }
}
