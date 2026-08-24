/**
 * ML Engine Manager
 * Manages the lifecycle of Firefox's ML engine (browser.trial.ml)
 * Handles engine creation, caching, and cleanup
 */

import browser from 'webextension-polyfill';
import {mlPermissionService} from './ml-permission.service';

/**
 * Firefox ML createEngine request type
 */
interface MLCreateEngineRequest {
  modelHub?: 'mozilla' | 'huggingface';
  taskName: string;
  modelId?: string;
  model?: string;
  options?: Record<string, unknown>;
}

/**
 * Configuration for ML engine
 */
export interface MLEngineConfig {
  modelHub?: 'mozilla' | 'huggingface';
  taskName: 'text-classification' | 'summarization';
  modelId?: string; // Make modelId optional for task-based approach
  maxTextLength?: number;
  taskOptions?: Record<string, unknown>; // Task-specific options (e.g., max_length, temperature for summarization)
}

/**
 * ML Engine instance wrapper
 */
export interface MLEngine {
  id: string;
  config: MLEngineConfig;
  engine: unknown; // The actual browser.trial.ml engine object
  createdAt: number;
  lastUsedAt: number;
}

/**
 * Progress event for model download
 */
export interface MLEngineProgressEvent {
  modelId: string;
  progress: number; // 0-100
  status: 'downloading' | 'extracting' | 'complete' | 'error';
  message?: string;
}

/**
 * Callback for progress events
 */
export type ProgressCallback = (event: MLEngineProgressEvent) => void;

/**
 * Error codes for ML engine
 */
export enum MLEngineError {
  NOT_AVAILABLE = 'ML_ENGINE_NOT_AVAILABLE',
  PERMISSION_DENIED = 'ML_PERMISSION_DENIED',
  CREATE_FAILED = 'ML_ENGINE_CREATE_FAILED',
  ALREADY_EXISTS = 'ML_ENGINE_ALREADY_EXISTS',
  DOWNLOAD_FAILED = 'ML_DOWNLOAD_FAILED',
  TIMEOUT = 'ML_ENGINE_TIMEOUT',
}

/**
 * Default configuration for text classification
 * Using task-based approach - Firefox will use default model for text-classification task
 */
const DEFAULT_CONFIG: MLEngineConfig = {
  modelHub: 'mozilla',
  taskName: 'text-classification',
  // NOTE: modelId intentionally omitted to use Firefox's default model for text-classification task
};

/**
 * Generate a unique engine key based on task type and model
 */
function generateEngineKey(config: MLEngineConfig): string {
  return `${config.taskName}_${config.modelHub ?? 'mozilla'}_${config.modelId ?? 'default'}`;
}

/**
 * Manager for ML engine lifecycle
 * Implements lazy initialization with promise caching
 * Supports multiple engines keyed by task type + model configuration
 */
export class MLEngineManager {
  private static instance: MLEngineManager | null = null;
  private engines: Map<string, MLEngine> = new Map();
  private enginePromises: Map<string, Promise<MLEngine>> = new Map();
  private progressCallbacks: ProgressCallback[] = [];
  private isProgressListenerAdded = false;

  /**
   * Singleton instance
   */
  public static getInstance(): MLEngineManager {
    MLEngineManager.instance ??= new MLEngineManager();
    return MLEngineManager.instance;
  }

  /**
   * Get the default configuration
   */
  getDefaultConfig(): MLEngineConfig {
    return {...DEFAULT_CONFIG};
  }

  /**
   * Set custom configuration (e.g., different model ID)
   */
  setConfig(config: Partial<MLEngineConfig>): void {
    // Note: changing config after engine creation will require re-creation
    console.log('MLEngineManager: Setting custom config:', config);
    // We'll use the provided config when creating the engine
  }

  /**
   * Check if engine is available and ready for a specific config
   */
  isEngineAvailable(config?: Partial<MLEngineConfig>): boolean {
    const key = this.getEngineKey(config);
    const engine = this.engines.get(key);
    return engine !== undefined && engine.engine !== null;
  }

  /**
   * Check if engine creation is in progress for a specific config
   */
  isCreating(config?: Partial<MLEngineConfig>): boolean {
    const key = this.getEngineKey(config);
    return this.enginePromises.has(key) && !this.isEngineAvailable(config);
  }

