import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { URL } from 'node:url';

const execFileAsync = promisify(execFile);
const port = Number(process.env.KUBER_VIEW_API_PORT ?? 4201);
const timeout = Number(process.env.KUBER_VIEW_KUBECTL_TIMEOUT_MS ?? 9000);

const jsonHeaders = {
  'access-control-allow-origin': 'http://127.0.0.1:4200',
  'access-control-allow-methods': 'GET,OPTIONS',
  'access-control-allow-headers': 'content-type',
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
};

async function kubectl(args, options = {}) {
  try {
    const { stdout } = await execFileAsync('kubectl', args, {
      timeout,
      maxBuffer: 1024 * 1024 * 20,
    });

    if (options.json) {
      return JSON.parse(stdout);
    }

    return stdout;
  } catch (error) {
    if (options.optional) {
      return options.json ? { items: [], error: error.message } : '';
    }

    throw error;
  }
}

function parseCpu(value = '0') {
  if (value.endsWith('n')) return Number(value.slice(0, -1)) / 1_000_000;
  if (value.endsWith('u')) return Number(value.slice(0, -1)) / 1_000;
  if (value.endsWith('m')) return Number(value.slice(0, -1));
  return Number(value) * 1000;
}

function parseMemory(value = '0') {
  const units = {
    Ki: 1 / 1024,
    Mi: 1,
    Gi: 1024,
    Ti: 1024 * 1024,
    K: 1 / 1000,
    M: 1,
    G: 1000,
  };
  const match = String(value).match(/^([0-9.]+)([A-Za-z]+)?$/);
  if (!match) return 0;
  return Number(match[1]) * (units[match[2]] ?? 1 / (1024 * 1024));
}

function parseTopPods(text) {
  const rows = new Map();
  for (const line of text.trim().split('\n').slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const [namespace, name, cpu, memory] = parts;
    rows.set(`${namespace}/${name}`, {
      cpuMillicores: parseCpu(cpu),
      memoryMi: parseMemory(memory),
    });
  }
  return rows;
}

function parseTopNodes(text) {
  const rows = new Map();
  for (const line of text.trim().split('\n').slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    rows.set(parts[0], {
      cpuMillicores: parseCpu(parts[1]),
      cpuPercent: parts[2],
      memoryMi: parseMemory(parts[3]),
      memoryPercent: parts[4],
    });
  }
  return rows;
}

