import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty-state">
      @if (icon()) {
        <span class="empty-icon" aria-hidden="true">{{ icon() }}</span>
      }
      <p>{{ message() }}</p>
    </div>
  `,
  styles: [`
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      margin: 0.75rem;
      border: 1px dashed var(--color-border-light);
      border-radius: var(--radius-md);
      padding: 2rem 1rem;
      color: var(--color-fg-faint);
      font-size: 0.82rem;
      text-align: center;
    }
    .empty-icon { font-size: 1.5rem; }
    p { margin: 0; }
  `],
})
export class EmptyStateComponent {
  readonly message = input('Nothing to show.');
  readonly icon = input('');
}
