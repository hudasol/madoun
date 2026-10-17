// Preloaded into a Node process (node --import) to record and block every attempt to reach a host that
// is not this machine: DNS lookups of non-local names, TCP or TLS connections (which is how fetch, http
// and https connect) and UDP sends. Each attempt is appended as one JSON line to MADOUN_EGRESS_LOG and
// fails with an error, so nothing leaves. Used by scripts/offline-check.mjs; never loaded by the app.
import dgram from 'node:dgram';
import dns from 'node:dns';
import fs from 'node:fs';
import net from 'node:net';

const logFile = process.env.MADOUN_EGRESS_LOG;
const isLocal = (h) => {
  if (h === undefined || h === null || h === '') return true; // no host means localhost for net.connect
  const s = String(h).toLowerCase().replace(/^\[|\]$/g, '');
  return s === 'localhost' || s.endsWith('.localhost') || s === '::1' || s === '::' || s === '0.0.0.0' || s.startsWith('127.') || s === '::ffff:127.0.0.1';
};
const record = (kind, target) => {
  if (logFile) fs.appendFileSync(logFile, JSON.stringify({ pid: process.pid, kind, target: String(target) }) + '\n');
};
// A marker per process, so the check can prove the guard was really active in the server.
record('guard-loaded', process.argv.slice(1, 3).join(' '));
const blocked = (target) => Object.assign(new Error(`egress blocked by offline check: ${target}`), { code: 'EGRESS_BLOCKED' });

const lookup = dns.lookup;
dns.lookup = function (hostname, ...rest) {
  if (!isLocal(hostname)) {
    record('dns', hostname);
    const cb = rest.find((a) => typeof a === 'function');
    if (cb) return void process.nextTick(cb, blocked(hostname));
  }
  return lookup.call(this, hostname, ...rest);
};
const plookup = dns.promises.lookup;
dns.promises.lookup = function (hostname, ...rest) {
  if (!isLocal(hostname)) {
    record('dns', hostname);
    return Promise.reject(blocked(hostname));
  }
  return plookup.call(this, hostname, ...rest);
};

const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  let host;
  if (first && typeof first === 'object') host = first.path ? 'localhost' : first.host;
  else if (typeof first === 'number' || /^\d+$/.test(String(first))) host = typeof args[1] === 'string' ? args[1] : undefined;
  else host = 'localhost'; // a pipe or socket path
  if (!isLocal(host)) {
    record('connect', `${host}:${first?.port ?? args[0]}`);
    process.nextTick(() => this.destroy(blocked(host)));
    return this;
  }
  return connect.apply(this, args);
};

const send = dgram.Socket.prototype.send;
dgram.Socket.prototype.send = function (...args) {
  const addr = args.find((a, i) => i > 0 && typeof a === 'string');
  if (!isLocal(addr)) {
    record('udp', addr);
    const cb = args.find((a) => typeof a === 'function');
    if (cb) process.nextTick(cb, blocked(addr));
    return;
  }
  return send.apply(this, args);
};
