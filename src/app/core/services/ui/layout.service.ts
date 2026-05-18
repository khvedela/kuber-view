import { Injectable, signal } from '@angular/core';

export interface PaneSizes {
  sidebar: number;   // percent
  inspector: number; // percent
}

const DEFAULTS: PaneSizes = { sidebar: 18, inspector: 42 };
const KEY = 'kv:pane-sizes';

@Injectable({ providedIn: 'root' })
export class LayoutService {
  readonly sizes = signal<PaneSizes>(this.load());

  save(sizes: Partial<PaneSizes>): void {
    const next = { ...this.sizes(), ...sizes };
    this.sizes.set(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // storage quota exceeded — ignore
    }
  }

  private load(): PaneSizes {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      // corrupt — fall through
    }
    return DEFAULTS;
  }
}
