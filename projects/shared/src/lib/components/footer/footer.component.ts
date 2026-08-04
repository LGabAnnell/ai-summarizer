import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Reusable footer component
 * Displays footer links and buttons (View article, Clear History, Settings)
 */
@Component({
  selector: 'shared-footer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="footer">
      <div class="footer-left">
        @if (showViewArticle() && articleUrl()) {
          <a [href]="articleUrl()" target="_blank" class="settings-link" (click)="viewArticle.emit()">View article</a>
        }
        <ng-content select="[footer-left]"></ng-content>
      </div>
      <div class="footer-right">
        @if (showClearHistory() && historyCount() > 0) {
          <button class="settings-link" (click)="clearHistory.emit()">Clear History</button>
        }
        <button class="settings-link" (click)="openSettings.emit()">Settings</button>
        <ng-content select="[footer-right]"></ng-content>
      </div>
    </div>
  `,
  styles: [
    `
    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 12px;
      border-top: 1px solid var(--border-color);
      font-size: 12px;

      .footer-left,
      .footer-right {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .settings-link {
        color: var(--primary-color);
        text-decoration: none;
        cursor: pointer;

        &:hover {
          text-decoration: underline;
        }
      }

      button.settings-link {
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        font-size: inherit;
        color: var(--primary-color);
        text-decoration: none;

        &:hover {
          text-decoration: underline;
        }
      }
    }
    `
  ]
})
export class FooterComponent {
  showViewArticle = input<boolean>(false);
  articleUrl = input<string>('');
  showClearHistory = input<boolean>(false);
  historyCount = input<number>(0);
  
  viewArticle = output<void>();
  clearHistory = output<void>();
  openSettings = output<void>();
}