function age(iso) {
  if (!iso) return '-';
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function sumRestarts(pod) {
  return [...(pod.status?.initContainerStatuses ?? []), ...(pod.status?.containerStatuses ?? [])].reduce(
    (sum, status) => sum + (status.restartCount ?? 0),
    0,
  );
}

function podReady(pod) {
  const statuses = pod.status?.containerStatuses ?? [];
  const ready = statuses.filter((status) => status.ready).length;
  return `${ready}/${statuses.length || (pod.spec?.containers ?? []).length}`;
}

function statusRank(status) {
  if (status === 'Critical') return 3;
  if (status === 'Warning') return 2;
  return 1;
}

function podStatus(pod) {
  const phase = pod.status?.phase ?? 'Unknown';
  const initStatuses = pod.status?.initContainerStatuses ?? [];
  const containerStatuses = pod.status?.containerStatuses ?? [];
  const waiting = [...initStatuses, ...containerStatuses].find((status) => status.state?.waiting);
  const terminated = containerStatuses.find((status) => status.state?.terminated);
  const ready = podReady(pod);
  const restarts = sumRestarts(pod);

  if (waiting) {
    return { phase, health: 'Critical', reason: waiting.state.waiting.reason ?? 'Waiting' };
  }
  if (terminated) {
    return { phase, health: 'Critical', reason: terminated.state.terminated.reason ?? 'Terminated' };
  }
  if (phase !== 'Running' && phase !== 'Succeeded') {
    return { phase, health: 'Critical', reason: phase };
  }
  if (ready.startsWith('0/') || restarts > 0) {
    return { phase, health: 'Warning', reason: restarts > 0 ? `${restarts} restarts` : 'Not ready' };
  }

  return { phase, health: 'Healthy', reason: phase };
}

function workloadReady(item) {
  const desired = item.spec?.replicas ?? item.status?.desiredNumberScheduled ?? item.status?.parallelism ?? 0;
  const ready =
    item.status?.readyReplicas ??
    item.status?.numberReady ??
    item.status?.succeeded ??
    item.status?.active ??
    0;
  return `${ready}/${desired}`;
}

function workloadHealth(item) {
  const desired = item.spec?.replicas ?? item.status?.desiredNumberScheduled ?? 0;
  const ready = item.status?.readyReplicas ?? item.status?.numberReady ?? item.status?.succeeded ?? 0;
  const unavailable = item.status?.unavailableReplicas ?? 0;
  if (unavailable > 0 || (desired > 0 && ready === 0)) return 'Critical';
  if (desired > ready) return 'Warning';
  return 'Healthy';
}

function ownerName(pod) {
  return pod.metadata?.ownerReferences?.[0]?.name ?? '-';
}

function namespaceSummary(namespaces, pods, podMetrics) {
  return namespaces.map((namespace) => {
    const nsPods = pods.filter((pod) => pod.metadata?.namespace === namespace.metadata?.name);
    const health = nsPods.reduce((current, pod) => {
      const next = podStatus(pod).health;
      return statusRank(next) > statusRank(current) ? next : current;
    }, 'Healthy');
    return {
      name: namespace.metadata?.name ?? '',
      phase: namespace.status?.phase ?? '-',
      pods: nsPods.length,
      running: nsPods.filter((pod) => pod.status?.phase === 'Running').length,
      restarts: nsPods.reduce((sum, pod) => sum + sumRestarts(pod), 0),
      cpuMillicores: Math.round(
        nsPods.reduce((sum, pod) => sum + (podMetrics.get(`${pod.metadata?.namespace}/${pod.metadata?.name}`)?.cpuMillicores ?? 0), 0),
      ),
      memoryMi: Math.round(
        nsPods.reduce((sum, pod) => sum + (podMetrics.get(`${pod.metadata?.namespace}/${pod.metadata?.name}`)?.memoryMi ?? 0), 0),
      ),
      health,
    };
  });
}

function workloadSummary(items, pods, podMetrics) {
  return items.map((item) => {
    const namespace = item.metadata?.namespace ?? '';
    const name = item.metadata?.name ?? '';
    const relatedPods = pods.filter(
      (pod) => pod.metadata?.namespace === namespace && ownerName(pod).startsWith(name),
    );
    return {
      namespace,
      name,
      kind: item.kind ?? '-',
      ready: workloadReady(item),
      desired: item.spec?.replicas ?? item.status?.desiredNumberScheduled ?? 0,
      age: age(item.metadata?.creationTimestamp),
      restarts: relatedPods.reduce((sum, pod) => sum + sumRestarts(pod), 0),
      cpuMillicores: Math.round(
        relatedPods.reduce((sum, pod) => sum + (podMetrics.get(`${namespace}/${pod.metadata?.name}`)?.cpuMillicores ?? 0), 0),
      ),
      memoryMi: Math.round(
        relatedPods.reduce((sum, pod) => sum + (podMetrics.get(`${namespace}/${pod.metadata?.name}`)?.memoryMi ?? 0), 0),
      ),
      health: workloadHealth(item),
    };
  });
}

function podSummary(items, podMetrics) {
  return items.map((pod) => {
    const namespace = pod.metadata?.namespace ?? '';
    const name = pod.metadata?.name ?? '';
    const status = podStatus(pod);
    const metrics = podMetrics.get(`${namespace}/${name}`) ?? { cpuMillicores: 0, memoryMi: 0 };
    return {
      namespace,
      name,
      node: pod.spec?.nodeName ?? '-',
      ip: pod.status?.podIP ?? '-',
      ready: podReady(pod),
      phase: status.phase,
      reason: status.reason,
      health: status.health,
      restarts: sumRestarts(pod),
      cpuMillicores: Math.round(metrics.cpuMillicores),
      memoryMi: Math.round(metrics.memoryMi),
      age: age(pod.metadata?.creationTimestamp),
      owner: ownerName(pod),
      containers: (pod.spec?.containers ?? []).map((container) => container.name),
    };
  });
}

function nodeSummary(items, nodeMetrics, pods) {
  return items.map((node) => {
    const name = node.metadata?.name ?? '';
    const metrics = nodeMetrics.get(name) ?? {};
    const conditions = node.status?.conditions ?? [];
    const pressure = conditions.find(
      (condition) =>
        ['MemoryPressure', 'DiskPressure', 'PIDPressure'].includes(condition.type) && condition.status === 'True',
    );
    const ready = conditions.find((condition) => condition.type === 'Ready')?.status === 'True';
    return {
      name,
      role: Object.keys(node.metadata?.labels ?? {})
        .find((label) => label.startsWith('node-role.kubernetes.io/'))
        ?.replace('node-role.kubernetes.io/', '') || 'worker',
      ready,
      health: pressure ? 'Critical' : ready ? 'Healthy' : 'Warning',
      reason: pressure?.type ?? (ready ? 'Ready' : 'NotReady'),
      cpuMillicores: Math.round(metrics.cpuMillicores ?? 0),
      cpuPercent: metrics.cpuPercent ?? '-',
      memoryMi: Math.round(metrics.memoryMi ?? 0),
      memoryPercent: metrics.memoryPercent ?? '-',
      pods: pods.filter((pod) => pod.spec?.nodeName === name).length,
      kubelet: node.status?.nodeInfo?.kubeletVersion ?? '-',
    };
  });
}

function serviceSummary(items) {
  return items.map((service) => ({
    namespace: service.metadata?.namespace ?? '',
    name: service.metadata?.name ?? '',
    type: service.spec?.type ?? '-',
    clusterIp: service.spec?.clusterIP ?? '-',
    ports: (service.spec?.ports ?? [])
      .map((port) => `${port.name ? `${port.name}:` : ''}${port.port}/${port.protocol}`)
      .join(', '),
    selector: Object.entries(service.spec?.selector ?? {})
      .map(([key, value]) => `${key}=${value}`)
      .join(', '),
  }));
}

function eventSummary(items) {
  return items
    .map((event) => ({
      namespace: event.metadata?.namespace ?? event.involvedObject?.namespace ?? '',
      type: event.type ?? 'Normal',
      reason: event.reason ?? '-',
      object: `${event.involvedObject?.kind ?? '-'}/${event.involvedObject?.name ?? '-'}`,
      message: event.message ?? '',
      count: event.count ?? event.series?.count ?? 1,
      time:
        event.eventTime ??
        event.lastTimestamp ??
        event.firstTimestamp ??
        event.metadata?.creationTimestamp ??
        '',
    }))
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 60);
}

