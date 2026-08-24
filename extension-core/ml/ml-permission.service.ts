/**
 * ML Permission Service
 * Handles permission checking and requesting for Firefox's trial.ml API
 * All ML code isolated to background script context
 */

import browser from 'webextension-polyfill';

/**
 * Permission state for ML features
 */
export interface MLPermissionState {
  granted: boolean;
  checked: boolean;
  lastCheckedAt?: number;
}

/**
 * Service for managing ML permissions
 * Uses browser.permissions API to check and request trialML permission
 */
export class MLPermissionService {
  private static instance: MLPermissionService | null = null;
  private state: MLPermissionState = {
    granted: false,
    checked: false,
    lastCheckedAt: undefined,
  };

  /**
   * Singleton instance
   */
  public static getInstance(): MLPermissionService {
    MLPermissionService.instance ??= new MLPermissionService();
    return MLPermissionService.instance;
  }

  /**
   * Check if trialML permission is granted
   * Caches result to avoid repeated API calls
   */
  async checkPermission(): Promise<boolean> {
    console.log('MLPermissionService.checkPermission: Checking ML permission status');
    // Return cached result if we've checked recently (within 1 minute)
    const now = Date.now();
    if (this.state.checked && this.state.lastCheckedAt &&
      (now - this.state.lastCheckedAt) < 60000) {
      console.log('MLPermissionService.checkPermission: Returning cached permission state:', this.state.granted);
      return this.state.granted;
    }

    try {
      // Check if browser.permissions is available (should be in background script)
      if (typeof browser.permissions === 'undefined') {
        console.log('MLPermissionService.checkPermission: browser.permissions API not available');
        this.state = {granted: false, checked: true, lastCheckedAt: now};
        return false;
      }

      console.log('MLPermissionService.checkPermission: Calling browser.permissions.contains({ permissions: ["trialML"] })');
      // Check if trialML permission is granted
      const hasPermission = await browser.permissions.contains({
        permissions: ['trialML'],
      });

      console.log('MLPermissionService.checkPermission: Permission check result:', hasPermission);
      this.state = {
        granted: hasPermission,
        checked: true,
        lastCheckedAt: now,
      };

      return hasPermission;
    } catch (error) {
      console.error('MLPermissionService: Error checking permission:', error);
      // If there's an error (e.g., API not available), assume not granted
      this.state = {granted: false, checked: true, lastCheckedAt: now};
      return false;
    }
  }

  /**
   * Notify that ML permission has been granted (call this from UI after user grants permission)
   * This updates the cached state without making a new permission request
   */
  notifyPermissionGranted(): void {
    console.log('MLPermissionService.notifyPermissionGranted: Updating cached state to granted');
    this.state = {
      granted: true,
      checked: true,
      lastCheckedAt: Date.now(),
    };
  }

  /**
   * Get current permission state
   */
  getState(): MLPermissionState {
    return {...this.state};
  }

  /**
   * Check if the trialML API is available in the current browser
   */
  isAPIAvailable(): boolean {
    // Check if browser.trial and browser.trial.ml exist
    const hasTrialAPI = typeof browser.trial !== 'undefined';
    const hasMLAPI = hasTrialAPI && typeof browser.trial.ml !== 'undefined';

    console.log('MLPermissionService.isAPIAvailable: trial API available:', hasTrialAPI, '| trial.ml available:', hasMLAPI);
    return hasMLAPI;
  }

  /**
   * Reset cached permission state (useful for testing or after permission changes)
   */
  resetState(): void {
    this.state = {
      granted: false,
      checked: false,
      lastCheckedAt: undefined,
    };
    console.log('MLPermissionService: State reset');
  }
}

// Export singleton instance
export const mlPermissionService = MLPermissionService.getInstance();
