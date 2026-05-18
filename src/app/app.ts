import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';

type Health = 'Healthy' | 'Warning' | 'Critical';
type RowMode = 'all' | 'unhealthy' | 'system';
type MainView = 'pods' | 'workloads' | 'events' | 'services' | 'crds';
type InspectorMode = 'split' | 'tabs';

interface ClusterTotals {
  namespaces: number;
  pods: number;
  runningPods: number;
  warnings: number;
  critical: number;
  restarts: number;
  cpuMillicores: number;
  memoryMi: number;
}

interface NamespaceRow {
  name: string;
  phase: string;
  pods: number;
  running: number;
  restarts: number;
  cpuMillicores: number;
  memoryMi: number;
  health: Health;
}

interface WorkloadRow {
  namespace: string;
  name: string;
  kind: string;
  ready: string;
  desired: number;
  age: string;
  restarts: number;
  cpuMillicores: number;
  memoryMi: number;
  health: Health;
}

interface PodRow {
  namespace: string;
  name: string;
  node: string;
  ip: string;
  ready: string;
  phase: string;
  reason: string;
  health: Health;
  restarts: number;
  cpuMillicores: number;
  memoryMi: number;
  age: string;
  owner: string;
  containers: string[];
}

interface NodeRow {
  name: string;
  role: string;
  ready: boolean;
  health: Health;
  reason: string;
  cpuMillicores: number;
  cpuPercent: string;
  memoryMi: number;
  memoryPercent: string;
  pods: number;
  kubelet: string;
}

interface ServiceRow {
  namespace: string;
  name: string;
  type: string;
  clusterIp: string;
  ports: string;
  selector: string;
}

interface EventRow {
  namespace: string;
  type: string;
  reason: string;
  object: string;
  message: string;
  count: number;
  time: string;
}

interface CustomResourceRow {
  namespace: string;
  name: string;
  kind: string;
  age: string;
  spec: Record<string, unknown>;
  status: Record<string, unknown>;
}

interface ClusterSnapshot {
  context: string;
  generatedAt: string;
  totals: ClusterTotals;
  namespaces: NamespaceRow[];
  workloads: WorkloadRow[];
  pods: PodRow[];
  nodes: NodeRow[];
  services: ServiceRow[];
  events: EventRow[];
  logPanes: { namespace: string; pod: string; title: string; lines: string[] }[];
  upfPools: CustomResourceRow[];
  decisions: CustomResourceRow[];
}

interface PodLogState {
  lines: string[];
  loading: boolean;
  error: string;
  generatedAt: string;
}

