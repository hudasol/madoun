import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import fc from 'fast-check';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_ROOT, HASHED_RECEIPT_FIELDS, LEDGER_SIGNER_ID, computeReceiptHash, consistencyProof, consistencyProofBetween, demoPublicKeys, demoSigner, inclusionProof,
  inclusionProofFor, leafHash, makeCheckpoint, merkleRoot, nodeHash, verifyChain, verifyCheckpointSignature, verifyConsistency,
  verifyConsistencyProof, verifyInclusion, verifyInclusionProof, type EvidenceReceipt, type InclusionProof,
} from '@/engine';
import { GET as checkpointRoute } from '@/app/api/v1/ledger/checkpoint/route';
import { GET as proofRoute } from '@/app/api/v1/receipts/[id]/proof/route';
import { getWorld } from '@/server/world';

/**
 * Known answer vectors: the leaf inputs and root hashes for tree sizes 0 to 8 published in the
 * transparency-dev/merkle reference implementation (testonly/constants.go), which implements RFC 6962.
 */
const KAT_LEAVES = ['', '00', '10', '2021', '3031', '40414243', '5051525354555657', '606162636465666768696a6b6c6d6e6f'];
const KAT_ROOTS = [
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  '6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d',
  'fac54203e7cc696cf0dfcb42c92a1d9dbaf70ad9e621f4bd8d98662f00e3c125',
  'aeb6bcfe274b70a14fb067a5e5578264db0fa9b51af5e0ba159158f329e06e77',
  'd37ee418976dd95753c1c73862b9398fa2a2cf9b4ff0fdfe8b30cd95209614b7',
  '4e3bbb1f7b478dcfe71fb631631519a3bca12c9aefca1612bfce4c13a86264d4',
  '76e67dadbcdf1e10e1b74ddc608abd2f98dfb16fbce75277b5232a127f2087ef',
  'ddb89be403809e325750d3d263cd78929c2942b7942a34b77e122c9594a74c8c',
  '5dc9da79a70659a9ad559cb701ded9a2ab9d823aad2f4960cfe370eff4604328',
];

const flip = (h: Uint8Array, i = 0) => { const c = h.slice(); c[i % c.length] ^= 0x01; return c; };
const leavesArb = (min = 1, max = 48) => fc.array(fc.uint8Array({ minLength: 0, maxLength: 16 }), { minLength: min, maxLength: max }).map((ds) => ds.map(leafHash));

