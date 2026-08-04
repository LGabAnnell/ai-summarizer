import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Reusable empty state component
 * Displays an icon, title, and message when no content is available
 */
@Component({
  selector: 'shared-empty-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="empty-state">
      <div class="empty-icon">{{ icon() }}</div>
      <div class="empty-title">{{ title() }}</div>
      <div class="empty-message">{{ message() }}</div>
    </div>
  `,
  styles: [
    `
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;
      text-align: center;
      color: var(--text-secondary);
    }

    .empty-icon {
      width: 64px;
      height: 64px;
      margin-bottom: 16px;
      background-color: var(--primary-light);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
    }

    .empty-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 8px;
    }

    .empty-message {
      font-size: 14px;
      color: var(--text-secondary);
    }
    `
  ]
})
export class EmptyStateComponent {
  icon = input<string>('📰');
  title = input<string>('Ready to summarize');
  message = input<string>('Click the button below to summarize the current article');
}