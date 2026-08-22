import {Component, input, output} from '@angular/core';
import {CommonModule} from '@angular/common';
import {ThemeService} from '../../services/theme.service';

/**
 * Reusable header component with logo and optional theme toggle
 * Used in both popup and sidebar
 */
@Component({
  selector: 'shared-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="header">
      <div class="logo">
        <div class="icon">AS</div>
        <span>Article Summarizer</span>
      </div>
      @if (showThemeToggle() && themeService()) {
        <div class="header-controls">
          <button
                  class="theme-toggle"
                  [class.theme-toggle--active]="themeService()!.isDarkTheme()"
                  (click)="themeToggle.emit()"
                  [attr.aria-label]="themeService()?.isDarkTheme() ? 'Switch to light mode' : 'Switch to dark mode'"
                  title="Toggle theme">
            @if (themeService()?.isDarkTheme()) {
              <span>☀️</span>
            } @else {
              <span>🌙</span>
            }
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--border-color);
      }

      .logo {
        font-size: 18px;
        font-weight: 600;
        color: var(--primary-color);
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .icon {
        width: 24px;
        height: 24px;
        background: linear-gradient(135deg, var(--primary-color), var(--primary-hover));
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 12px;
      }

      .header-controls {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .theme-toggle {
        background: transparent;
        border: 1px solid var(--border-color);
        border-radius: 50%;
        width: 32px;
        height: 32px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-secondary);
        font-size: 16px;
        transition: var(--transition);

        &:hover {
          background-color: var(--hover-bg);
          border-color: var(--primary-color);
        }

        &.theme-toggle--active {
          background-color: var(--primary-light);
          border-color: var(--primary-color);
          color: var(--primary-color);
        }
      }
    `
  ]
})
export class HeaderComponent {
  showThemeToggle = input<boolean>(false);
  themeService = input<ThemeService | null>(null);

  themeToggle = output<void>();
}