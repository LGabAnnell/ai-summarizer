/**
 * ML Module for Firefox's built-in AI runtime (browser.trial.ml)
 * Provides local text classification capabilities
 */

export {MLPermissionService, MLPermissionState} from './ml-permission.service';
export {MLEngineManager} from './ml-engine-manager';
export {TextClassifierService} from './text-classifier.service';
export {
  ClassificationResult,
  MLConfig,
  ModelDownloadProgressEvent,
  ML_ERRORS,
} from './text-classifier.service';