  /**
   * Get the engine for a specific config or create it if not exists
   * Uses lazy initialization with promise caching per config
   */
  async getEngine(config?: Partial<MLEngineConfig>): Promise<MLEngine> {
    const key = this.getEngineKey(config);

    // Return existing engine if available
    const existingEngine = this.engines.get(key);
    if (existingEngine) {
      console.log(`MLEngineManager: Returning existing engine for key: ${key}`);
      // Update last used timestamp
      existingEngine.lastUsedAt = Date.now();
      return existingEngine;
    }

    // If creation is already in progress for this key, return the existing promise
    const existingPromise = this.enginePromises.get(key);
    if (existingPromise) {
      console.log(`MLEngineManager: Returning existing engine promise for key: ${key}`);
      return existingPromise;
    }

    // Create new engine
    console.log(`MLEngineManager: Creating new engine for key: ${key}...`);
    const promise = this.createEngineInternal(config);
    this.enginePromises.set(key, promise);

    try {
      const engine = await promise;
      this.engines.set(key, engine);
      return engine;
    } finally {
      this.enginePromises.delete(key);
    }
  }

  /**
   * Register a progress callback
   */
  onProgress(callback: ProgressCallback): void {
    this.progressCallbacks.push(callback);
    console.log('MLEngineManager: Progress callback registered');
  }

  /**
   * Remove a progress callback
   */
  offProgress(callback: ProgressCallback): void {
    this.progressCallbacks = this.progressCallbacks.filter(cb => cb !== callback);
    console.log('MLEngineManager: Progress callback removed');
  }

