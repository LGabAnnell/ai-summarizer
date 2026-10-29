import {ClassifyTextRequest} from '@shared/lib/models/classification.model';
import {ClassificationResult, textClassifierService} from '../ml/text-classifier.service';
import {mlPermissionService} from '../ml/ml-permission.service';
import {getSettings} from './settings';

// ============================================================================
// ML Classification Message Handlers
// ============================================================================

/**
 * Handle CLASSIFY_TEXT request
 */
export async function handleClassifyText(request: ClassifyTextRequest): Promise<{
  type: string;
  success: boolean;
  data?: ClassificationResult;
  error?: string;
}> {
  try {
    console.log('Background: Handling CLASSIFY_TEXT request');

    // Check if ML is enabled in settings
    const settings = await getSettings();
    if (settings.mlEnabled === false) {
      console.log('Background: ML is disabled in settings');
      return {
        type: 'CLASSIFY_RESULT',
        success: false,
        data: {
          ok: false,
          error: 'ML classification is disabled. Enable in Options page.',
        },
      };
    }

    // Use ML service for classification
    const result = await textClassifierService.classifyText(
      request.text,
      {
        modelId: request.modelId,
        timeout: request.timeout,
        modelHub: settings.mlModelHub,
      },
    );

    console.log('Background: Classification result:', result);
    return {
      type: 'CLASSIFY_RESULT',
      success: true,
      data: result,
    };
  } catch (error) {
    console.error('Background: Classification failed:', error);
    return {
      type: 'CLASSIFY_RESULT',
      success: false,
      data: {
        ok: false,
        error: `Classification error: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

/**
 * Handle GET_ML_PERMISSION_STATUS request
 */
export async function handleGetMLPermissionStatus(): Promise<{
  type: string;
  success: boolean;
  data?: { granted: boolean };
  error?: string
}> {
  try {
    const granted = await mlPermissionService.checkPermission();
    console.log('Background: ML permission status:', granted);
    return {
      type: 'ML_PERMISSION_STATUS',
      success: true,
      data: {granted},
    };
  } catch (error) {
    console.error('Background: Error checking ML permission:', error);
    return {
      type: 'ML_PERMISSION_STATUS',
      success: false,
      data: {granted: false},
      error: error instanceof Error ? error.message : 'Error checking ML permission',
    };
  }
}

/**
 * Handle NOTIFY_ML_PERMISSION_GRANTED notification
 * This is called from the UI after the user has granted permission via browser.permissions.request()
 */
export async function handleNotifyMLPermissionGranted(): Promise<{ type: string; success: boolean; error?: string }> {
  try {
    console.log('Background.handleNotifyMLPermissionGranted: Received NOTIFY_ML_PERMISSION_GRANTED message');
    console.log('Background.handleNotifyMLPermissionGranted: Calling mlPermissionService.notifyPermissionGranted()');

    // Update the cached permission state in the background script
    mlPermissionService.notifyPermissionGranted();

    console.log('Background: ML permission notification processed successfully');
    return {
      type: 'NOTIFY_ML_PERMISSION_GRANTED_RESPONSE',
      success: true,
    };
  } catch (error) {
    console.error('Background: Error processing ML permission notification:', error);
    return {
      type: 'NOTIFY_ML_PERMISSION_GRANTED_RESPONSE',
      success: false,
      error: `Notification processing failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Handle CLEAR_ML_CACHE request
 */
export async function handleClearMLCache(): Promise<{
  type: string;
  success: boolean;
  data?: { success: boolean; error?: string };
  error?: string;
}> {
  try {
    console.log('Background: Clearing ML model cache...');
    const result = await textClassifierService.clearCache();

    if (result.success) {
      console.log('Background: ML cache cleared successfully');
      return {
        type: 'CLEAR_ML_CACHE_RESPONSE',
        success: true,
        data: {success: true},
      };
    } else {
      console.log('Background: ML cache clear failed:', result.error);
      return {
        type: 'CLEAR_ML_CACHE_RESPONSE',
        success: false,
        data: {success: false, error: result.error},
      };
    }
  } catch (error) {
    console.error('Background: Error clearing ML cache:', error);
    return {
      type: 'CLEAR_ML_CACHE_RESPONSE',
      success: false,
      data: {
        success: false,
        error: `Cache clear failed: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

/**
 * Handle CHECK_ML_AVAILABILITY request
 */
export async function handleCheckMLAvailability(): Promise<{
  type: string;
  success: boolean;
  data?: { available: boolean; apiAvailable: boolean; permissionGranted: boolean };
  error?: string;
}> {
  try {
    const apiAvailable = mlPermissionService.isAPIAvailable();
    const permissionGranted = await mlPermissionService.checkPermission();
    const available = apiAvailable && permissionGranted;

    console.log('Background: ML availability check:', {
      apiAvailable,
      permissionGranted,
      available,
    });

    return {
      type: 'ML_AVAILABILITY_RESPONSE',
      success: true,
      data: {
        available,
        apiAvailable,
        permissionGranted,
      },
    };
  } catch (error) {
    console.error('Background: Error checking ML availability:', error);
    return {
      type: 'ML_AVAILABILITY_RESPONSE',
      success: false,
      data: {
        available: false,
        apiAvailable: false,
        permissionGranted: false,
      },
      error: error instanceof Error ? error.message : 'Error checking ML availability',
    };
  }
}
