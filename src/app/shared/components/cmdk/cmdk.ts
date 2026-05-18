import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  OnInit,
  OnDestroy,
  viewChild,
} from '@angular/core';
import { CommandPaletteService } from '../../../core/services/ui/command-palette.service';
import { HotkeysService } from '../../../core/services/ui/hotkeys.service';

@Component({
  selector: 'app-cmdk',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (palette.open()) {
      <div class="cmdk-backdrop" (click)="palette.hide()" aria-hidden="true"></div>
      <div
        class="cmdk-dialog"
        role="dialog"
        aria-label="Command palette"
        aria-modal="true"
      >
        <div class="cmdk-search">
          <svg class="cmdk-search-icon" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.099zm-5.242 1.156a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11z"/>
          </svg>
          <input
            #searchInput
            class="cmdk-input"
            type="text"
            placeholder="Search commands, pods, namespaces…"
            autocomplete="off"
            spellcheck="false"
            [value]="palette.query()"
            (input)="onInput($event)"
            (keydown)="onKeydown($event)"
            aria-label="Command search"
          />
          <kbd class="cmdk-esc" (click)="palette.hide()">esc</kbd>
        </div>

        <ul class="cmdk-list" role="listbox">
          @for (item of palette.results(); track item.id; let i = $index) {
            <li
              class="cmdk-item"
              role="option"
              [class.cmdk-item-active]="i === activeIndex()"
              [attr.aria-selected]="i === activeIndex()"
              (click)="run(item)"
              (mouseenter)="setActive(i)"
            >
              @if (item.icon) {
                <span class="cmdk-item-icon" aria-hidden="true">{{ item.icon }}</span>
              }
              <span class="cmdk-item-title">{{ item.title }}</span>
              @if (item.subtitle) {
                <span class="cmdk-item-sub">{{ item.subtitle }}</span>
              }
            </li>
          }

          @if (palette.results().length === 0) {
            <li class="cmdk-empty">No results for "{{ palette.query() }}"</li>
          }
        </ul>

        <footer class="cmdk-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> run</span>
          <span><kbd>esc</kbd> close</span>
        </footer>
      </div>
    }
  `,
  styleUrl: './cmdk.css',
})
export class CmdkComponent implements OnInit, OnDestroy {
  protected readonly palette = inject(CommandPaletteService);
  private readonly hotkeys = inject(HotkeysService);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  private _activeIndex = 0;
  protected readonly activeIndex = computed(() => {
    this.palette.results(); // track
    return this._activeIndex;
  });

  private unregister?: () => void;

  ngOnInit(): void {
    this.unregister = this.hotkeys.register({
      keys: ['mod+k', 'ctrl+k'],
      scope: 'global',
      description: 'Open command palette',
      handler: () => {
        this.palette.open() ? this.palette.hide() : this.palette.show();
        setTimeout(() => this.searchInput()?.nativeElement.focus(), 0);
      },
    });
  }

  ngOnDestroy(): void {
    this.unregister?.();
  }

  protected onInput(e: Event): void {
    this._activeIndex = 0;
    this.palette.search((e.target as HTMLInputElement).value);
  }

  protected onKeydown(e: KeyboardEvent): void {
    const max = this.palette.results().length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this._activeIndex = (this._activeIndex + 1) % max;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this._activeIndex = (this._activeIndex - 1 + max) % max;
    } else if (e.key === 'Enter') {
      const item = this.palette.results()[this._activeIndex];
      if (item) this.run(item);
    } else if (e.key === 'Escape') {
      this.palette.hide();
    }
  }

  protected run(item: { run: () => void }): void {
    this.palette.hide();
    item.run();
  }

  protected setActive(i: number): void {
    this._activeIndex = i;
  }
}