  /**
   * Run the engine with text input
   * Accepts optional config to specify which engine to use
   * Note: Task-specific options should be passed in the config parameter
   */
  async runEngine(text: string, timeoutMs = 30000, config?: Partial<MLEngineConfig>): Promise<unknown> {
    try {
      const engine = await this.getEngine(config);
      const trialML = browser.trial.ml;

      if (typeof trialML.runEngine !== 'function') {
        throw new Error('browser.trial.ml.runEngine is not available');
      }

      // Add timeout handling
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`ML engine timeout after ${timeoutMs}ms: ${MLEngineError.TIMEOUT}`));
        }, timeoutMs);
      });

      console.log(`MLEngineManager: Running engine ${engine.id} with text length:`, text.length);

      // For Firefox ML API, we need to call runEngine with the engine and text
      // The API signature is: runEngine(engine, inputText)
      const result = await Promise.race([
        trialML.runEngine({
          args: text,
        }),
        timeoutPromise,
      ]);

      console.log(`MLEngineManager: Engine ${engine.id} run completed`);
      return result;
    } catch (error) {
      console.error('MLEngineManager: Engine run failed:', error);
      throw error;
    }
  }

  /**
   * Dispose of a specific engine or all engines
   */
  async disposeEngine(config?: Partial<MLEngineConfig>): Promise<void> {
    const key = config ? this.getEngineKey(config) : undefined;

    if (key) {
      // Dispose specific engine
      const engine = this.engines.get(key);
      if (engine?.engine) {
        this.engines.delete(key);
      }
    } else {
      // Dispose all engines
      this.engines.clear();
      this.enginePromises.clear();
    }
  }

  /**
   * Clear ML model cache
   */
  async clearModelCache(): Promise<void> {
    try {
      const trialML = browser.trial.ml;
      if (typeof trialML.deleteCachedModels === 'function') {
        console.log('MLEngineManager: Clearing model cache');
        await trialML.deleteCachedModels();
        console.log('MLEngineManager: Model cache cleared');
      } else {
        console.log('MLEngineManager: deleteCachedModels not available');
      }

      // Also dispose current engine
      await this.disposeEngine();
    } catch (error) {
      console.error('MLEngineManager: Error clearing model cache:', error);
      throw error;
    }
  }

  /**
   * Reset the manager (for testing or cleanup)
   */
  async reset(): Promise<void> {
    await this.disposeEngine();
    this.enginePromises.clear();
    this.progressCallbacks = [];
    this.isProgressListenerAdded = false;
    console.log('MLEngineManager: Reset complete');
  }

  /**
   * Generate engine key from config
   */
  private getEngineKey(config?: Partial<MLEngineConfig>): string {
    const mergedConfig: MLEngineConfig = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    return generateEngineKey(mergedConfig);
  }

  /**
   * Internal method to create the ML engine
   */
  private async createEngineInternal(config?: Partial<MLEngineConfig>): Promise<MLEngine> {
    try {
      // Check if API is available
      if (!mlPermissionService.isAPIAvailable()) {
        throw new Error(`ML API not available: ${MLEngineError.NOT_AVAILABLE}`);
      }

      // Check permission
      const hasPermission = await mlPermissionService.checkPermission();
      if (!hasPermission) {
        throw new Error(`Permission denied: ${MLEngineError.PERMISSION_DENIED}`);
      }

      // Merge custom config with defaults
      const engineConfig: MLEngineConfig = {
        ...DEFAULT_CONFIG,
        ...config,
      };

      console.log('MLEngineManager: Creating engine with config:', engineConfig);

      // Add progress listener before creating engine (important!)
      this.setupProgressListener();

      // Create the engine
      const engineObj = await this.createBrowserEngine(engineConfig);

      const engine: MLEngine = {
        id: generateEngineKey(engineConfig),
        config: engineConfig,
        engine: engineObj,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      };

      console.log(`MLEngineManager: Engine created successfully for key: ${engine.id}`);
      return engine;
    } catch (error) {
      console.error('MLEngineManager: Failed to create engine:', error);
      throw error;
    }
  }

  /**
   * Create the actual browser.trial.ml engine
   */
  private async createBrowserEngine(config: MLEngineConfig): Promise<void> {
    try {
      const trialML = browser.trial.ml;

      if (typeof trialML.createEngine !== 'function') {
        throw new Error('browser.trial.ml.createEngine is not available');
      }

      console.log('MLEngineManager: Calling browser.trial.ml.createEngine with:', config);

      // Create engine config - include model identifier if provided (task-based approach)
      // Firefox ML API uses 'model' for summarization and 'modelId' for classification
      const engineConfig: MLCreateEngineRequest = {
        modelHub: config.modelHub ?? 'mozilla',
        taskName: config.taskName,
      };

      // Include model identifier - use 'model' for summarization, 'modelId' for classification
      // For compatibility, we'll use the model field for summarization tasks
      if (config.modelId) {
        if (config.taskName === 'summarization') {
          engineConfig.model = config.modelId;
        } else {
          engineConfig.modelId = config.modelId;
        }
      }

      // Include task-specific options if provided
      if (config.taskOptions) {
        engineConfig.options = config.taskOptions;
      }

      await trialML.createEngine(engineConfig as unknown as { [p: string]: string });
    } catch (error) {
      console.error('MLEngineManager: Browser engine creation failed:', error);
      throw error;
    }
  }

  /**
   * Setup progress listener for model download
   */
  private setupProgressListener(): void {
    if (this.isProgressListenerAdded) {
      console.log('MLEngineManager: Progress listener already added');
      return;
    }

    console.log('MLEngineManager: Adding progress listener');

    browser.trial.ml.onProgress.addListener((progressEvent: { [p: string]: unknown }) => {
      console.log('MLEngineManager: Progress event received:', progressEvent);

      const castEvent = progressEvent as {
        modelId?: string;
        progress?: number;
        status?: string;
        message?: string;
        error?: string;
      };

      // Notify all registered callbacks
      const event: MLEngineProgressEvent = {
        modelId: castEvent.modelId ?? 'unknown',
        progress: Math.round((castEvent.progress ?? 0) * 100) || 0,
        status: this.mapProgressStatus(progressEvent),
        message: castEvent.message,
      };

      this.progressCallbacks.forEach(callback => {
        try {
          callback(event);
        } catch (error) {
          console.error('MLEngineManager: Progress callback error:', error);
        }
      });
    });

    this.isProgressListenerAdded = true;
  }

  /**
   * Map browser progress status to our internal status
   */
  private mapProgressStatus(event: { [p: string]: unknown }): MLEngineProgressEvent['status'] {
    const status = (event as { status?: string }).status?.toLowerCase();
    const progress = (event as { progress?: number }).progress;
    const error = (event as { error?: unknown }).error;

    if (status === 'complete' || (progress ?? 0) >= 1.0) return 'complete';
    if (status === 'error' || error) return 'error';
    if (status === 'extracting') return 'extracting';
    return 'downloading';
  }
}

// Export singleton instance
export const mlEngineManager = MLEngineManager.getInstance();
