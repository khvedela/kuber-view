export function log(level, msg, data) {
  const ts = new Date().toISOString();
  const line = data ? `${ts} [${level}] ${msg} ${JSON.stringify(data)}` : `${ts} [${level}] ${msg}`;
  if (level === 'ERROR') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const info  = (msg, data) => log('INFO',  msg, data);
export const warn  = (msg, data) => log('WARN',  msg, data);
export const error = (msg, data) => log('ERROR', msg, data);
export const debug = (msg, data) => {
  if (process.env.KUBER_VIEW_DEBUG) log('DEBUG', msg, data);
};
