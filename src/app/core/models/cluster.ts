export type Health = 'Healthy' | 'Warning' | 'Critical';
export type RowMode = 'all' | 'unhealthy' | 'system';
export type MainView = 'pods' | 'workloads' | 'nodes' | 'events' | 'services' | 'crds';
export type InspectorMode = 'split' | 'tabs';
export type Theme = 'dark' | 'light' | 'midnight' | 'hicontrast' | 'system';
export type Density = 'comfortable' | 'compact' | 'mega-compact';

export interface ClusterTotals {
  namespaces: number;
  pods: number;
  runningPods: number;
  warnings: number;
  critical: number;
  restarts: number;
  cpuMillicores: number;
  memoryMi: number;
}

export interface NamespaceRow {
  name: string;
  phase: string;
  pods: number;
  running: number;
  restarts: number;
  cpuMillicores: number;
  memoryMi: number;
  health: Health;
}

export interface WorkloadRow {
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

export interface PodRow {
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

export interface NodeRow {
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

export interface ServiceRow {
  namespace: string;
  name: string;
  type: string;
  clusterIp: string;
  ports: string;
  selector: string;
}

export interface EventRow {
  namespace: string;
  type: string;
  reason: string;
  object: string;
  message: string;
  count: number;
  time: string;
}

export interface CustomResourceRow {
  namespace: string;
  name: string;
  kind: string;
  age: string;
  spec: Record<string, unknown>;
  status: Record<string, unknown>;
}

export interface LogPane {
  namespace: string;
  pod: string;
  title: string;
  lines: string[];
}

export interface ClusterSnapshot {
  context: string;
  generatedAt: string;
  totals: ClusterTotals;
  namespaces: NamespaceRow[];
  workloads: WorkloadRow[];
  pods: PodRow[];
  nodes: NodeRow[];
  services: ServiceRow[];
  events: EventRow[];
  logPanes: LogPane[];
  upfPools: CustomResourceRow[];
  decisions: CustomResourceRow[];
}

export interface PodLogState {
  lines: string[];
  loading: boolean;
  error: string;
  generatedAt: string;
}

export const EMPTY_SNAPSHOT: ClusterSnapshot = {
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

export interface WsEnvelope {
  id?: string;
  type: 'sub' | 'unsub' | 'ping' | 'pong' | 'event' | 'error' | 'ack';
  channel?: 'watch' | 'logs' | 'metrics' | 'exec' | 'pf' | 'events';
  params?: Record<string, unknown>;
  seq?: number;
  payload?: unknown;
  code?: string;
  message?: string;
}

export interface WatchDelta {
  op: 'ADDED' | 'MODIFIED' | 'DELETED';
  obj: Record<string, unknown>;
}

export interface PortForward {
  id: string;
  namespace: string;
  pod: string;
  podPort: number;
  localPort: number;
  label: string;
  active: boolean;
}

export interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  keywords?: string[];
  icon?: string;
  scope?: string;
  run: () => void;
}

export interface HistoryEntry {
  id: string;
  ts: string;
  verb: string;
  resource: string;
  namespace?: string;
  summary: string;
  payload?: unknown;
}
