import { Injectable, signal } from '@angular/core';
import Fuse from 'fuse.js';
import type { CommandItem } from '../../models/cluster';

@Injectable({ providedIn: 'root' })
export class CommandPaletteService {
  readonly open = signal(false);
  readonly query = signal('');
  readonly results = signal<CommandItem[]>([]);

  private readonly registry: CommandItem[] = [];
  private fuse = new Fuse<CommandItem>([], {
    keys: [
      { name: 'title', weight: 0.6 },
      { name: 'subtitle', weight: 0.2 },
      { name: 'keywords', weight: 0.2 },
    ],
    threshold: 0.4,
    includeScore: true,
  });

  register(...items: CommandItem[]): void {
    for (const item of items) {
      const idx = this.registry.findIndex((r) => r.id === item.id);
      if (idx !== -1) {
        this.registry.splice(idx, 1, item);
      } else {
        this.registry.push(item);
      }
    }
    this.rebuildIndex();
  }

  unregister(id: string): void {
    const idx = this.registry.findIndex((r) => r.id === id);
    if (idx !== -1) {
      this.registry.splice(idx, 1);
      this.rebuildIndex();
    }
  }

  show(): void {
    this.open.set(true);
    this.search('');
  }

  hide(): void {
    this.open.set(false);
    this.query.set('');
  }

  search(q: string): void {
    this.query.set(q);
    if (!q.trim()) {
      this.results.set(this.registry.slice(0, 12));
    } else {
      this.results.set(
        this.fuse
          .search(q)
          .slice(0, 12)
          .map((r) => r.item),
      );
    }
  }

  private rebuildIndex(): void {
    this.fuse = new Fuse(this.registry, {
      keys: [
        { name: 'title', weight: 0.6 },
        { name: 'subtitle', weight: 0.2 },
        { name: 'keywords', weight: 0.2 },
      ],
      threshold: 0.4,
      includeScore: true,
    });
  }
}