describe('RFC 6962 Merkle tree', () => {
  it('matches the published known answer roots for sizes 0 to 8', () => {
    const leaves = KAT_LEAVES.map((h) => leafHash(hexToBytes(h)));
    KAT_ROOTS.forEach((root, n) => expect(bytesToHex(merkleRoot(leaves, n)), `size ${n}`).toBe(root));
  });

  it('uses the 0x00 leaf and 0x01 node prefixes', () => {
    expect(bytesToHex(leafHash(new Uint8Array(0)))).toBe(bytesToHex(sha256(Uint8Array.of(0))));
    const a = leafHash(Uint8Array.of(1)), b = leafHash(Uint8Array.of(2));
    expect(bytesToHex(nodeHash(a, b))).toBe(bytesToHex(sha256(Uint8Array.of(1, ...a, ...b))));
    expect(bytesToHex(merkleRoot([a, b]))).toBe(bytesToHex(nodeHash(a, b)));
  });

  it('every leaf has a valid inclusion proof (exhaustive for the known answer tree)', () => {
    const leaves = KAT_LEAVES.map((h) => leafHash(hexToBytes(h)));
    for (let n = 1; n <= leaves.length; n++) {
      const root = merkleRoot(leaves, n);
      for (let m = 0; m < n; m++) expect(verifyInclusion(leaves[m], m, n, inclusionProof(leaves, m, n), root), `${m}/${n}`).toBe(true);
    }
  });

  it('property: every leaf of any tree verifies; a modified leaf, path element, root or index fails', () => {
    fc.assert(fc.property(leavesArb(), fc.nat(), fc.nat(), (leaves, a, b) => {
      const n = leaves.length;
      const m = a % n;
      const root = merkleRoot(leaves);
      const proof = inclusionProof(leaves, m);
      if (!verifyInclusion(leaves[m], m, n, proof, root)) return false;
      if (verifyInclusion(flip(leaves[m], b), m, n, proof, root)) return false;
      if (verifyInclusion(leaves[m], m, n, proof, flip(root, b))) return false;
      if (proof.length && verifyInclusion(leaves[m], m, n, proof.map((p, i) => (i === b % proof.length ? flip(p, b) : p)), root)) return false;
      if (proof.length && verifyInclusion(leaves[m], m, n, proof.slice(0, -1), root)) return false;
      if (verifyInclusion(leaves[m], m, n, [...proof, root], root)) return false;
      if (n > 1 && leaves.every((l, i) => i === m || bytesToHex(l) !== bytesToHex(leaves[m])) && verifyInclusion(leaves[m], (m + 1) % n, n, proof, root)) return false;
      if (verifyInclusion(leaves[m], n, n, proof, root)) return false;
      return true;
    }), { numRuns: 300 });
  });

  it('consistency proofs hold between every pair of sizes up to 40, and tampering breaks them', () => {
    const leaves = Array.from({ length: 40 }, (_, i) => leafHash(Uint8Array.of(i, i * 7)));
    for (let n = 1; n <= 40; n++) {
      const r2 = merkleRoot(leaves, n);
      for (let m = 1; m <= n; m++) {
        const r1 = merkleRoot(leaves, m);
        const proof = m === n ? [] : consistencyProof(leaves, m, n);
        expect(verifyConsistency(m, n, r1, r2, proof), `${m}->${n}`).toBe(true);
        if (m < n) {
          expect(verifyConsistency(m, n, flip(r1), r2, proof)).toBe(false);
          expect(verifyConsistency(m, n, r1, flip(r2), proof)).toBe(false);
          expect(verifyConsistency(m, n, r1, r2, proof.map((p, i) => (i === 0 ? flip(p) : p)))).toBe(false);
        }
      }
    }
  });

  it('property: consistency between any two sizes of any tree', () => {
    fc.assert(fc.property(leavesArb(2, 40), fc.nat(), fc.nat(), (leaves, a, b) => {
      const n = 1 + (a % leaves.length);
      const m = 1 + (b % n);
      const proof = m === n ? [] : consistencyProof(leaves, m, n);
      return verifyConsistency(m, n, merkleRoot(leaves, m), merkleRoot(leaves, n), proof);
    }), { numRuns: 300 });
  });

  it('the empty tree is consistent with any tree only under the empty root', () => {
    const leaves = [leafHash(Uint8Array.of(1)), leafHash(Uint8Array.of(2))];
    expect(verifyConsistency(0, 2, EMPTY_ROOT, merkleRoot(leaves), [])).toBe(true);
    expect(verifyConsistency(0, 2, flip(EMPTY_ROOT), merkleRoot(leaves), [])).toBe(false);
    expect(verifyConsistency(0, 2, EMPTY_ROOT, merkleRoot(leaves), [leaves[0]])).toBe(false);
  });

  it('a rewritten history is not consistent with an earlier root', () => {
    const leaves = Array.from({ length: 12 }, (_, i) => leafHash(Uint8Array.of(i)));
    const rewritten = leaves.map((l, i) => (i === 3 ? leafHash(Uint8Array.of(99)) : l));
    const proof = consistencyProof(rewritten, 6, 12);
    expect(verifyConsistency(6, 12, merkleRoot(leaves, 6), merkleRoot(rewritten, 12), proof)).toBe(false);
  });
});

