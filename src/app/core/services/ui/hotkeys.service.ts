import { Injectable, OnDestroy } from '@angular/core';
import Mousetrap from 'mousetrap';

export type HotkeyScope = 'global' | 'table' | 'editor' | 'terminal';

interface HotkeyBinding {
  keys: string | string[];
  scope: HotkeyScope;
  description: string;
  handler: () => void;
}

@Injectable({ providedIn: 'root' })
export class HotkeysService implements OnDestroy {
  private readonly bindings: HotkeyBinding[] = [];

  register(binding: HotkeyBinding): () => void {
    this.bindings.push(binding);
    Mousetrap.bind(binding.keys, (e) => {
      e.preventDefault();
      binding.handler();
      return false;
    });
    return () => this.unregister(binding);
  }

  unregister(binding: HotkeyBinding): void {
    const idx = this.bindings.indexOf(binding);
    if (idx !== -1) this.bindings.splice(idx, 1);
    Mousetrap.unbind(binding.keys);
  }

  getBindings(scope?: HotkeyScope): HotkeyBinding[] {
    return scope ? this.bindings.filter((b) => b.scope === scope) : this.bindings;
  }

  ngOnDestroy(): void {
    Mousetrap.reset();
  }
}
