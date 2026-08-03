/**
 * Models for ML text classification functionality
 */

/**
 * Request to classify text
 */
export interface ClassifyTextRequest {
  type: 'CLASSIFY_TEXT';
  text: string;
  modelId?: string;
  timeout?: number;
}

/**
 * Response from classification request
 */
export interface ClassifyTextResponse {
  type: 'CLASSIFY_RESULT';
  ok: boolean;
  label?: string;
  score?: number;
  error?: string;
  modelId?: string;
  inferenceTime?: number;
}

/**
 * Progress notification for model download
 */
export interface ModelDownloadProgressMessage {
  type: 'MODEL_DOWNLOAD_PROGRESS';
  progress: number; // 0-100
  modelId: string;
  status: 'downloading' | 'extracting' | 'complete' | 'error';
  message?: string;
}

/**
 * Request to check ML permission status
 */
export interface GetMLPermissionStatusRequest {
  type: 'GET_ML_PERMISSION_STATUS';
}

/**
 * Response with ML permission status
 */
export interface MLPermissionStatusResponse {
  type: 'ML_PERMISSION_STATUS';
  granted: boolean;
}

/**
 * Notification that ML permission has been granted (sent from UI to background after user gesture)
 */
export interface NotifyMLPermissionGrantedRequest {
  type: 'NOTIFY_ML_PERMISSION_GRANTED';
}

/**
 * Response to permission granted notification
 */
export interface NotifyMLPermissionGrantedResponse {
  type: 'NOTIFY_ML_PERMISSION_GRANTED_RESPONSE';
  success: boolean;
  error?: string;
}

/**
 * Request to clear ML model cache
 */
export interface ClearMLCacheRequest {
  type: 'CLEAR_ML_CACHE';
}

/**
 * Response from ML cache clear request
 */
export interface ClearMLCacheResponse {
  type: 'CLEAR_ML_CACHE_RESPONSE';
  success: boolean;
  error?: string;
}

/**
 * Request to check if ML is available
 */
export interface CheckMLAvailabilityRequest {
  type: 'CHECK_ML_AVAILABILITY';
}

/**
 * Response from ML availability check
 */
export interface MLAvailabilityResponse {
  type: 'ML_AVAILABILITY_RESPONSE';
  available: boolean;
  apiAvailable: boolean;
  permissionGranted: boolean;
}

/**
 * ML-specific settings
 */
export interface MLSettings {
  /** Enable/disable ML classification (default: false) */
  mlEnabled?: boolean;
  /** Model hub to use (default: 'mozilla') */
  mlModelHub?: 'mozilla' | 'huggingface';
  /** Specific model ID for text-classification */
  mlModelId?: string;
}

/**
 * Classification result (frontend-friendly)
 */
export interface ClassificationResult {
  ok: boolean;
  label?: string;
  score?: number;
  error?: string;
  modelId?: string;
  inferenceTime?: number;
}

/**
 * Classification state for UI
 */
export interface ClassificationState {
  state: 'idle' | 'loading' | 'success' | 'error' | 'not_available' | 'permission_required';
  result?: ClassificationResult;
  error?: string;
  progress?: number; // 0-100 for model download
  modelId?: string;
}

/**
 * Progress event for model download (frontend)
 */
export interface ModelDownloadProgress {
  progress: number; // 0-100
  modelId: string;
  status: 'downloading' | 'extracting' | 'complete' | 'error';
  message?: string;
}

// Add ML message types to the existing Message union
export type MLMessage =
  | ClassifyTextRequest
  | GetMLPermissionStatusRequest
  | NotifyMLPermissionGrantedRequest
  | ClearMLCacheRequest
  | CheckMLAvailabilityRequest;

// Add ML response types
export type MLMessageResponse =
  | ClassifyTextResponse
  | MLPermissionStatusResponse
  | NotifyMLPermissionGrantedResponse
  | ClearMLCacheResponse
  | MLAvailabilityResponse
  | ModelDownloadProgressMessage;
