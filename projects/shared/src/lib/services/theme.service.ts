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
  // Current theme signal
  private _theme = signal<Theme>('light');
  readonly theme = this._theme.asReadonly();

  // System theme (detected)
  private _systemTheme = signal<'light' | 'dark'>('light');
  readonly systemTheme = this._systemTheme.asReadonly();

  // Effective theme (respects system preference when theme is 'system')
  readonly effectiveTheme = signal<'light' | 'dark'>('light');

  constructor() {
    this.loadTheme();
    this.detectSystemTheme();

    // Set up effect to update effective theme when inputs change
    effect(() => {
      const theme = this._theme();
      const system = this._systemTheme();
      
      if (theme === 'system') {
        this.effectiveTheme.set(system);
      } else {
        this.effectiveTheme.set(theme);
      }
    });

    // Listen for system theme changes
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', (e) => {
        this._systemTheme.set(e.matches ? 'dark' : 'light');
      });
    }
  }

  /**
   * Load theme from storage
   */
  private async loadTheme(): Promise<void> {
    try {
      // Check if we're in a browser extension context
      if (typeof browser !== 'undefined' && browser.storage) {
        const result = await browser.storage.local.get([THEME_STORAGE_KEY]);
        if (result[THEME_STORAGE_KEY]) {
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
  private detectSystemTheme(): void {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this._systemTheme.set(isDark ? 'dark' : 'light');
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
   * Get effective theme (respects system preference)
   */
  getEffectiveTheme(): 'light' | 'dark' {
    return this.effectiveTheme();
  }

  /**
   * Check if current theme is dark
   */
  isDarkTheme(): boolean {
    return this.effectiveTheme() === 'dark';
  }

  /**
   * Check if current theme is light
   */
  isLightTheme(): boolean {
    return this.effectiveTheme() === 'light';
  }

  /**
   * Check if using system theme
   */
  isSystemTheme(): boolean {
    return this._theme() === 'system';
  }

  /**
   * Get CSS class for current theme
   */
  getThemeClass(): string {
    return this.isDarkTheme() ? 'dark-theme' : 'light-theme';
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
    
    // Also set data attribute for CSS variables
    html.setAttribute('data-theme', this.effectiveTheme());
  }
}