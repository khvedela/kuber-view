import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  durationMs?: number;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly toasts = signal<Toast[]>([]);

  show(type: Toast['type'], message: string, durationMs = 4000): void {
    const id = crypto.randomUUID();
    this.toasts.update((list) => [...list, { id, type, message, durationMs }]);
    if (durationMs > 0) {
      setTimeout(() => this.dismiss(id), durationMs);
    }
  }

  dismiss(id: string): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  success(message: string): void { this.show('success', message); }
  error(message: string, durationMs = 8000): void { this.show('error', message, durationMs); }
  info(message: string): void { this.show('info', message); }
  warn(message: string): void { this.show('warning', message); }
}
