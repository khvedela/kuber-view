import { createServer } from 'node:http';
import { URL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WebSocketServer } from 'ws';
import { handleHealth } from './routes/health.mjs';
import { handleContexts } from './routes/contexts.mjs';
import { handleSnapshot } from './routes/snapshot.mjs';
import { handleLogs } from './routes/logs.mjs';
import { createHub } from './ws/hub.mjs';
import { getContexts } from './k8s/kube.mjs';
import { info, warn, error as logError } from './util/log.mjs';

const execFileAsync = promisify(execFile);
const KUBECTL_TIMEOUT = Number(process.env.KUBER_VIEW_KUBECTL_TIMEOUT_MS ?? 9000);

process.on('unhandledRejection', (reason) => {
  logError('Unhandled rejection', { reason: String(reason) });
});

const port     = Number(process.env.KUBER_VIEW_API_PORT ?? 4201);
const bindHost = process.env.KUBER_VIEW_BIND_HOST ?? '127.0.0.1';

const ALLOWED_ORIGINS = new Set(['http://localhost:4200', 'http://127.0.0.1:4200']);
if (process.env.KUBER_VIEW_ORIGIN) ALLOWED_ORIGINS.add(process.env.KUBER_VIEW_ORIGIN);

function jsonHeaders(reqOrigin) {
  const origin = ALLOWED_ORIGINS.has(reqOrigin) ? reqOrigin : 'http://localhost:4200';
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  };
}

// Active context — defaults to kubeconfig default
let activeContext = null;
try { activeContext = getContexts().active; } catch { /**/ }

function getContext() { return activeContext; }

const server = createServer(async (req, res) => {
  const url     = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
  const headers = jsonHeaders(req.headers.origin ?? '');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);

  const path = url.pathname;

  if (path === '/api/health') {
    return handleHealth(res, headers);
  }

  if (path === '/api/snapshot') {
    return handleSnapshot(res, headers);
  }

  if (path === '/api/logs' && req.method === 'GET') {
    return handleLogs(req, res, headers, url.searchParams, getContext());
  }

  if (path === '/api/contexts' && req.method === 'GET') {
    return handleContexts(res, headers);
  }

  if (path === '/api/contexts/switch' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const { context } = JSON.parse(body);
      if (!context) throw new Error('context is required');
      activeContext = context;
      res.writeHead(200, headers);
      res.end(JSON.stringify({ ok: true, context }));
    } catch (err) {
      res.writeHead(400, headers);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (path === '/api/scale' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const { namespace, kind, name, replicas } = JSON.parse(body);
      if (!namespace || !kind || !name || replicas == null) throw new Error('namespace, kind, name, replicas required');
      const n = Number(replicas);
      if (!Number.isInteger(n) || n < 0) throw new Error('replicas must be a non-negative integer');
      await execFileAsync('kubectl', [
        'scale', `${kind.toLowerCase()}/${name}`, '-n', namespace, `--replicas=${n}`,
        ...(activeContext ? ['--context', activeContext] : []),
      ], { timeout: KUBECTL_TIMEOUT });
      res.writeHead(200, headers);
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(400, headers);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (path === '/api/restart' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const { namespace, kind, name } = JSON.parse(body);
      if (!namespace || !kind || !name) throw new Error('namespace, kind, name required');
      await execFileAsync('kubectl', [
        'rollout', 'restart', `${kind.toLowerCase()}/${name}`, '-n', namespace,
        ...(activeContext ? ['--context', activeContext] : []),
      ], { timeout: KUBECTL_TIMEOUT });
      res.writeHead(200, headers);
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(400, headers);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (path === '/api/delete' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const { namespace, kind, name } = JSON.parse(body);
      if (!namespace || !kind || !name) throw new Error('namespace, kind, name required');
      await execFileAsync('kubectl', [
        'delete', `${kind.toLowerCase()}/${name}`, '-n', namespace,
        '--wait=false',
        ...(activeContext ? ['--context', activeContext] : []),
      ], { timeout: KUBECTL_TIMEOUT });
      res.writeHead(200, headers);
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(400, headers);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404, headers);
  res.end(JSON.stringify({ error: 'Not found' }));
});

// ── WebSocket server ─────────────────────────────────────────────────────────
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
  const ctx = url.searchParams.get('ctx') || getContext();
  const hub = createHub(ws, ctx);

  ws.on('message', (data) => hub.handle(data.toString()));
  ws.on('close', () => hub.destroy());
  ws.on('error', (err) => {
    warn('WS socket error', { msg: err.message });
    hub.destroy();
  });

  info('WS connected', { ctx });
});

server.listen(port, bindHost, () => {
  info(`kuber-view API listening on http://${bindHost}:${port}`);
  info('WebSocket endpoint: /ws');
});

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
