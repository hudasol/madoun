/**
 * One JSON line per API request on standard output: when, who, what, how it ended and how long it took.
 * It never records request or response bodies, query strings or the Authorization header, so it can be
 * kept longer than the data it describes. Switch it off with MADOUN_LOG=off (it is also off under test).
 */
export interface RequestLog {
  requestId: string;
  clientId: string;
  role: string;
  method: string;
  path: string;
  status: number;
  ms: number;
}

export function logEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.MADOUN_LOG === 'off') return false;
  if (env.MADOUN_LOG === 'json') return true;
  return env.NODE_ENV === 'production';
}

export function logRequest(entry: RequestLog, env: NodeJS.ProcessEnv = process.env, write: (line: string) => void = (l) => console.log(l)): void {
  if (!logEnabled(env)) return;
  write(JSON.stringify({ t: new Date().toISOString(), event: 'api_request', ...entry }));
}