const emptySnapshot: ClusterSnapshot = {
  context: '-',
  generatedAt: '',
  totals: {
    namespaces: 0,
    pods: 0,
    runningPods: 0,
    warnings: 0,
    critical: 0,
    restarts: 0,
    cpuMillicores: 0,
    memoryMi: 0,
  },
  namespaces: [],
  workloads: [],
  pods: [],
  nodes: [],
  services: [],
  events: [],
  logPanes: [],
  upfPools: [],
  decisions: [],
};

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly http = inject(HttpClient);
  private readonly apiBase = 'http://127.0.0.1:4201/api';

  protected readonly snapshot = signal<ClusterSnapshot>(emptySnapshot);
  protected readonly activeNamespace = signal('o5gs-dev');
  protected readonly rowMode = signal<RowMode>('all');
  protected readonly mainView = signal<MainView>('pods');
  protected readonly inspectorMode = signal<InspectorMode>('split');
  protected readonly query = signal('');
  protected readonly autoRefresh = signal(true);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly openedPodKeys = signal<string[]>([]);
  protected readonly activePodKey = signal('');
  protected readonly podLogs = signal<Record<string, PodLogState>>({});

  protected readonly visibleNamespaces = computed(() => {
    const rows = this.snapshot().namespaces;
    if (this.rowMode() === 'system') return rows;
    return rows.filter((row) => !row.name.startsWith('kube-'));
  });

  protected readonly visiblePods = computed(() => {
    const namespace = this.activeNamespace();
    const query = this.query().toLowerCase().trim();
    const mode = this.rowMode();

    return this.snapshot().pods.filter((row) => {
      const namespaceMatch = namespace === 'all' || row.namespace === namespace;
      const systemMatch = mode === 'system' || !row.namespace.startsWith('kube-');
      const healthMatch = mode !== 'unhealthy' || row.health !== 'Healthy' || row.restarts > 0;
      const queryMatch =
        !query ||
        row.name.toLowerCase().includes(query) ||
        row.namespace.toLowerCase().includes(query) ||
        row.node.toLowerCase().includes(query) ||
        row.owner.toLowerCase().includes(query) ||
        row.phase.toLowerCase().includes(query);

      return namespaceMatch && systemMatch && healthMatch && queryMatch;
    });
  });

  protected readonly visibleWorkloads = computed(() => {
    const namespace = this.activeNamespace();
    const query = this.query().toLowerCase().trim();
    const mode = this.rowMode();

    return this.snapshot().workloads.filter((row) => {
      const namespaceMatch = namespace === 'all' || row.namespace === namespace;
      const systemMatch = mode === 'system' || !row.namespace.startsWith('kube-');
      const healthMatch = mode !== 'unhealthy' || row.health !== 'Healthy' || row.restarts > 0;
      const queryMatch =
        !query ||
        row.name.toLowerCase().includes(query) ||
        row.namespace.toLowerCase().includes(query) ||
        row.kind.toLowerCase().includes(query);

      return namespaceMatch && systemMatch && healthMatch && queryMatch;
    });
  });

  protected readonly namespaceEvents = computed(() => {
    const namespace = this.activeNamespace();
    return this.snapshot()
      .events.filter((event) => namespace === 'all' || event.namespace === namespace)
      .slice(0, 80);
  });

  protected readonly namespaceServices = computed(() => {
    const namespace = this.activeNamespace();
    return this.snapshot().services.filter((service) => namespace === 'all' || service.namespace === namespace);
  });

  protected readonly openedPods = computed(() => {
    return this.openedPodKeys()
      .map((key) => this.snapshot().pods.find((pod) => this.podKey(pod) === key))
      .filter((pod): pod is PodRow => Boolean(pod));
  });

  protected readonly activePod = computed(() => {
    return this.openedPods().find((pod) => this.podKey(pod) === this.activePodKey()) ?? this.openedPods()[0];
  });

  protected readonly effectiveInspectorMode = computed<InspectorMode>(() => {
    if (this.openedPods().length > 3) return 'tabs';
    return this.inspectorMode();
  });

  protected readonly visibleInspectorPods = computed(() => {
    if (this.effectiveInspectorMode() === 'tabs') {
      const active = this.activePod();
      return active ? [active] : [];
    }
    return this.openedPods().slice(0, 3);
  });

  protected readonly densityMetrics = computed(() => {
    const totals = this.snapshot().totals;
    return [
      {
        label: 'Pods',
        value: `${totals.runningPods}/${totals.pods}`,
        detail: 'running/total',
        health: totals.critical > 0 ? 'Critical' : totals.warnings > 0 ? 'Warning' : 'Healthy',
      },
      {
        label: 'CPU',
        value: this.cpu(totals.cpuMillicores),
        detail: 'live pod usage',
        health: totals.cpuMillicores > 6500 ? 'Warning' : 'Healthy',
      },
      {
        label: 'Memory',
        value: this.memory(totals.memoryMi),
        detail: 'live pod usage',
        health: totals.memoryMi > 7000 ? 'Warning' : 'Healthy',
      },
      {
        label: 'Restarts',
        value: `${totals.restarts}`,
        detail: `${totals.warnings} warn / ${totals.critical} critical`,
        health: totals.critical > 0 ? 'Critical' : totals.restarts > 0 ? 'Warning' : 'Healthy',
      },
    ];
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

  protected refresh(): void {
    this.loading.set(true);
    this.http.get<ClusterSnapshot>(`${this.apiBase}/snapshot`).subscribe({
      next: (snapshot) => {
        this.snapshot.set(snapshot);
        this.pruneClosedPods();

        if (this.openedPodKeys().length === 0) {
          const firstPod =
            snapshot.pods.find((pod) => pod.namespace === 'o5gs-dev' && pod.name.startsWith('open5gs-upf')) ??
            snapshot.pods.find((pod) => pod.namespace === 'o5gs-dev') ??
            snapshot.pods[0];
          if (firstPod) this.openPod(firstPod);
        }

        this.error.set('');
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.hint ?? error?.message ?? 'Unable to load Kubernetes snapshot.');
        this.loading.set(false);
      },
    });
  }

  protected openPod(pod: PodRow): void {
    const key = this.podKey(pod);
    this.openedPodKeys.update((keys) => (keys.includes(key) ? keys : [...keys, key]));
    this.activePodKey.set(key);
    this.fetchPodLogs(pod);
  }

  protected closePod(event: Event, pod: PodRow): void {
    event.stopPropagation();
    const key = this.podKey(pod);
    this.openedPodKeys.update((keys) => keys.filter((item) => item !== key));
    this.podLogs.update((logs) => {
      const next = { ...logs };
      delete next[key];
      return next;
    });

    if (this.activePodKey() === key) {
      this.activePodKey.set(this.openedPodKeys()[0] ?? '');
    }
  }

  protected activatePod(pod: PodRow): void {
    this.activePodKey.set(this.podKey(pod));
    this.fetchPodLogs(pod);
  }

  protected refreshPod(event: Event, pod: PodRow): void {
    event.stopPropagation();
    this.fetchPodLogs(pod, true);
  }

  protected setNamespace(namespace: string): void {
    this.activeNamespace.set(namespace);
  }

  protected setMode(mode: RowMode): void {
    this.rowMode.set(mode);
  }

  protected setMainView(view: MainView): void {
    this.mainView.set(view);
  }

  protected setInspectorMode(mode: InspectorMode): void {
    this.inspectorMode.set(mode);
  }

  protected setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected toggleAutoRefresh(): void {
    this.autoRefresh.update((value) => !value);
  }

  protected podKey(pod: Pick<PodRow, 'namespace' | 'name'>): string {
    return `${pod.namespace}/${pod.name}`;
  }

  protected podLogState(pod: PodRow): PodLogState {
    return this.podLogs()[this.podKey(pod)] ?? { lines: [], loading: false, error: '', generatedAt: '' };
  }

  protected logTime(line: string): string {
    const match = line.match(/^\S+\s+([0-9T:.-]+Z?)\s+/);
    const value = match?.[1] ?? line.match(/^([0-9T:.-]+Z?)\s+/)?.[1] ?? '';
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value.slice(0, 12) : date.toLocaleTimeString([], { hour12: false });
  }

  protected logSource(line: string): string {
    return line.match(/^\[pod\/([^\]]+)\]/)?.[1] ?? line.match(/^\S+\s+\[pod\/([^\]]+)\]/)?.[1] ?? '';
  }

  protected logMessage(line: string): string {
    return line
      .replace(/^\S+\s+[0-9T:.-]+Z?\s+/, '')
      .replace(/^\[pod\/[^\]]+\]\s+/, '')
      .trim();
  }

  protected logLevel(line: string): string {
    const lower = line.toLowerCase();
    if (lower.includes('error') || lower.includes('fail') || lower.includes('panic')) return 'log-error';
    if (lower.includes('warn') || lower.includes('invalid') || lower.includes('timeout')) return 'log-warn';
    if (lower.includes('info') || lower.includes('associated') || lower.includes('connected')) return 'log-info';
    return 'log-neutral';
  }

  protected statusClass(status: Health | string): string {
    switch (status) {
      case 'Critical':
      case 'Warning':
        return `status-${status.toLowerCase()}`;
      default:
        return 'status-healthy';
    }
  }

  protected eventClass(type: string): string {
    return type === 'Warning' ? 'status-warning' : 'status-healthy';
  }

  protected cpu(value: number): string {
    if (value >= 1000) return `${(value / 1000).toFixed(2)} cores`;
    return `${Math.round(value)}m`;
  }

  protected memory(value: number): string {
    if (value >= 1024) return `${(value / 1024).toFixed(2)} Gi`;
    return `${Math.round(value)} Mi`;
  }

  protected asJson(value: unknown): string {
    return JSON.stringify(value ?? {}, null, 2);
  }

  protected shortTime(value: string): string {
    if (!value) return '-';
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  private fetchPodLogs(pod: PodRow, force = false): void {
    const key = this.podKey(pod);
    const current = this.podLogs()[key];
    if (current?.loading || (!force && current?.lines.length)) return;

    this.podLogs.update((logs) => ({
      ...logs,
      [key]: { lines: current?.lines ?? [], loading: true, error: '', generatedAt: current?.generatedAt ?? '' },
    }));

    const namespace = encodeURIComponent(pod.namespace);
    const name = encodeURIComponent(pod.name);
    this.http.get<PodLogState>(`${this.apiBase}/logs?namespace=${namespace}&pod=${name}&tail=260`).subscribe({
      next: (state) => {
        this.podLogs.update((logs) => ({
          ...logs,
          [key]: { lines: state.lines ?? [], loading: false, error: '', generatedAt: state.generatedAt ?? '' },
        }));
      },
      error: (error) => {
        this.podLogs.update((logs) => ({
          ...logs,
          [key]: {
            lines: current?.lines ?? [],
            loading: false,
            error: error?.error?.error ?? error?.message ?? 'Unable to load logs.',
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
    const currentKeys = new Set(this.snapshot().pods.map((pod) => this.podKey(pod)));
    this.openedPodKeys.update((keys) => keys.filter((key) => currentKeys.has(key)));
    if (this.activePodKey() && !currentKeys.has(this.activePodKey())) {
      this.activePodKey.set(this.openedPodKeys()[0] ?? '');
    }
  }
}
