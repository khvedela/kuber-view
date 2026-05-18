import { Injectable, inject, signal } from '@angular/core';
import { WebsocketService } from './websocket.service';
import { KubeApiService } from './kube-api.service';
import type { WsEnvelope } from '../../models/cluster';

export interface LogStreamState {
  lines: string[];
  loading: boolean;
  error: string;
  generatedAt: string;
  following: boolean;
}

const EMPTY: LogStreamState = { lines: [], loading: false, error: '', generatedAt: '', following: false };
const MAX_LINES = 2000;

@Injectable({ providedIn: 'root' })
export class LogStreamService {
  private readonly ws = inject(WebsocketService);
  private readonly api = inject(KubeApiService);

  private readonly states = new Map<string, ReturnType<typeof signal<LogStreamState>>>();
  private readonly refCounts = new Map<string, number>();
  private readonly subs = new Map<string, ReturnType<typeof this.ws.subscribe>>();

  getState(key: string) {
    if (!this.states.has(key)) {
      this.states.set(key, signal({ ...EMPTY }));
    }
    return this.states.get(key)!;
  }

  fetchOnce(namespace: string, pod: string, force = false): void {
    const key = `${namespace}/${pod}`;
    const state = this.getState(key);
    const current = state();
    if (current.loading || (!force && current.lines.length)) return;

    state.update((s) => ({ ...s, loading: true, error: '' }));

    this.api.getLogs(namespace, pod).subscribe({
      next: (res) => {
        state.set({
          lines: res.lines ?? [],
          loading: false,
          error: '',
          generatedAt: res.generatedAt ?? '',
          following: false,
        });
      },
      error: (err: { error?: { error?: string }; message?: string }) => {
        state.update((s) => ({
          ...s,
          loading: false,
          error: err?.error?.error ?? err?.message ?? 'Unable to load logs.',
        }));
      },
    });
  }

  follow(namespace: string, pod: string): void {
    const key = `${namespace}/${pod}`;
    const count = (this.refCounts.get(key) ?? 0) + 1;
    this.refCounts.set(key, count);
    if (count > 1) return;

    const state = this.getState(key);
    state.update((s) => ({ ...s, following: true }));

    const sub = this.ws.subscribe('logs', { namespace, pod });
    this.subs.set(key, sub);

    sub.subscribe((msg: WsEnvelope) => {
      if (msg.type !== 'event') return;
      const line = msg.payload as string;
      if (!line) return;
      state.update((s) => ({
        ...s,
        lines: s.lines.length >= MAX_LINES
          ? [...s.lines.slice(-MAX_LINES + 1), line]
          : [...s.lines, line],
        generatedAt: new Date().toISOString(),
      }));
    });
  }

  unfollow(namespace: string, pod: string): void {
    const key = `${namespace}/${pod}`;
    const count = (this.refCounts.get(key) ?? 1) - 1;
    this.refCounts.set(key, count);
    if (count > 0) return;

    this.refCounts.delete(key);
    this.subs.delete(key);
    const state = this.getState(key);
    state.update((s) => ({ ...s, following: false }));
  }

  clear(key: string): void {
    this.states.delete(key);
    this.refCounts.delete(key);
    this.subs.delete(key);
  }
}
