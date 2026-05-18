/**
 * Legacy /api/snapshot endpoint — wraps kubectl via execFile (original implementation).
 * Kept as a reliable fallback while the watch-based live stream is being adopted.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  namespaceSummary, workloadSummary, podSummary, nodeSummary,
  serviceSummary, eventSummary, parseTopPods, parseTopNodes, age,
  sumRestarts, podStatus,
} from '../k8s/health.mjs';
import { info, error as logError } from '../util/log.mjs';

const execFileAsync = promisify(execFile);
const timeout = Number(process.env.KUBER_VIEW_KUBECTL_TIMEOUT_MS ?? 9000);

async function kubectl(args, options = {}) {
  try {
    const { stdout } = await execFileAsync('kubectl', args, {
      timeout,
      maxBuffer: 1024 * 1024 * 20,
    });
    if (options.json) return JSON.parse(stdout);
    return stdout;
  } catch (err) {
    if (options.optional) return options.json ? { items: [], error: err.message } : '';
    throw err;
  }
}

function pickLogPods(pods) {
  const preferred = ['open5gs-upf', 'open5gs-smf', 'upf-autoscaler', 'oai', 'ue'];
  const running = pods.filter((p) => p.status?.phase === 'Running' && p.metadata?.namespace === 'o5gs-dev');
  return preferred
    .map((prefix) => running.find((p) => p.metadata?.name?.startsWith(prefix)))
    .filter(Boolean)
    .filter((p, i, arr) => arr.findIndex((x) => x.metadata?.name === p.metadata?.name) === i)
    .slice(0, 4);
}

async function logsForPods(pods) {
  return Promise.all(pods.map(async (pod) => {
    const namespace = pod.metadata?.namespace;
    const name = pod.metadata?.name;
    const output = await kubectl(['logs', '-n', namespace, name, '--all-containers=true', '--tail=28', '--prefix=true'], { optional: true });
    return {
      namespace, pod: name,
      title: name.replace(/-[a-f0-9]{8,10}-[a-z0-9]{5}$/, ''),
      lines: output.trim().split('\n').filter(Boolean).slice(-28),
    };
  }));
}

async function buildSnapshot() {
  const [context, namespaces, pods, nodes, workloads, services, events, topPods, topNodes, upfPools, decisions] =
    await Promise.all([
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

  function compactCR(item) {
    return { namespace: item.metadata?.namespace ?? '', name: item.metadata?.name ?? '', kind: item.kind ?? '-', spec: item.spec ?? {}, status: item.status ?? {}, age: age(item.metadata?.creationTimestamp) };
  }

  return {
    context: context.trim(),
    generatedAt: new Date().toISOString(),
    totals: {
      namespaces: namespaceRows.length,
      pods: podRows.length,
      runningPods: podRows.filter((p) => p.phase === 'Running').length,
      warnings: podRows.filter((p) => p.health === 'Warning').length + workloadRows.filter((w) => w.health === 'Warning').length,
      critical: podRows.filter((p) => p.health === 'Critical').length + workloadRows.filter((w) => w.health === 'Critical').length,
      restarts: podRows.reduce((s, p) => s + p.restarts, 0),
      cpuMillicores: podRows.reduce((s, p) => s + p.cpuMillicores, 0),
      memoryMi: podRows.reduce((s, p) => s + p.memoryMi, 0),
    },
    namespaces: namespaceRows, workloads: workloadRows, pods: podRows,
    nodes: nodeRows,
    services: serviceSummary(services.items ?? []),
    events: eventRows,
    logPanes,
    upfPools: (upfPools.items ?? []).map(compactCR),
    decisions: (decisions.items ?? []).map(compactCR),
  };
}

export async function handleSnapshot(res, jsonHeaders) {
  try {
    const snapshot = await buildSnapshot();
    res.writeHead(200, jsonHeaders);
    res.end(JSON.stringify(snapshot));
  } catch (err) {
    logError('snapshot failed', { msg: err.message });
    res.writeHead(500, jsonHeaders);
    res.end(JSON.stringify({
      error: err.message,
      hint: 'The API server shells out to kubectl. Check that kubectl can reach the cluster from this terminal.',
    }));
  }
}
