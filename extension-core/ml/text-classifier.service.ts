/**
 * Text Classifier Service
 * Provides high-level text classification interface using Firefox's ML runtime
 * All ML code isolated to background script context
 */

import {MLEngineConfig, mlEngineManager} from './ml-engine-manager';
import {mlPermissionService} from './ml-permission.service';

/**
 * Result of text classification
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
 * Configuration for ML-based classification
 */
export interface MLConfig {
  /** Enable/disable ML classification (default: false) */
  mlEnabled?: boolean;
  /** Model hub to use (default: 'mozilla') */
  mlModelHub?: 'mozilla' | 'huggingface';
  /** Specific model ID for text-classification */
  mlModelId?: string;
  /** Timeout for classification in milliseconds (default: 30000) */
  mlTimeout?: number;
  /** Maximum text length for classification (default: 10000) */
  maxTextLength?: number;
}

/**
 * Progress event for model download
 */
export interface ModelDownloadProgressEvent {
  progress: number; // 0-100
  modelId: string;
  status: 'downloading' | 'extracting' | 'complete' | 'error';
  message?: string;
}

/**
 * Error constants for ML classification
 */
export const ML_ERRORS = {
  NOT_AVAILABLE: 'ML_API_NOT_AVAILABLE',
  PERMISSION_DENIED: 'ML_PERMISSION_DENIED',
  ENGINE_CREATION_FAILED: 'ML_ENGINE_CREATION_FAILED',
  CLASSIFICATION_FAILED: 'ML_CLASSIFICATION_FAILED',
  INVALID_INPUT: 'ML_INVALID_INPUT',
  TEXT_TOO_LONG: 'ML_TEXT_TOO_LONG',
  EMPTY_TEXT: 'ML_EMPTY_TEXT',
  TIMEOUT: 'ML_CLASSIFICATION_TIMEOUT',
  UNKNOWN_ERROR: 'ML_UNKNOWN_ERROR',
};

/**
 * Service for text classification using Firefox's ML runtime
 * Provides input validation, error handling, and consistent result formatting
 */
export class TextClassifierService {
  private static instance: TextClassifierService | null = null;

  /**
   * Singleton instance
   */
  public static getInstance(): TextClassifierService {
    TextClassifierService.instance ??= new TextClassifierService();
    return TextClassifierService.instance;
  }

  /**
   * Classify text using Firefox's ML runtime
   * Handles input validation, permission checking, and error handling
   */
  async classifyText(
    text: string,
    config?: Partial<MLEngineConfig & { timeout?: number }>,
  ): Promise<ClassificationResult> {
    const startTime = Date.now();

    try {
      // Input validation
      const validationError = this.validateInput(text);
      if (validationError) {
        console.log('TextClassifierService: Input validation failed:', validationError);
        return {
          ok: false,
          error: validationError,
        };
      }

      // Truncate text if too long
      const truncatedText = this.truncateText(text, config?.maxTextLength ?? 10000);

      // Check API availability
      if (!mlPermissionService.isAPIAvailable()) {
        console.log('TextClassifierService: ML API not available');
        return {
          ok: false,
          error: 'Firefox ML API (browser.trial.ml) is not available. Requires Firefox Nightly or Beta with extensions.ml.enabled=true',
        };
      }

      // Check permission
      const hasPermission = await mlPermissionService.checkPermission();
      if (!hasPermission) {
        console.log('TextClassifierService: Permission not granted');
        return {
          ok: false,
          error: 'ML permission not granted. Please enable in Options and grant permission when prompted.',
        };
      }

      const result = await mlEngineManager.runEngine(
        truncatedText,
        config?.timeout ?? 30000,
      );

      // Parse and normalize the result
      const classificationResult = this.parseResult(result, {
        modelId: config?.modelId,
        inferenceTime: Date.now() - startTime,
      });

      console.log('TextClassifierService: Classification completed:', classificationResult);
      return classificationResult;
    } catch (error) {
      console.error('TextClassifierService: Classification failed:', error);
      return this.normalizeError(error, Date.now() - startTime);
    }
  }

  /**
   * Clear ML model cache
   */
  async clearCache(): Promise<{ success: boolean; error?: string }> {
    try {
      await mlEngineManager.clearModelCache();
      return {success: true};
    } catch (error) {
      console.error('TextClassifierService: Error clearing cache:', error);
      return {
        success: false,
        error: this.getErrorMessage(error),
      };
    }
  }

  /**
   * Get model download progress
   * Returns current progress and registers callback for future updates
   */
  onModelDownloadProgress(
    callback: (event: ModelDownloadProgressEvent) => void,
  ): void {
    mlEngineManager.onProgress((event) => {
      const progressEvent: ModelDownloadProgressEvent = {
        progress: event.progress,
        modelId: event.modelId,
        status: event.status,
        message: event.message,
      };
      callback(progressEvent);
    });
  }

