import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { error as logError } from '../util/log.mjs';

const execFileAsync = promisify(execFile);

/** GET /api/logs?namespace=&pod=&tail= — one-shot log fetch via kubectl */
export async function handleLogs(req, res, jsonHeaders, searchParams, contextName) {
  const namespace = searchParams.get('namespace') ?? '';
  const pod       = searchParams.get('pod') ?? '';
  const tail = Math.min(Math.max(Number(searchParams.get('tail') ?? 220), 20), 1000);

  if (!namespace || !pod) {
    res.writeHead(400, jsonHeaders);
    res.end(JSON.stringify({ error: 'namespace and pod query parameters are required' }));
    return;
  }

  try {
    const { stdout } = await execFileAsync('kubectl', [
      'logs', '-n', namespace, pod,
      '--all-containers=true',
      `--tail=${tail}`,
      '--prefix=true',
      '--timestamps=true',
    ], { timeout: 9000, maxBuffer: 1024 * 1024 * 20 });

    res.writeHead(200, jsonHeaders);
    res.end(JSON.stringify({
      namespace,
      pod,
      generatedAt: new Date().toISOString(),
      lines: stdout.trim().split('\n').filter(Boolean),
    }));
  } catch (err) {
    logError('logs failed', { msg: err.message });
    res.writeHead(500, jsonHeaders);
    res.end(JSON.stringify({ error: err.message }));
  }
}
