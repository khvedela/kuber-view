import { sendPong, sendAck, sendError } from './protocol.mjs';
import { handleWatch } from './channels/watch.mjs';
import { handleLogs } from './channels/logs.mjs';
import { info, warn } from '../util/log.mjs';

/**
 * Create a per-socket subscription hub.
 * Call hub.handle(rawMessage) for each incoming frame.
 * Call hub.destroy() when the socket closes.
 */
export function createHub(ws, contextName) {
  const subs = new Map(); // token → cleanup fn
  let tokenCounter = 0;

  function handle(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return; // ignore unparseable
    }

    switch (msg.type) {
      case 'ping':
        sendPong(ws);
        break;

      case 'sub': {
        const token = `t${++tokenCounter}`;
        sendAck(ws, msg.id, token);
        let cleanup;
        switch (msg.channel) {
          case 'watch':
            cleanup = handleWatch(ws, msg.params, contextName, 0);
            break;
          case 'logs':
            cleanup = handleLogs(ws, msg.params, contextName);
            break;
          default:
            sendError(ws, msg.id, 'UNKNOWN_CHANNEL', `Unknown channel: ${msg.channel}`);
            return;
        }
        subs.set(token, cleanup);
        break;
      }

      case 'unsub': {
        const token = msg.payload?.token;
        const cleanup = subs.get(token);
        if (cleanup) {
          cleanup();
          subs.delete(token);
        }
        break;
      }

      default:
        break;
    }
  }

  function destroy() {
    for (const cleanup of subs.values()) {
      try { cleanup(); } catch { /**/ }
    }
    subs.clear();
  }

  return { handle, destroy };
}