function pickLogPods(pods) {
  const preferred = ['open5gs-upf', 'open5gs-smf', 'upf-autoscaler', 'oai', 'ue'];
  const running = pods.filter((pod) => pod.status?.phase === 'Running' && pod.metadata?.namespace === 'o5gs-dev');
  return preferred
    .map((prefix) => running.find((pod) => pod.metadata?.name?.startsWith(prefix)))
    .filter(Boolean)
    .filter((pod, index, selected) => selected.findIndex((item) => item.metadata?.name === pod.metadata?.name) === index)
    .slice(0, 4);
}

async function logsForPods(pods) {
  const panes = await Promise.all(
    pods.map(async (pod) => {
      const namespace = pod.metadata?.namespace;
      const name = pod.metadata?.name;
      const output = await kubectl(
        ['logs', '-n', namespace, name, '--all-containers=true', '--tail=28', '--prefix=true'],
        { optional: true },
      );
      return {
        namespace,
        pod: name,
        title: name.replace(/-[a-f0-9]{8,10}-[a-z0-9]{5}$/, ''),
        lines: output.trim().split('\n').filter(Boolean).slice(-28),
      };
    }),
  );
  return panes;
}

async function logsForPod(namespace, pod, tail = 220) {
  if (!namespace || !pod) {
    throw new Error('namespace and pod query parameters are required');
  }

  const output = await kubectl(
    [
      'logs',
      '-n',
      namespace,
      pod,
      '--all-containers=true',
      `--tail=${Math.min(Math.max(Number(tail) || 220, 20), 1000)}`,
      '--prefix=true',
      '--timestamps=true',
    ],
    { optional: true },
  );

  return {
    namespace,
    pod,
    generatedAt: new Date().toISOString(),
    lines: output.trim().split('\n').filter(Boolean),
  };
}

function compactCustomResource(item) {
  return {
    namespace: item.metadata?.namespace ?? '',
    name: item.metadata?.name ?? '',
    kind: item.kind ?? '-',
    spec: item.spec ?? {},
    status: item.status ?? {},
    age: age(item.metadata?.creationTimestamp),
  };
}

