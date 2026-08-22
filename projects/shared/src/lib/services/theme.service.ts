/**
 * Theme Service for managing dark/light mode
 * Provides theme management with persistent storage
 */

import {effect, inject, Injectable, signal} from '@angular/core';
import browser from "webextension-polyfill";
import {MessagingService} from "./messaging.service";
import {Theme} from "../models/theme.model";

/**
 * Storage key for theme preference
 */
const THEME_STORAGE_KEY = 'ai-summarizer-theme';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private _theme = signal<Theme>('light');
  private messagingService = inject(MessagingService);

  constructor() {
    // Read the theme already applied by the blocking script in index.html.
    // This runs after first paint; the signal just syncs with the DOM.
    const applied = document.documentElement.getAttribute('data-theme') as Theme | null;
    this._theme.set(applied ?? 'light');

    // Sync from storage for cross-context persistence (popup/options lack the blocking script)
    this.loadTheme();

    // Subscribe to theme-change broadcasts from other extension contexts.
    // The broadcast is fire-and-forget from the sender's perspective; we only
    // apply the incoming theme here without re-broadcasting (no loop).
    this.messagingService.onThemeChanged().subscribe((theme) => {
      if (theme !== this._theme()) {
        this._theme.set(theme);
        localStorage.setItem(THEME_STORAGE_KEY, theme);
        this.applyThemeToDocument();
      }
    });

    effect(() => this.applyThemeToDocument());
  }

  /**
   * Set theme
   */
  async setTheme(theme: Theme): Promise<void> {
    this._theme.set(theme);
    await this.saveTheme();
    // Notify the background script so it can broadcast the change to all contexts.
    // Fire-and-forget: errors are already caught inside sendMessage.
    this.messagingService.setTheme(theme).subscribe();
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

  /**
   * Load theme from storage
   */
  private async loadTheme(): Promise<void> {
    try {
      // Check if we're in a browser extension context
      if (typeof browser !== 'undefined' && browser.storage) {
        const result = await browser.storage.local.get(THEME_STORAGE_KEY);
        if (result[THEME_STORAGE_KEY] != null) {
          const stored = result[THEME_STORAGE_KEY] as Theme;
          // Sync localStorage so the blocking script in index.html can read it
          localStorage.setItem(THEME_STORAGE_KEY, stored);
          if (stored !== this._theme()) {
            this._theme.set(stored);
          }
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
        await browser.storage.local.set({[THEME_STORAGE_KEY]: this._theme()});
        localStorage.setItem(THEME_STORAGE_KEY, this._theme());
      }
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  }
}