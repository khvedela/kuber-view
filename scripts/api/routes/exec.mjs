import { getClients } from '../k8s/kube.mjs';
import { PassThrough } from 'node:stream';
import { error as logError } from '../util/log.mjs';

/**
 * WebSocket exec handler — called when a WS client requests an exec session.
 * This is invoked directly via a WS upgrade at /api/exec (not via HTTP).
 */
export function attachExec(ws, params, contextName) {
  const { namespace, pod, container, cols = 80, rows = 24 } = params ?? {};
  if (!namespace || !pod) {
    ws.close(1008, 'namespace and pod are required');
    return;
  }

  const clients = getClients(contextName);

  const stdin  = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();

  // Forward stdout/stderr to the WS client
  stdout.on('data', (d) => ws.readyState === 1 && ws.send(d));
  stderr.on('data', (d) => ws.readyState === 1 && ws.send(d));

  // Forward WS messages to stdin (binary frames) or handle resize (text JSON)
  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      stdin.write(data);
    } else {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'resize') {
          // TTY resize not directly supported via stream; best-effort SIGWINCH is complex
          // The terminal emulator on the client handles the visual part already
        }
      } catch {
        // raw text → stdin
        stdin.write(data);
      }
    }
  });

  ws.on('close', () => { stdin.end(); stdout.destroy(); stderr.destroy(); });

  clients.exec.exec(
    namespace,
    pod,
    container || '',
    ['/bin/sh', '-c', 'TERM=xterm-256color exec /bin/sh'],
    stdout,
    stderr,
    stdin,
    true, // tty
    (status) => {
      if (ws.readyState === 1) ws.close(1000, status?.reason ?? 'exit');
    },
  ).catch((err) => {
    logError('exec failed', { msg: err.message });
    if (ws.readyState === 1) ws.close(1011, err.message);
  });
}
