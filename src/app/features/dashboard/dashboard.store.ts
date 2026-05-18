import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { KubeApiService } from '../../core/services/api/kube-api.service';
import { NotificationService } from '../../core/services/ui/notification.service';
import type {
  ClusterSnapshot,
  Density,
  InspectorMode,
  MainView,
  PodLogState,
  PodRow,
  RowMode,
  Theme,
  WorkloadRow,
} from '../../core/models/cluster';
import { EMPTY_SNAPSHOT } from '../../core/models/cluster';
import { ThemeService } from '../../core/services/ui/theme.service';

@Injectable()
export class DashboardStore {
  private readonly api = inject(KubeApiService);
  readonly #theme = inject(ThemeService);

  // ── Persisted theme/density ──────────────────────────────────────────────
  readonly theme = this.#theme.theme;
  readonly density = this.#theme.density;

  // ── Cluster data ─────────────────────────────────────────────────────────
  readonly snapshot = signal<ClusterSnapshot>(EMPTY_SNAPSHOT);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly autoRefresh = signal(true);

  // ── UI state ─────────────────────────────────────────────────────────────
  readonly activeNamespace = signal('o5gs-dev');
  readonly rowMode = signal<RowMode>('all');
  readonly mainView = signal<MainView>('pods');
  readonly inspectorMode = signal<InspectorMode>('split');
  readonly query = signal('');

  // ── Pod inspector ─────────────────────────────────────────────────────────
  readonly openedPodKeys = signal<string[]>([]);
  readonly activePodKey = signal('');
  readonly podLogs = signal<Record<string, PodLogState>>({});

  // ── Derived ───────────────────────────────────────────────────────────────
  readonly visibleNamespaces = computed(() => {
    const rows = this.snapshot().namespaces;
    if (this.rowMode() === 'system') return rows;
    return rows.filter((r) => !r.name.startsWith('kube-'));
  });

  readonly visiblePods = computed(() => {
    const namespace = this.activeNamespace();
    const query = this.query().toLowerCase().trim();
    const mode = this.rowMode();
    return this.snapshot().pods.filter((r) => {
      const nsMatch = namespace === 'all' || r.namespace === namespace;
      const sysMatch = mode === 'system' || !r.namespace.startsWith('kube-');
      const healthMatch = mode !== 'unhealthy' || r.health !== 'Healthy' || r.restarts > 0;
      const queryMatch =
        !query ||
        r.name.toLowerCase().includes(query) ||
        r.namespace.toLowerCase().includes(query) ||
        r.node.toLowerCase().includes(query) ||
        r.owner.toLowerCase().includes(query) ||
        r.phase.toLowerCase().includes(query);
      return nsMatch && sysMatch && healthMatch && queryMatch;
    });
  });

  readonly visibleWorkloads = computed(() => {
    const namespace = this.activeNamespace();
    const query = this.query().toLowerCase().trim();
    const mode = this.rowMode();
    return this.snapshot().workloads.filter((r) => {
      const nsMatch = namespace === 'all' || r.namespace === namespace;
      const sysMatch = mode === 'system' || !r.namespace.startsWith('kube-');
      const healthMatch = mode !== 'unhealthy' || r.health !== 'Healthy' || r.restarts > 0;
      const queryMatch =
        !query ||
        r.name.toLowerCase().includes(query) ||
        r.namespace.toLowerCase().includes(query) ||
        r.kind.toLowerCase().includes(query);
      return nsMatch && sysMatch && healthMatch && queryMatch;
    });
  });

  readonly namespaceEvents = computed(() => {
    const ns = this.activeNamespace();
    return this.snapshot()
      .events.filter((e) => ns === 'all' || e.namespace === ns)
      .slice(0, 80);
  });

  readonly namespaceServices = computed(() => {
    const ns = this.activeNamespace();
    return this.snapshot().services.filter((s) => ns === 'all' || s.namespace === ns);
  });

  readonly openedPods = computed(() =>
    this.openedPodKeys()
      .map((key) => this.snapshot().pods.find((p) => this.podKey(p) === key))
      .filter((p): p is PodRow => Boolean(p)),
  );

  readonly activePod = computed(
    () =>
      this.openedPods().find((p) => this.podKey(p) === this.activePodKey()) ??
      this.openedPods()[0],
  );

  readonly effectiveInspectorMode = computed<InspectorMode>(() =>
    this.openedPods().length > 3 ? 'tabs' : this.inspectorMode(),
  );

  readonly visibleInspectorPods = computed(() => {
    if (this.effectiveInspectorMode() === 'tabs') {
      const active = this.activePod();
      return active ? [active] : [];
    }
    return this.openedPods().slice(0, 3);
  });

  readonly densityMetrics = computed(() => {
    const t = this.snapshot().totals;
    return [
      {
        label: 'Pods',
        value: `${t.runningPods}/${t.pods}`,
        detail: 'running/total',
        health: t.critical > 0 ? 'Critical' : t.warnings > 0 ? 'Warning' : 'Healthy',
      },
      {
        label: 'CPU',
        value: this.formatCpu(t.cpuMillicores),
        detail: 'live pod usage',
        health: t.cpuMillicores > 6500 ? 'Warning' : 'Healthy',
      },
      {
        label: 'Memory',
        value: this.formatMemory(t.memoryMi),
        detail: 'live pod usage',
        health: t.memoryMi > 7000 ? 'Warning' : 'Healthy',
      },
      {
        label: 'Restarts',
        value: `${t.restarts}`,
        detail: `${t.warnings} warn / ${t.critical} critical`,
        health: t.critical > 0 ? 'Critical' : t.restarts > 0 ? 'Warning' : 'Healthy',
      },
    ] as const;
  });

