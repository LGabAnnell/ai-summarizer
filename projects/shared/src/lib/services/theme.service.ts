/**
 * Theme Service for managing dark/light mode
 * Provides theme management with persistent storage
 */

import { Injectable, signal, effect } from '@angular/core';
import browser from "webextension-polyfill";

/**
 * Theme types
 */
export type Theme = 'light' | 'dark' | 'system';

/**
 * Storage key for theme preference
 */
const THEME_STORAGE_KEY = 'ai-summarizer-theme';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  // System theme (detected)
  private _theme = signal<Theme>('light');

  constructor() {
    this.initializeTheme();
  }

  /**
   * Initialize theme: load saved preference from storage,
   * resolve system theme if needed, then apply to the document.
   */
  private async initializeTheme(): Promise<void> {
    await this.loadTheme();
    this.detectSystemTheme();
    this.applyThemeToDocument();
  }

  /**
   * Load theme from storage
   */
  private async loadTheme(): Promise<void> {
    try {
      // Check if we're in a browser extension context
      if (typeof browser !== 'undefined' && browser.storage) {
        const result = await browser.storage.local.get(THEME_STORAGE_KEY);
        if (result[THEME_STORAGE_KEY] != null) {
          this._theme.set(result[THEME_STORAGE_KEY] as Theme);
        }
      }
    } catch (error) {
      console.error('Failed to load theme:', error);
    }
  }

  /**
   * Save theme to storage
   */
  private async saveTheme(): Promise<void> {
    try {
      // Check if we're in a browser extension context
      if (typeof browser !== 'undefined' && browser.storage) {
        await browser.storage.local.set({ [THEME_STORAGE_KEY]: this._theme() });
      }
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  }

  /**
   * Detect system theme preference
   */
  detectSystemTheme(): void {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      if (this._theme() == 'system') {
        this._theme.set(mediaQuery.matches ? 'dark' : 'light');
        console.log("set media to " + this._theme());
      }
      mediaQuery.addEventListener('change', (e) => {
        this._theme.set(e.matches ? 'dark' : 'light');
      });
    }
  }

  /**
   * Set theme
   */
  async setTheme(theme: Theme): Promise<void> {
    this._theme.set(theme);
    await this.saveTheme();
  }

  /**
   * Toggle between light and dark themes
   */
  async toggleTheme(): Promise<void> {
    const current = this._theme();
    const newTheme = current === 'light' ? 'dark' : 'light';
    await this.setTheme(newTheme);
  }

  /**
   * Get current theme
   */
  getTheme(): Theme {
    return this._theme();
  }

  /**
   * Get CSS class for current theme
   */
  getThemeClass(): string {
    return this.isDarkTheme() ? 'dark-theme' : 'light-theme';
  }

  isDarkTheme() {
    return this._theme() === 'dark';
  }

  /**
   * Apply theme to document
   */
  applyThemeToDocument(): void {
    const themeClass = this.getThemeClass();
    const html = document.documentElement;
    
    // Remove existing theme classes
    html.classList.remove('dark-theme', 'light-theme');
    
    // Add current theme class
    html.classList.add(themeClass);
    
    html.setAttribute('data-theme', this._theme());
  }
}