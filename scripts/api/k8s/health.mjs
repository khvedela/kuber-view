// Health derivation logic (mirrors the original kuber-api.mjs helpers)

export function parseCpu(value = '0') {
  if (value.endsWith('n')) return Number(value.slice(0, -1)) / 1_000_000;
  if (value.endsWith('u')) return Number(value.slice(0, -1)) / 1_000;
  if (value.endsWith('m')) return Number(value.slice(0, -1));
  return Number(value) * 1000;
}

export function parseMemory(value = '0') {
  const units = { Ki: 1 / 1024, Mi: 1, Gi: 1024, Ti: 1024 * 1024, K: 1 / 1000, M: 1, G: 1000 };
  const match = String(value).match(/^([0-9.]+)([A-Za-z]+)?$/);
  if (!match) return 0;
  return Number(match[1]) * (units[match[2]] ?? 1 / (1024 * 1024));
}

export function parseTopPods(text) {
  const rows = new Map();
  for (const line of text.trim().split('\n').slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const [namespace, name, cpu, memory] = parts;
    rows.set(`${namespace}/${name}`, { cpuMillicores: parseCpu(cpu), memoryMi: parseMemory(memory) });
  }
  return rows;
}

export function parseTopNodes(text) {
  const rows = new Map();
  for (const line of text.trim().split('\n').slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    rows.set(parts[0], { cpuMillicores: parseCpu(parts[1]), cpuPercent: parts[2], memoryMi: parseMemory(parts[3]), memoryPercent: parts[4] });
  }
  return rows;
}