async function snapshot() {
  const [
    context,
    namespaces,
    pods,
    nodes,
    workloads,
    services,
    events,
    topPods,
    topNodes,
    upfPools,
    decisions,
  ] = await Promise.all([
    kubectl(['config', 'current-context']),
    kubectl(['get', 'namespaces', '-o', 'json'], { json: true }),
    kubectl(['get', 'pods', '-A', '-o', 'json'], { json: true }),
    kubectl(['get', 'nodes', '-o', 'json'], { json: true }),
    kubectl(['get', 'deploy,statefulset,daemonset,job', '-A', '-o', 'json'], { json: true }),
    kubectl(['get', 'svc', '-A', '-o', 'json'], { json: true }),
    kubectl(['get', 'events', '-A', '--sort-by=.lastTimestamp', '-o', 'json'], { json: true, optional: true }),
    kubectl(['top', 'pods', '-A'], { optional: true }),
    kubectl(['top', 'nodes'], { optional: true }),
    kubectl(['get', 'upfpools.core.5g3e.io', '-A', '-o', 'json'], { json: true, optional: true }),
    kubectl(['get', 'upfscalingdecisions.core.5g3e.io', '-A', '-o', 'json'], { json: true, optional: true }),
  ]);

  const podMetrics = parseTopPods(topPods);
  const nodeMetrics = parseTopNodes(topNodes);
  const podRows = podSummary(pods.items ?? [], podMetrics);
  const workloadRows = workloadSummary(workloads.items ?? [], pods.items ?? [], podMetrics);
  const namespaceRows = namespaceSummary(namespaces.items ?? [], pods.items ?? [], podMetrics);
  const nodeRows = nodeSummary(nodes.items ?? [], nodeMetrics, pods.items ?? []);
  const eventRows = eventSummary(events.items ?? []);
  const logPanes = await logsForPods(pickLogPods(pods.items ?? []));

  return {
    context: context.trim(),
    generatedAt: new Date().toISOString(),
    totals: {
      namespaces: namespaceRows.length,
      pods: podRows.length,
      runningPods: podRows.filter((pod) => pod.phase === 'Running').length,
      warnings: podRows.filter((pod) => pod.health === 'Warning').length + workloadRows.filter((workload) => workload.health === 'Warning').length,
      critical: podRows.filter((pod) => pod.health === 'Critical').length + workloadRows.filter((workload) => workload.health === 'Critical').length,
      restarts: podRows.reduce((sum, pod) => sum + pod.restarts, 0),
      cpuMillicores: podRows.reduce((sum, pod) => sum + pod.cpuMillicores, 0),
      memoryMi: podRows.reduce((sum, pod) => sum + pod.memoryMi, 0),
    },
    namespaces: namespaceRows,
    workloads: workloadRows,
    pods: podRows,
    nodes: nodeRows,
    services: serviceSummary(services.items ?? []),
    events: eventRows,
    logPanes,
    upfPools: (upfPools.items ?? []).map(compactCustomResource),
    decisions: (decisions.items ?? []).map(compactCustomResource),
  };
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);

  if (request.method === 'OPTIONS') {
    response.writeHead(204, jsonHeaders);
    response.end();
    return;
  }

  if (requestUrl.pathname === '/api/health') {
    response.writeHead(200, jsonHeaders);
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (requestUrl.pathname === '/api/snapshot') {
    try {
      response.writeHead(200, jsonHeaders);
      response.end(JSON.stringify(await snapshot()));
    } catch (error) {
      response.writeHead(500, jsonHeaders);
      response.end(
        JSON.stringify({
          error: error.message,
          hint: 'The API server shells out to kubectl. Check that kubectl can reach minikube from this terminal.',
        }),
      );
    }
    return;
  }

  if (requestUrl.pathname === '/api/logs') {
    try {
      const namespace = requestUrl.searchParams.get('namespace') ?? '';
      const pod = requestUrl.searchParams.get('pod') ?? '';
      const tail = Number(requestUrl.searchParams.get('tail') ?? 220);
      response.writeHead(200, jsonHeaders);
      response.end(JSON.stringify(await logsForPod(namespace, pod, tail)));
    } catch (error) {
      response.writeHead(500, jsonHeaders);
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  response.writeHead(404, jsonHeaders);
  response.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`kuber-view API listening on http://127.0.0.1:${port}`);
});
