import { Injectable } from '@angular/core';
import { signal } from '@angular/core';
import type { Density, Theme } from '../../models/cluster';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.loadTheme());
  readonly density = signal<Density>(this.loadDensity());

  constructor() {
    this.applyTheme(this.theme());
    this.applyDensity(this.density());
  }

  setTheme(theme: Theme): void {
    this.theme.set(theme);
    localStorage.setItem('kv:theme', theme);
    this.applyTheme(theme);
  }

  setDensity(density: Density): void {
    this.density.set(density);
    localStorage.setItem('kv:density', density);
    this.applyDensity(density);
  }

  private applyTheme(theme: Theme): void {
    const el = document.documentElement;
    if (theme === 'system') {
      el.removeAttribute('data-theme');
    } else {
      el.setAttribute('data-theme', theme);
    }
  }

  private applyDensity(density: Density): void {
    const el = document.documentElement;
    if (density === 'comfortable') {
      el.removeAttribute('data-density');
    } else {
      el.setAttribute('data-density', density);
    }
  }

  private loadTheme(): Theme {
    return (localStorage.getItem('kv:theme') as Theme) ?? 'dark';
  }

  private loadDensity(): Density {
    return (localStorage.getItem('kv:density') as Density) ?? 'comfortable';
  }
}