export function age(iso) {
  if (!iso) return '-';
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function sumRestarts(pod) {
  return [...(pod.status?.initContainerStatuses ?? []), ...(pod.status?.containerStatuses ?? [])].reduce(
    (sum, s) => sum + (s.restartCount ?? 0), 0,
  );
}

export function podReady(pod) {
  const statuses = pod.status?.containerStatuses ?? [];
  const ready = statuses.filter((s) => s.ready).length;
  return `${ready}/${statuses.length || (pod.spec?.containers ?? []).length}`;
}

function statusRank(s) { return s === 'Critical' ? 3 : s === 'Warning' ? 2 : 1; }

export function podStatus(pod) {
  const phase = pod.status?.phase ?? 'Unknown';
  const initStatuses = pod.status?.initContainerStatuses ?? [];
  const containerStatuses = pod.status?.containerStatuses ?? [];
  const waiting = [...initStatuses, ...containerStatuses].find((s) => s.state?.waiting);
  const terminated = containerStatuses.find((s) => s.state?.terminated);
  const restarts = sumRestarts(pod);
  const ready = podReady(pod);
  if (waiting) return { phase, health: 'Critical', reason: waiting.state.waiting.reason ?? 'Waiting' };
  if (terminated) return { phase, health: 'Critical', reason: terminated.state.terminated.reason ?? 'Terminated' };
  if (phase !== 'Running' && phase !== 'Succeeded') return { phase, health: 'Critical', reason: phase };
  if (ready.startsWith('0/') || restarts > 0) return { phase, health: 'Warning', reason: restarts > 0 ? `${restarts} restarts` : 'Not ready' };
  return { phase, health: 'Healthy', reason: phase };
}

export function workloadReady(item) {
  const desired = item.spec?.replicas ?? item.status?.desiredNumberScheduled ?? item.status?.parallelism ?? 0;
  const ready = item.status?.readyReplicas ?? item.status?.numberReady ?? item.status?.succeeded ?? item.status?.active ?? 0;
  return `${ready}/${desired}`;
}

export function workloadHealth(item) {
  const desired = item.spec?.replicas ?? item.status?.desiredNumberScheduled ?? 0;
  const ready = item.status?.readyReplicas ?? item.status?.numberReady ?? item.status?.succeeded ?? 0;
  const unavailable = item.status?.unavailableReplicas ?? 0;
  if (unavailable > 0 || (desired > 0 && ready === 0)) return 'Critical';
  if (desired > ready) return 'Warning';
  return 'Healthy';
}

export function namespaceSummary(namespaces, pods, podMetrics) {
  return namespaces.map((ns) => {
    const nsPods = pods.filter((p) => p.metadata?.namespace === ns.metadata?.name);
    const health = nsPods.reduce((cur, p) => {
      const next = podStatus(p).health;
      return statusRank(next) > statusRank(cur) ? next : cur;
    }, 'Healthy');
    return {
      name: ns.metadata?.name ?? '',
      phase: ns.status?.phase ?? '-',
      pods: nsPods.length,
      running: nsPods.filter((p) => p.status?.phase === 'Running').length,
      restarts: nsPods.reduce((s, p) => s + sumRestarts(p), 0),
      cpuMillicores: Math.round(nsPods.reduce((s, p) => s + (podMetrics.get(`${p.metadata?.namespace}/${p.metadata?.name}`)?.cpuMillicores ?? 0), 0)),
      memoryMi: Math.round(nsPods.reduce((s, p) => s + (podMetrics.get(`${p.metadata?.namespace}/${p.metadata?.name}`)?.memoryMi ?? 0), 0)),
      health,
    };
  });
}

export function workloadSummary(items, pods, podMetrics) {
  return items.map((item) => {
    const namespace = item.metadata?.namespace ?? '';
    const name = item.metadata?.name ?? '';
    const relatedPods = pods.filter((p) => p.metadata?.namespace === namespace && (p.metadata?.ownerReferences?.[0]?.name ?? '').startsWith(name));
    return {
      namespace, name, kind: item.kind ?? '-',
      ready: workloadReady(item), desired: item.spec?.replicas ?? item.status?.desiredNumberScheduled ?? 0,
      age: age(item.metadata?.creationTimestamp),
      restarts: relatedPods.reduce((s, p) => s + sumRestarts(p), 0),
      cpuMillicores: Math.round(relatedPods.reduce((s, p) => s + (podMetrics.get(`${namespace}/${p.metadata?.name}`)?.cpuMillicores ?? 0), 0)),
      memoryMi: Math.round(relatedPods.reduce((s, p) => s + (podMetrics.get(`${namespace}/${p.metadata?.name}`)?.memoryMi ?? 0), 0)),
      health: workloadHealth(item),
    };
  });
}

export function podSummary(items, podMetrics) {
  return items.map((pod) => {
    const namespace = pod.metadata?.namespace ?? '';
    const name = pod.metadata?.name ?? '';
    const status = podStatus(pod);
    const metrics = podMetrics.get(`${namespace}/${name}`) ?? { cpuMillicores: 0, memoryMi: 0 };
    return {
      namespace, name,
      node: pod.spec?.nodeName ?? '-',
      ip: pod.status?.podIP ?? '-',
      ready: podReady(pod),
      phase: status.phase, reason: status.reason, health: status.health,
      restarts: sumRestarts(pod),
      cpuMillicores: Math.round(metrics.cpuMillicores),
      memoryMi: Math.round(metrics.memoryMi),
      age: age(pod.metadata?.creationTimestamp),
      owner: pod.metadata?.ownerReferences?.[0]?.name ?? '-',
      containers: (pod.spec?.containers ?? []).map((c) => c.name),
    };
  });
}

export function nodeSummary(items, nodeMetrics, pods) {
  return items.map((node) => {
    const name = node.metadata?.name ?? '';
    const metrics = nodeMetrics.get(name) ?? {};
    const conditions = node.status?.conditions ?? [];
    const pressure = conditions.find((c) => ['MemoryPressure', 'DiskPressure', 'PIDPressure'].includes(c.type) && c.status === 'True');
    const ready = conditions.find((c) => c.type === 'Ready')?.status === 'True';
    return {
      name,
      role: Object.keys(node.metadata?.labels ?? {}).find((l) => l.startsWith('node-role.kubernetes.io/'))?.replace('node-role.kubernetes.io/', '') || 'worker',
      ready, health: pressure ? 'Critical' : ready ? 'Healthy' : 'Warning',
      reason: pressure?.type ?? (ready ? 'Ready' : 'NotReady'),
      cpuMillicores: Math.round(metrics.cpuMillicores ?? 0), cpuPercent: metrics.cpuPercent ?? '-',
      memoryMi: Math.round(metrics.memoryMi ?? 0), memoryPercent: metrics.memoryPercent ?? '-',
      pods: pods.filter((p) => p.spec?.nodeName === name).length,
      kubelet: node.status?.nodeInfo?.kubeletVersion ?? '-',
    };
  });
}

export function serviceSummary(items) {
  return items.map((s) => ({
    namespace: s.metadata?.namespace ?? '', name: s.metadata?.name ?? '',
    type: s.spec?.type ?? '-', clusterIp: s.spec?.clusterIP ?? '-',
    ports: (s.spec?.ports ?? []).map((p) => `${p.name ? `${p.name}:` : ''}${p.port}/${p.protocol}`).join(', '),
    selector: Object.entries(s.spec?.selector ?? {}).map(([k, v]) => `${k}=${v}`).join(', '),
  }));
}

export function eventSummary(items) {
  return items.map((e) => ({
    namespace: e.metadata?.namespace ?? e.involvedObject?.namespace ?? '',
    type: e.type ?? 'Normal', reason: e.reason ?? '-',
    object: `${e.involvedObject?.kind ?? '-'}/${e.involvedObject?.name ?? '-'}`,
    message: e.message ?? '', count: e.count ?? e.series?.count ?? 1,
    time: e.eventTime ?? e.lastTimestamp ?? e.firstTimestamp ?? e.metadata?.creationTimestamp ?? '',
  })).sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 60);
}
