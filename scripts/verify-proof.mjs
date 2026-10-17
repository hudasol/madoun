#!/usr/bin/env node
// Offline verifier for a Madoun receipt inclusion proof. Needs no app code and no network: only Node and
// the audited @noble libraries already in the dependency tree.
//
//   node scripts/verify-proof.mjs proof.json <ledger public key: 64 hex characters, or a file holding them> [origin]
//
// The origin defaults to madoun-demo-evidence-ledger; a checkpoint for another ledger is rejected even if the
// same key signed it.
// Checks, in order:
//   1. the checkpoint signature (Ed25519) over the line based checkpoint message, with the key YOU supply
//      (never a key taken from the proof file);
//   2. the receipt's content against its own chain hash: SHA-256(prevHash + canonical JSON of the hashed fields);
//   3. the RFC 6962 inclusion path from the receipt's leaf to the signed root (RFC 9162 section 2.1.3.2).
// Prints VALID and exits 0, or prints INVALID with the reason and exits 1.
// What it does not prove: only the fields in HASHED are hashed. The summary text, the status (verified, pending,
// revoked) and the revocation reason are not, so they are not proven; the VALID line says so.
import fs from 'node:fs';
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

const DOMAIN = 'madoun/checkpoint/v1';
const HASHED = ['id', 'type', 'subjectRef', 'issuer', 'verifiedBy', 'method', 'scope', 'validFrom', 'validUntil', 'sharedWith'];

const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const leafHash = (d) => sha256(concat(Uint8Array.of(0), d));
const nodeHash = (l, r) => sha256(concat(Uint8Array.of(1), l, r));

/** The receipt hash exactly as the ledger computes it: the fields, in this order, are what is hashed. */
function receiptHash(r) {
  const canonical = JSON.stringify(HASHED.map((k) => r[k]));
  return bytesToHex(sha256(utf8ToBytes(r.prevHash + canonical)));
}

/** RFC 9162 section 2.1.3.2. */
function verifyInclusion(leaf, index, size, path, root) {
  if (!Number.isInteger(index) || !Number.isInteger(size) || index < 0 || index >= size) return false;
  let fn = index;
  let sn = size - 1;
  let r = leaf;
  for (const p of path) {
    if (sn === 0) return false;
    if (fn % 2 === 1 || fn === sn) {
      r = nodeHash(p, r);
      if (fn % 2 === 0) while (fn % 2 === 0 && fn !== 0) { fn = Math.floor(fn / 2); sn = Math.floor(sn / 2); }
    } else {
      r = nodeHash(r, p);
    }
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  return sn === 0 && bytesToHex(r) === bytesToHex(root);
}

export function verifyProof(proof, publicKeyHex, origin = 'madoun-demo-evidence-ledger') {
  try {
    if (proof?.format !== 'madoun-inclusion-proof/v1') return 'unknown proof format';
    const c = proof.checkpoint;
    if (c.origin !== origin) return `checkpoint is for ledger '${c.origin}', expected '${origin}'`;
    const message = utf8ToBytes(`${DOMAIN}\n${c.origin}\n${c.treeSize}\n${c.rootHash}\n${c.timestamp}\n`);
    if (!ed25519.verify(hexToBytes(c.signature), message, hexToBytes(publicKeyHex))) return 'checkpoint signature does not verify with the supplied key';
    if (proof.treeSize !== c.treeSize) return 'tree size differs from the checkpoint';
    if (receiptHash(proof.receipt) !== proof.receipt.hash) return 'receipt content does not match its hash';
    const leaf = leafHash(hexToBytes(proof.receipt.hash));
    const path = proof.inclusionPath.map((h) => hexToBytes(h));
    if (!verifyInclusion(leaf, proof.leafIndex, proof.treeSize, path, hexToBytes(c.rootHash))) return 'inclusion path does not lead to the signed root';
    return null;
  } catch (e) {
    return `malformed proof (${e instanceof Error ? e.message : String(e)})`;
  }
}

const [, , proofFile, keyArg, originArg] = process.argv;
if (proofFile) {
  if (!keyArg) {
    console.error('usage: node scripts/verify-proof.mjs proof.json <public key hex or file>');
    process.exit(2);
  }
  const key = /^[0-9a-fA-F]{64}$/.test(keyArg) ? keyArg : fs.readFileSync(keyArg, 'utf8').trim();
  const proof = JSON.parse(fs.readFileSync(proofFile, 'utf8'));
  const problem = verifyProof(proof, key, originArg);
  if (problem) {
    console.log(`INVALID: ${problem}`);
    process.exit(1);
  }
  console.log(`VALID: receipt ${proof.receipt.id} is leaf ${proof.leafIndex} of ${proof.treeSize} under root ${proof.checkpoint.rootHash}, checkpoint signed ${proof.checkpoint.timestamp}`);
  console.log(`Proven fields: ${HASHED.join(', ')}. Not proven: summary, summaryAr, status, revokedReason, reuseLog.`);
}
