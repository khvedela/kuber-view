import { getWatchCache } from '../../k8s/watches.mjs';
import { sendEvent, sendError } from '../protocol.mjs';

const SUPPORTED_KINDS = new Set([
  'Pod', 'Node', 'Namespace', 'Service', 'ConfigMap', 'Secret', 'Event',
  'Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job',
]);

/**
 * Handle a 'watch' channel subscription.
 * Returns an unsubscribe function.
 */
export function handleWatch(ws, params, contextName, seq) {
  const kind = params?.kind;
  if (!kind || !SUPPORTED_KINDS.has(kind)) {
    sendError(ws, null, 'UNSUPPORTED_KIND', `Unsupported kind: ${kind}`);
    return () => {};
  }

  let localSeq = seq ?? 0;

  try {
    const cache = getWatchCache(contextName, kind);
    const unsub = cache.subscribe((delta) => {
      if (delta.op === 'SYNC') {
        // Send all items as ADDED
        for (const obj of delta.items) {
          sendEvent(ws, 'watch', ++localSeq, { op: 'ADDED', kind, obj });
        }
      } else {
        sendEvent(ws, 'watch', ++localSeq, { op: delta.op, kind, obj: delta.obj });
      }
    });
    return unsub;
  } catch (err) {
    sendError(ws, null, 'WATCH_ERROR', err?.message ?? 'Watch failed');
    return () => {};
  }
}
