import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NotificationService } from '../../../core/services/ui/notification.service';

@Component({
  selector: 'app-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-stack" aria-live="polite" aria-label="Notifications">
      @for (toast of notify.toasts(); track toast.id) {
        <div class="toast toast-{{ toast.type }}" role="alert">
          <span class="toast-msg">{{ toast.message }}</span>
          <button class="toast-close" type="button" (click)="notify.dismiss(toast.id)" aria-label="Dismiss">×</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-stack {
      position: fixed;
      bottom: 1rem;
      right: 1rem;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      pointer-events: none;
    }
    .toast {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      min-width: 260px;
      max-width: 420px;
      border-radius: var(--radius-md);
      padding: 0.65rem 0.85rem;
      font-size: 0.82rem;
      pointer-events: auto;
      animation: toast-in 180ms ease;
      box-shadow: var(--shadow-2);
    }
    @keyframes toast-in {
      from { transform: translateX(12px); opacity: 0; }
      to   { transform: translateX(0);    opacity: 1; }
    }
    .toast-info    { background: var(--color-bg-raised); color: var(--color-fg-base); border: 1px solid var(--color-border-mid); }
    .toast-success { background: var(--color-healthy);   color: var(--color-healthy-text); border: 1px solid var(--color-healthy); }
    .toast-warning { background: var(--color-warning);   color: var(--color-warning-text); border: 1px solid var(--color-warning); }
    .toast-error   { background: var(--color-critical);  color: var(--color-critical-text); border: 1px solid var(--color-critical); }
    .toast-msg  { flex: 1; }
    .toast-close {
      border: none;
      background: none;
      color: inherit;
      font-size: 1rem;
      cursor: pointer;
      opacity: 0.7;
      line-height: 1;
    }
    .toast-close:hover { opacity: 1; }
  `],
})
export class ToastComponent {
  protected readonly notify = inject(NotificationService);
}
