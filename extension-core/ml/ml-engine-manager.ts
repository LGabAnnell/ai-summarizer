/**
 * ML Engine Manager
 * Manages the lifecycle of Firefox's ML engine (browser.trial.ml)
 * Handles engine creation, caching, and cleanup
 */

import browser from 'webextension-polyfill';
import { mlPermissionService } from './ml-permission.service';

/**
 * Configuration for ML engine
 */
export interface MLEngineConfig {
  modelHub?: 'mozilla' | 'huggingface';
  taskName: 'text-classification';
  modelId: string;
}

/**
 * ML Engine instance wrapper
 */
export interface MLEngine {
  id: string;
  config: MLEngineConfig;
  engine: any; // The actual browser.trial.ml engine object
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
 * Using Mozilla's text-classification model
 */
const DEFAULT_CONFIG: MLEngineConfig = {
  modelHub: 'mozilla',
  taskName: 'text-classification',
  modelId: 'distilbert-base-uncased-finetuned-sst-2-english', // Explicit model ID
};

/**
 * Manager for ML engine lifecycle
 * Implements lazy initialization with promise caching
 */
export class MLEngineManager {
  private engine: MLEngine | null = null;
  private enginePromise: Promise<MLEngine> | null = null;
  private progressCallbacks: ProgressCallback[] = [];
  private isProgressListenerAdded = false;

  private static instance: MLEngineManager | null = null;

  /**
   * Singleton instance
   */
  public static getInstance(): MLEngineManager {
    if (!MLEngineManager.instance) {
      MLEngineManager.instance = new MLEngineManager();
    }
    return MLEngineManager.instance;
  }

  /**
   * Get the default configuration
   */
  getDefaultConfig(): MLEngineConfig {
    return { ...DEFAULT_CONFIG };
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
   * Check if engine is available and ready
   */
  isEngineAvailable(): boolean {
    return this.engine !== null && this.engine.engine !== null;
  }

  /**
   * Check if engine creation is in progress
   */
  isCreating(): boolean {
    return this.enginePromise !== null && !this.isEngineAvailable();
  }

  /**
   * Get the current engine or create it if not exists
   * Uses lazy initialization with promise caching
   */
  async getEngine(config?: Partial<MLEngineConfig>): Promise<MLEngine> {
    // Return existing engine if available
    if (this.isEngineAvailable()) {
      console.log('MLEngineManager: Returning existing engine');
      // Update last used timestamp
      this.engine!.lastUsedAt = Date.now();
      return this.engine!;
    }

    // If creation is already in progress, return the existing promise
    if (this.enginePromise) {
      console.log('MLEngineManager: Returning existing engine promise');
      return this.enginePromise;
    }

    // Create new engine
    console.log('MLEngineManager: Creating new engine...');
    this.enginePromise = this.createEngineInternal(config);
    
    try {
      this.engine = await this.enginePromise;
      return this.engine;
    } finally {
      this.enginePromise = null;
    }
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
        id: this.generateEngineId(engineConfig),
        config: engineConfig,
        engine: engineObj,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      };

      console.log('MLEngineManager: Engine created successfully');
      return engine;
    } catch (error) {
      console.error('MLEngineManager: Failed to create engine:', error);
      // Clean up progress listener if setup failed
      this.cleanupProgressListener();
      throw error;
    }
  }

