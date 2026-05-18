export function send(ws, envelope) {
  if (ws.readyState !== 1 /* OPEN */) return;
  try {
    ws.send(JSON.stringify(envelope));
  } catch { /**/ }
}

export function sendEvent(ws, channel, seq, payload) {
  send(ws, { type: 'event', channel, seq, payload });
}

export function sendError(ws, id, code, message) {
  send(ws, { type: 'error', id, code, message });
}

export function sendAck(ws, id, token) {
  send(ws, { type: 'ack', id, payload: { token } });
}

export function sendPong(ws) {
  send(ws, { type: 'pong' });
}
