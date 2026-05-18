import { getContexts } from '../k8s/kube.mjs';

export function handleContexts(res, jsonHeaders) {
  try {
    const result = getContexts();
    res.writeHead(200, jsonHeaders);
    res.end(JSON.stringify(result));
  } catch (err) {
    res.writeHead(500, jsonHeaders);
    res.end(JSON.stringify({ error: err.message }));
  }
}