  /**
   * Remove progress callback
   */
  offModelDownloadProgress(
    callback: (event: ModelDownloadProgressEvent) => void,
  ): void {
    mlEngineManager.offProgress((event) => {
      const progressEvent: ModelDownloadProgressEvent = {
        progress: event.progress,
        modelId: event.modelId,
        status: event.status,
        message: event.message,
      };
      callback(progressEvent);
    });
  }

  /**
   * Get current ML configuration
   */
  getConfig(): MLEngineConfig {
    return mlEngineManager.getDefaultConfig();
  }

  /**
   * Set ML configuration
   */
  setConfig(config: Partial<MLEngineConfig>): void {
    mlEngineManager.setConfig(config);
  }

  /**
   * Reset service state (for testing)
   */
  async reset(): Promise<void> {
    await mlEngineManager.reset();
    mlPermissionService.resetState();
    console.log('TextClassifierService: Reset complete');
  }

  /**
   * Validate input text
   */
  private validateInput(text: string): string | null {
    if (typeof text !== 'string') {
      return `Invalid input: expected string, got ${typeof text}`;
    }

    if (text.trim() === '') {
      return ML_ERRORS.EMPTY_TEXT;
    }

    return null;
  }

  /**
   * Truncate text to maximum length
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    console.log(`TextClassifierService: Truncating text from ${text.length} to ${maxLength} characters`);
    return text.substring(0, maxLength);
  }

  /**
   * Parse classification result from browser.trial.ml
   * Normalizes different possible result formats
   */
  private parseResult(
    result: any,
    metadata: { modelId?: string; inferenceTime?: number },
  ): ClassificationResult {
    try {
      console.log('TextClassifierService: Parsing result:', result);

      // Handle different result formats
      if (!result) {
        return {
          ok: false,
          error: 'No classification result returned',
          ...metadata,
        };
      }

      // Expected result format from text-classification:
      // [{ label: string, score: number }, ...]
      if (Array.isArray(result)) {
        const bestResult = result[0]; // Take the highest confidence result

        if (bestResult && typeof bestResult === 'object') {
          return {
            ok: true,
            label: bestResult.label,
            score: bestResult.score,
            modelId: metadata.modelId,
            inferenceTime: metadata.inferenceTime,
          };
        }
      }

      // Handle single object result
      if (result && typeof result === 'object' && result.label && result.score) {
        return {
          ok: true,
          label: result.label,
          score: result.score,
          modelId: metadata.modelId,
          inferenceTime: metadata.inferenceTime,
        };
      }

      // Handle result with different property names
      if (result && typeof result === 'object') {
        const label = result.label ?? result.result ?? result.output;
        const score = result.score ?? result.confidence ?? result.probability;

        if (label && score) {
          return {
            ok: true,
            label: String(label),
            score: Number(score),
            modelId: metadata.modelId,
            inferenceTime: metadata.inferenceTime,
          };
        }
      }

      // If we can't parse the result, return error
      console.warn('TextClassifierService: Unknown result format:', result);
      return {
        ok: false,
        error: 'Unable to parse classification result',
        ...metadata,
      };
    } catch (error) {
      console.error('TextClassifierService: Error parsing result:', error);
      return {
        ok: false,
        error: 'Failed to parse classification result',
        ...metadata,
      };
    }
  }

  /**
   * Normalize error to consistent format
   */
  private normalizeError(error: any, inferenceTime?: number): ClassificationResult {
    const errorMessage = this.getErrorMessage(error);
    // const errorCode = this.getErrorCode(error); // Not using code for now

    return {
      ok: false,
      error: errorMessage,
      inferenceTime,
    };
  }

  /**
   * Get user-friendly error message
   */
  private getErrorMessage(error: any): string {
    if (typeof error === 'string') {
      return error;
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (message.includes('permission')) {
        return 'ML permission not granted. Please grant permission in Options.';
      }
      if (message.includes('timeout')) {
        return 'Classification timed out. Please try again.';
      }
      if (message.includes('not available') || message.includes('undefined')) {
        return 'Firefox ML API is not available. Requires Firefox Nightly or Beta with extensions.ml.enabled=true.';
      }
      if (message.includes('download') || message.includes('network')) {
        return 'Failed to download ML model. Please check your internet connection.';
      }
      if (message.includes('storage') || message.includes('quota')) {
        return 'Insufficient storage space for ML model.';
      }

      return error.message;
    }

    return 'Unknown classification error';
  }
}

// Export singleton instance
export const textClassifierService = TextClassifierService.getInstance();
