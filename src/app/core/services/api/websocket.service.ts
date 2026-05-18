import { Injectable, signal, OnDestroy } from '@angular/core';
import { Subject, Observable, filter, map } from 'rxjs';
import type { WsEnvelope } from '../../models/cluster';

type SocketState = 'connecting' | 'open' | 'reconnecting' | 'down';

const WS_URL = 'ws://127.0.0.1:4201/ws';
const BACKOFF = [1000, 2000, 5000, 10000, 30000];
const PING_INTERVAL = 15000;
const PING_TIMEOUT = 30000;

@Injectable({ providedIn: 'root' })
export class WebsocketService implements OnDestroy {
  readonly state = signal<SocketState>('connecting');

  private socket: WebSocket | null = null;
  private readonly messages$ = new Subject<WsEnvelope>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private channelCounter = 0;

  constructor() {
    this.connect();
  }

  subscribe(
    channel: WsEnvelope['channel'],
    params?: Record<string, unknown>,
  ): Observable<WsEnvelope> {
    const id = `ch-${++this.channelCounter}`;
    this.send({ id, type: 'sub', channel, params });
    return this.messages$.pipe(
      filter((m) => m.channel === channel),
    );
  }

  send(envelope: WsEnvelope): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(envelope));
    }
  }

  ngOnDestroy(): void {
    this.cleanup();
    this.socket?.close();
  }

  private connect(): void {
    this.state.set(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
    try {
      this.socket = new WebSocket(WS_URL);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.socket.onopen = () => {
      this.state.set('open');
      this.reconnectAttempt = 0;
      this.startPing();
    };

    this.socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as WsEnvelope;
        if (msg.type === 'pong') {
          if (this.pongTimer) clearTimeout(this.pongTimer);
          return;
        }
        this.messages$.next(msg);
      } catch {
        // malformed frame
      }
    };

    this.socket.onclose = () => {
      this.stopPing();
      this.scheduleReconnect();
    };

    this.socket.onerror = () => {
      this.socket?.close();
    };
  }

  private scheduleReconnect(): void {
    this.state.set('reconnecting');
    const delay = BACKOFF[Math.min(this.reconnectAttempt, BACKOFF.length - 1)];
    const jitter = delay * 0.2 * (Math.random() - 0.5);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempt++;
      this.connect();
    }, delay + jitter);
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping' });
      this.pongTimer = setTimeout(() => {
        this.socket?.close();
      }, PING_TIMEOUT);
    }, PING_INTERVAL);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
  }

  private cleanup(): void {
    this.stopPing();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
  }
}