  constructor() {
    this.refresh();
    interval(10000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this.autoRefresh()) {
          this.refresh();
          this.refreshOpenedLogs();
        }
      });
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  refresh(): void {
    this.loading.set(true);
    this.api.getSnapshot().subscribe({
      next: (snap) => {
        this.snapshot.set(snap);
        this.pruneClosedPods();

        if (this.openedPodKeys().length === 0) {
          const firstPod =
            snap.pods.find((p) => p.namespace === 'o5gs-dev' && p.name.startsWith('open5gs-upf')) ??
            snap.pods.find((p) => p.namespace === 'o5gs-dev') ??
            snap.pods[0];
          if (firstPod) this.openPod(firstPod);
        }

        this.error.set('');
        this.loading.set(false);
      },
      error: (err: { error?: { hint?: string }; message?: string }) => {
        this.error.set(
          err?.error?.hint ?? err?.message ?? 'Unable to load Kubernetes snapshot.',
        );
        this.loading.set(false);
      },
    });
  }

  setNamespace(ns: string): void { this.activeNamespace.set(ns); }
  setMode(mode: RowMode): void { this.rowMode.set(mode); }
  setMainView(view: MainView): void { this.mainView.set(view); }
  setInspectorMode(mode: InspectorMode): void { this.inspectorMode.set(mode); }
  setQuery(q: string): void { this.query.set(q); }
  toggleAutoRefresh(): void { this.autoRefresh.update((v) => !v); }
  setTheme(t: Theme): void { this.#theme.setTheme(t); }
  setDensity(d: Density): void { this.#theme.setDensity(d); }

  openPod(pod: PodRow): void {
    const key = this.podKey(pod);
    this.openedPodKeys.update((keys) => (keys.includes(key) ? keys : [...keys, key]));
    this.activePodKey.set(key);
    this.fetchPodLogs(pod);
  }

  closePod(pod: PodRow): void {
    const key = this.podKey(pod);
    this.openedPodKeys.update((keys) => keys.filter((k) => k !== key));
    this.podLogs.update((logs) => {
      const next = { ...logs };
      delete next[key];
      return next;
    });
    if (this.activePodKey() === key) {
      this.activePodKey.set(this.openedPodKeys()[0] ?? '');
    }
  }

  activatePod(pod: PodRow): void {
    this.activePodKey.set(this.podKey(pod));
    this.fetchPodLogs(pod);
  }

  refreshPod(pod: PodRow): void {
    this.fetchPodLogs(pod, true);
  }

  podKey(pod: Pick<PodRow, 'namespace' | 'name'>): string {
    return `${pod.namespace}/${pod.name}`;
  }

  podLogState(pod: PodRow): PodLogState {
    return (
      this.podLogs()[this.podKey(pod)] ?? {
        lines: [],
        loading: false,
        error: '',
        generatedAt: '',
      }
    );
  }

  // ── Formatting helpers (used by store-derived metrics) ────────────────────

  private formatCpu(value: number): string {
    if (value >= 1000) return `${(value / 1000).toFixed(2)} cores`;
    return `${Math.round(value)}m`;
  }

  private formatMemory(value: number): string {
    if (value >= 1024) return `${(value / 1024).toFixed(2)} Gi`;
    return `${Math.round(value)} Mi`;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private fetchPodLogs(pod: PodRow, force = false): void {
    const key = this.podKey(pod);
    const current = this.podLogs()[key];
    if (current?.loading || (!force && current?.lines.length)) return;

    this.podLogs.update((logs) => ({
      ...logs,
      [key]: {
        lines: current?.lines ?? [],
        loading: true,
        error: '',
        generatedAt: current?.generatedAt ?? '',
      },
    }));

    this.api.getLogs(pod.namespace, pod.name).subscribe({
      next: (state) => {
        this.podLogs.update((logs) => ({
          ...logs,
          [key]: {
            lines: state.lines ?? [],
            loading: false,
            error: '',
            generatedAt: state.generatedAt ?? '',
          },
        }));
      },
      error: (err: { error?: { error?: string }; message?: string }) => {
        this.podLogs.update((logs) => ({
          ...logs,
          [key]: {
            lines: current?.lines ?? [],
            loading: false,
            error: err?.error?.error ?? err?.message ?? 'Unable to load logs.',
            generatedAt: current?.generatedAt ?? '',
          },
        }));
      },
    });
  }

  private refreshOpenedLogs(): void {
    for (const pod of this.openedPods()) {
      this.fetchPodLogs(pod, true);
    }
  }

  private pruneClosedPods(): void {
    const currentKeys = new Set(this.snapshot().pods.map((p) => this.podKey(p)));
    this.openedPodKeys.update((keys) => keys.filter((k) => currentKeys.has(k)));
    if (this.activePodKey() && !currentKeys.has(this.activePodKey())) {
      this.activePodKey.set(this.openedPodKeys()[0] ?? '');
    }
  }
}
