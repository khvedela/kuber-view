export function handleHealth(res, jsonHeaders) {
  res.writeHead(200, jsonHeaders);
  res.end(JSON.stringify({ ok: true }));
}