describe('signed checkpoints and receipt proofs over the evidence ledger', () => {
  const { world, now } = getWorld();
  const ledger = world.receipts;
  const key = demoPublicKeys([LEDGER_SIGNER_ID])[LEDGER_SIGNER_ID];
  const checkpoint = makeCheckpoint(ledger, now, demoSigner(LEDGER_SIGNER_ID));
  const recompute = (r: EvidenceReceipt) => computeReceiptHash(r, r.prevHash);

  it('leaves the hash chain untouched and signs a checkpoint that verifies only with the right key', () => {
    expect(verifyChain(ledger).valid).toBe(true);
    expect(checkpoint.treeSize).toBe(ledger.length);
    expect(verifyCheckpointSignature(checkpoint, key)).toBe(true);
    expect(verifyCheckpointSignature(checkpoint, demoPublicKeys(['someone-else'])['someone-else'])).toBe(false);
    expect(verifyCheckpointSignature({ ...checkpoint, treeSize: checkpoint.treeSize - 1 }, key)).toBe(false);
    expect(verifyCheckpointSignature({ ...checkpoint, signature: 'zz' }, key)).toBe(false);
  });

  it('every sampled receipt has an inclusion proof that verifies', () => {
    for (let i = 0; i < ledger.length; i += 37) {
      const p = inclusionProofFor(ledger, ledger[i].id, checkpoint)!;
      expect(verifyInclusionProof(p, key, recompute), ledger[i].id).toEqual({ ok: true });
    }
  });

  it('any edit to a hashed receipt field, the path, the index or the root is rejected', () => {
    const p = inclusionProofFor(ledger, ledger[123].id, checkpoint)!;
    const bad = (q: InclusionProof) => verifyInclusionProof(q, key, recompute).ok;
    expect(bad({ ...p, receipt: { ...p.receipt, issuer: 'someone else' } })).toBe(false);
    expect(bad({ ...p, receipt: { ...p.receipt, validUntil: '2099-01-01T00:00:00.000Z' } })).toBe(false);
    expect(bad({ ...p, inclusionPath: p.inclusionPath.map((h, i) => (i === 2 ? h.replace(/^./, (c) => (c === '0' ? '1' : '0')) : h)) })).toBe(false);
    expect(bad({ ...p, leafIndex: p.leafIndex + 1 })).toBe(false);
    expect(bad({ ...p, checkpoint: { ...p.checkpoint, rootHash: '0'.repeat(64) } })).toBe(false);
    // A checkpoint of another ledger, even one signed with the same key, is rejected.
    const foreign = makeCheckpoint(ledger, now, demoSigner(LEDGER_SIGNER_ID), 'some-other-ledger');
    expect(bad(inclusionProofFor(ledger, ledger[123].id, foreign)!)).toBe(false);
  });

  it('documents the limit: only the hashed fields are proven, not summary text or status', () => {
    const p = inclusionProofFor(ledger, ledger[5].id, checkpoint)!;
    expect(verifyInclusionProof({ ...p, receipt: { ...p.receipt, status: 'revoked' } }, key, recompute).ok).toBe(true);
    expect(verifyInclusionProof({ ...p, receipt: { ...p.receipt, summary: 'edited' } }, key, recompute).ok).toBe(true);
    expect([...HASHED_RECEIPT_FIELDS]).toEqual(['id', 'type', 'subjectRef', 'issuer', 'verifiedBy', 'method', 'scope', 'validFrom', 'validUntil', 'sharedWith']);
  });

  it('a later checkpoint is provably consistent with an earlier one', () => {
    const p = consistencyProofBetween(ledger, 400, ledger.length);
    expect(p.second.rootHash).toBe(checkpoint.rootHash);
    expect(verifyConsistencyProof(p)).toBe(true);
    expect(verifyConsistencyProof({ ...p, first: { ...p.first, rootHash: '1'.repeat(64) } })).toBe(false);
  });

  it('API: checkpoint with consistency, proof per receipt, 404 and 400', async () => {
    const res = await checkpointRoute(new Request('http://x/api/v1/ledger/checkpoint?from=100'));
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.demoKey).toBe(true);
    expect(verifyCheckpointSignature(b.checkpoint, b.publicKey)).toBe(true);
    expect(verifyConsistencyProof(b.consistency)).toBe(true);
    expect((await checkpointRoute(new Request('http://x/api/v1/ledger/checkpoint?from=-1'))).status).toBe(400);
    expect((await checkpointRoute(new Request('http://x/api/v1/ledger/checkpoint?from=1.5'))).status).toBe(400);
    for (const odd of ['0x10', '1e1', ' 5', '5 ']) expect((await checkpointRoute(new Request(`http://x/api/v1/ledger/checkpoint?from=${encodeURIComponent(odd)}`))).status, odd).toBe(400);
    const id = ledger[42].id;
    const pr = await proofRoute(new Request(`http://x/api/v1/receipts/${id}/proof`), { params: Promise.resolve({ id }) });
    expect(pr.status).toBe(200);
    expect(verifyInclusionProof(await pr.json(), key, recompute)).toEqual({ ok: true });
    expect((await proofRoute(new Request('http://x/api/v1/receipts/NOPE/proof'), { params: Promise.resolve({ id: 'NOPE' }) })).status).toBe(404);
  });

  it('the offline verifier accepts a real proof and rejects a tampered one', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'madoun-proof-'));
    const good = inclusionProofFor(ledger, ledger[77].id, checkpoint)!;
    const run = (proof: unknown, k = key) => {
      const f = path.join(dir, `p${Math.random().toString(36).slice(2)}.json`);
      fs.writeFileSync(f, JSON.stringify(proof));
      try {
        return { code: 0, out: execFileSync(process.execPath, ['scripts/verify-proof.mjs', f, k], { encoding: 'utf8' }) };
      } catch (e) {
        const err = e as { status: number; stdout: string };
        return { code: err.status, out: err.stdout };
      }
    };
    const ok = run(good);
    expect(ok.code).toBe(0);
    expect(ok.out).toMatch(/^VALID/);
    expect(ok.out).toContain('Not proven: summary, summaryAr, status, revokedReason');
    expect(run(inclusionProofFor(ledger, ledger[77].id, makeCheckpoint(ledger, now, demoSigner(LEDGER_SIGNER_ID), 'other-ledger'))).code).toBe(1);
    for (const tampered of [
      { ...good, receipt: { ...good.receipt, verifiedBy: 'nobody' } },
      { ...good, leafIndex: good.leafIndex + 1 },
      { ...good, inclusionPath: [...good.inclusionPath].reverse() },
      { ...good, checkpoint: { ...good.checkpoint, timestamp: '2030-01-01T00:00:00.000Z' } },
    ]) {
      const r = run(tampered);
      expect(r.code).toBe(1);
      expect(r.out).toMatch(/^INVALID/);
    }
    expect(run(good, demoPublicKeys(['other'])['other']).code).toBe(1);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('the offline verifier imports only Node built-ins and @noble', () => {
    const src = fs.readFileSync('scripts/verify-proof.mjs', 'utf8');
    for (const m of src.matchAll(/^import .* from '([^']+)';$/gm)) expect(m[1]).toMatch(/^(node:|@noble\/)/);
  });
});