  /**
   * Create the actual browser.trial.ml engine
   */
  private async createBrowserEngine(config: MLEngineConfig): Promise<any> {
    try {
      const trialML = (browser as any).trial.ml;
      
      if (typeof trialML.createEngine !== 'function') {
        throw new Error('browser.trial.ml.createEngine is not available');
      }

      console.log('MLEngineManager: Calling browser.trial.ml.createEngine with:', config);

      const engine = await trialML.createEngine({
        modelHub: config.modelHub || 'mozilla',
        taskName: config.taskName,
        modelId: config.modelId,
      });

      if (!engine) {
        throw new Error('Engine creation returned null');
      }

      console.log('MLEngineManager: Engine object created:', typeof engine);
      return engine;
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

    const trialML = (browser as any).trial?.ml;
    if (!trialML || typeof trialML.onProgress !== 'function') {
      console.log('MLEngineManager: onProgress not available');
      return;
    }

    console.log('MLEngineManager: Adding progress listener');
    
    trialML.onProgress.addListener((progressEvent: any) => {
      console.log('MLEngineManager: Progress event received:', progressEvent);
      
      // Notify all registered callbacks
      const event: MLEngineProgressEvent = {
        modelId: progressEvent.modelId || 'unknown',
        progress: Math.round(progressEvent.progress * 100) || 0,
        status: this.mapProgressStatus(progressEvent),
        message: progressEvent.message,
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
  private mapProgressStatus(event: any): MLEngineProgressEvent['status'] {
    const status = event.status?.toLowerCase();
    if (status === 'complete' || event.progress >= 1.0) return 'complete';
    if (status === 'error' || event.error) return 'error';
    if (status === 'extracting') return 'extracting';
    return 'downloading';
  }

  /**
   * Clean up progress listener
   */
  private cleanupProgressListener(): void {
    const trialML = (browser as any).trial?.ml;
    if (this.isProgressListenerAdded && trialML && typeof trialML.onProgress !== 'function') {
      try {
        // Note: onProgress.addListener/removeListener pattern
        // For now, we don't track the specific listener to remove
        // as the API might not support removal
        console.log('MLEngineManager: Progress listener cleanup not implemented');
      } catch (error) {
        console.error('MLEngineManager: Error cleaning up progress listener:', error);
      }
    }
    this.isProgressListenerAdded = false;
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
   */
  async runEngine(text: string, timeoutMs = 30000): Promise<any> {
    try {
      const engine = await this.getEngine();
      const trialML = (browser as any).trial.ml;

      if (typeof trialML.runEngine !== 'function') {
        throw new Error('browser.trial.ml.runEngine is not available');
      }

      // Add timeout handling
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`ML engine timeout after ${timeoutMs}ms: ${MLEngineError.TIMEOUT}`));
        }, timeoutMs);
      });

      console.log('MLEngineManager: Running engine with text length:', text.length);
      
      const result = await Promise.race([
        trialML.runEngine(engine.engine, text),
        timeoutPromise,
      ]);

      console.log('MLEngineManager: Engine run completed');
      return result;
    } catch (error) {
      console.error('MLEngineManager: Engine run failed:', error);
      throw error;
    }
  }

  /**
   * Dispose of the current engine
   */
  async disposeEngine(): Promise<void> {
    if (this.engine && this.engine.engine) {
      try {
        const trialML = (browser as any).trial.ml;
        if (typeof trialML.deleteEngine === 'function') {
          console.log('MLEngineManager: Disposing engine');
          await trialML.deleteEngine(this.engine.engine);
        }
        this.engine = null;
        this.cleanupProgressListener();
        console.log('MLEngineManager: Engine disposed');
      } catch (error) {
        console.error('MLEngineManager: Error disposing engine:', error);
        this.engine = null;
        this.cleanupProgressListener();
      }
    }
  }

  /**
   * Clear ML model cache
   */
  async clearModelCache(): Promise<void> {
    try {
      const trialML = (browser as any).trial.ml;
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
   * Generate unique engine ID based on config
   */
  private generateEngineId(config: MLEngineConfig): string {
    return `ml_engine_${config.modelHub || 'mozilla'}_${config.taskName}_${config.modelId}`;
  }

  /**
   * Reset the manager (for testing or cleanup)
   */
  async reset(): Promise<void> {
    await this.disposeEngine();
    this.enginePromise = null;
    this.progressCallbacks = [];
    this.isProgressListenerAdded = false;
    console.log('MLEngineManager: Reset complete');
  }
}

// Export singleton instance
export const mlEngineManager = MLEngineManager.getInstance();
