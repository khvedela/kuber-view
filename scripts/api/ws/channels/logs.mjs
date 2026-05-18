import { spawn } from 'node:child_process';
import { sendEvent, sendError } from '../protocol.mjs';

/**
 * Handle a 'logs' channel subscription — real-time kubectl --follow streaming.
 * Returns an unsubscribe/cleanup function.
 */
export function handleLogs(ws, params, contextName) {
  const { namespace, pod, tail = 100 } = params ?? {};
  if (!namespace || !pod) {
    sendError(ws, null, 'MISSING_PARAMS', 'namespace and pod are required');
    return () => {};
  }

  const tailLines = Math.min(Math.max(Number(tail) || 100, 10), 500);

  const args = [
    'logs', '-n', namespace, pod,
    '--all-containers=true',
    `--tail=${tailLines}`,
    '--prefix=true',
    '--timestamps=true',
    '--follow=true',
  ];
  if (contextName) args.push('--context', contextName);

  const proc = spawn('kubectl', args, { stdio: ['ignore', 'pipe', 'pipe'] });

  let buf = '';
  proc.stdout.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (line) sendEvent(ws, 'logs', 0, line);
    }
  });

  proc.stderr.on('data', (chunk) => {
    const msg = chunk.toString('utf8').trim();
    if (msg) sendError(ws, null, 'LOG_STDERR', msg);
  });

  proc.on('error', (err) => {
    sendError(ws, null, 'LOG_ERROR', err.message);
  });

  return () => {
    try { proc.kill('SIGTERM'); } catch { /**/ }
  };
}
