import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CopyButtonComponent } from '../copy-button/copy-button.component';

/**
 * Reusable summary header component
 * Displays the summary title with action buttons (copy, etc.)
 */
@Component({
  selector: 'shared-summary-header',
  standalone: true,
  imports: [CommonModule, CopyButtonComponent],
  template: `
    <div class="summary-header">
      <div class="summary-title">{{ title() }}</div>
      @if (showActions()) {
        <div class="summary-actions">
          @if (showCopyButton()) {
            <shared-copy-button
              [copying]="copying()"
              [copied]="copied()"
              [disabled]="copyDisabled()"
              [text]="copyText()"
              [successText]="copySuccessText()"
              [loadingText]="copyLoadingText()"
              (click)="copyClick.emit()">
            </shared-copy-button>
          }
                  <ng-content select="[additional-actions]"></ng-content>
        </div>
      }
    </div>
  `,
  styles: [
    `
    .summary-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 12px;
    }

    .summary-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
      word-break: break-word;
      flex: 1;
      margin-right: 12px;
    }

    .summary-actions {
      display: flex;
      gap: 8px;
    }
    `
  ]
})
export class SummaryHeaderComponent {
  title = input<string>('Article Summary');
  showActions = input<boolean>(true);
  showCopyButton = input<boolean>(true);
  copying = input<boolean>(false);
  copied = input<boolean>(false);
  copyDisabled = input<boolean>(false);
  copyText = input<string>('Copy');
  copySuccessText = input<string>('✓ Copied!');
  copyLoadingText = input<string>('Copying...');
  
  copyClick = output<void>();
}