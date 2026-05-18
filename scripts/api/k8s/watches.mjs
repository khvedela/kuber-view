import { info, warn, error as logError, debug } from '../util/log.mjs';
import { getClients } from './kube.mjs';

const COALESCE_MS = 50;
const RELIST_DELAY_MS = 2000;

// watchCaches: Map<`${ctx}/${kind}`, WatchCache>
const watchCaches = new Map();

/**
 * Returns (or creates) a watch cache for the given context+kind.
 * A WatchCache emits live add/update/delete deltas to subscribers.
 */
export function getWatchCache(contextName, kind) {
  const key = `${contextName}/${kind}`;
  if (watchCaches.has(key)) return watchCaches.get(key);
  const cache = new WatchCache(contextName, kind);
  watchCaches.set(key, cache);
  cache.start();
  return cache;
}

export function stopAll() {
  for (const cache of watchCaches.values()) cache.stop();
  watchCaches.clear();
}

class WatchCache {
  #ctx;
  #kind;
  #items = new Map(); // uid → object
  #subscribers = new Set();
  #req = null;
  #stopped = false;
  #coalesceTimer = null;
  #pendingDeltas = [];

  constructor(contextName, kind) {
    this.#ctx = contextName;
    this.#kind = kind;
  }

  subscribe(fn) {
    this.#subscribers.add(fn);
    // Send current state immediately
    for (const obj of this.#items.values()) {
      fn({ op: 'ADDED', obj });
    }
    return () => this.#subscribers.delete(fn);
  }

  list() {
    return Array.from(this.#items.values());
  }

  async start() {
    while (!this.#stopped) {
      try {
        await this.#watch();
      } catch (err) {
        if (!this.#stopped) {
          warn(`Watch ${this.#kind}: restarting after error`, { msg: err?.message });
          await sleep(RELIST_DELAY_MS);
        }
      }
    }
  }

  stop() {
    this.#stopped = true;
    this.#req?.abort?.();
  }

  async #watch() {
    const clients = getClients(this.#ctx);
    const path = kindToPath(this.#kind);
    if (!path) throw new Error(`Unknown kind: ${this.#kind}`);

    // First list to populate cache and get resourceVersion
    const list = await kubelist(clients, this.#kind);
    const rv = list.metadata?.resourceVersion ?? '0';

    // Apply list as ADD deltas
    this.#items.clear();
    for (const obj of (list.items ?? [])) {
      this.#items.set(obj.metadata?.uid, obj);
    }
    this.#emit({ op: 'SYNC', items: list.items ?? [] });

    debug(`Watch ${this.#kind}: listed ${list.items?.length ?? 0} items, rv=${rv}`);

    // Now watch from that resourceVersion
    await new Promise((resolve, reject) => {
      clients.watch.watch(
        path,
        { resourceVersion: rv, allowWatchBookmarks: true },
        (type, obj) => {
          if (type === 'BOOKMARK') return;
          const uid = obj.metadata?.uid;
          if (type === 'ADDED' || type === 'MODIFIED') {
            this.#items.set(uid, obj);
            this.#emitDelta({ op: type === 'ADDED' ? 'ADDED' : 'MODIFIED', obj });
          } else if (type === 'DELETED') {
            this.#items.delete(uid);
            this.#emitDelta({ op: 'DELETED', obj });
          }
        },
        (err) => {
          if (err) reject(err); else resolve();
        },
      ).then((req) => { this.#req = req; }).catch(reject);
    });
  }

  #emitDelta(delta) {
    this.#pendingDeltas.push(delta);
    if (!this.#coalesceTimer) {
      this.#coalesceTimer = setTimeout(() => {
        const deltas = this.#pendingDeltas.splice(0);
        this.#coalesceTimer = null;
        for (const d of deltas) this.#broadcast(d);
      }, COALESCE_MS);
    }
  }

  #emit(msg) {
    for (const fn of this.#subscribers) {
      try { fn(msg); } catch { /**/ }
    }
  }

  #broadcast(delta) {
    for (const fn of this.#subscribers) {
      try { fn(delta); } catch { /**/ }
    }
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function kubelist(clients, kind) {
  switch (kind) {
    case 'Pod':           return (await clients.core.listPodForAllNamespaces()).body;
    case 'Node':          return (await clients.core.listNode()).body;
    case 'Namespace':     return (await clients.core.listNamespace()).body;
    case 'Service':       return (await clients.core.listServiceForAllNamespaces()).body;
    case 'ConfigMap':     return (await clients.core.listConfigMapForAllNamespaces()).body;
    case 'Secret':        return (await clients.core.listSecretForAllNamespaces()).body;
    case 'Event':         return (await clients.core.listEventForAllNamespaces()).body;
    case 'Deployment':    return (await clients.apps.listDeploymentForAllNamespaces()).body;
    case 'StatefulSet':   return (await clients.apps.listStatefulSetForAllNamespaces()).body;
    case 'DaemonSet':     return (await clients.apps.listDaemonSetForAllNamespaces()).body;
    case 'ReplicaSet':    return (await clients.apps.listReplicaSetForAllNamespaces()).body;
    case 'Job':           return (await clients.batch.listJobForAllNamespaces()).body;
    default:              throw new Error(`No list impl for kind: ${kind}`);
  }
}

function kindToPath(kind) {
  const paths = {
    Pod:         '/api/v1/pods',
    Node:        '/api/v1/nodes',
    Namespace:   '/api/v1/namespaces',
    Service:     '/api/v1/services',
    ConfigMap:   '/api/v1/configmaps',
    Secret:      '/api/v1/secrets',
    Event:       '/api/v1/events',
    Deployment:  '/apis/apps/v1/deployments',
    StatefulSet: '/apis/apps/v1/statefulsets',
    DaemonSet:   '/apis/apps/v1/daemonsets',
    ReplicaSet:  '/apis/apps/v1/replicasets',
    Job:         '/apis/batch/v1/jobs',
  };
  return paths[kind] ?? null;
}
