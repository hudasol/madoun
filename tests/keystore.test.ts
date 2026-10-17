import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEDGER_SIGNER_ID, demoPublicKeys, makeCheckpoint, verifyCheckpointSignature } from '@/engine';
import { KeystoreError, fileSigner } from '@/server/keystore';
import { getWorld } from '@/server/world';

describe('file based development keystore', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'madoun-key-'));
  const write = (name: string, content: string) => { const f = path.join(dir, name); fs.writeFileSync(f, content); return f; };

  it('signs checkpoints through the Signer interface; they verify with its public key only', () => {
    const { signer, publicKey } = fileSigner(write('ok.key', 'a1'.repeat(32) + '\n'), LEDGER_SIGNER_ID);
    const { world, now } = getWorld();
    const c = makeCheckpoint(world.receipts, now, signer);
    expect(verifyCheckpointSignature(c, publicKey)).toBe(true);
    const other = fileSigner(write('other.key', 'b2'.repeat(32)), LEDGER_SIGNER_ID);
    expect(verifyCheckpointSignature(c, other.publicKey)).toBe(false);
  });

  it('fails closed on a missing file, the wrong length or anything but lowercase hex', () => {
    expect(() => fileSigner(path.join(dir, 'missing.key'), 'x')).toThrow(KeystoreError);
    expect(() => fileSigner(write('short.key', 'ab'.repeat(16)), 'x')).toThrow(KeystoreError);
    expect(() => fileSigner(write('upper.key', 'AB'.repeat(32)), 'x')).toThrow(KeystoreError);
    expect(() => fileSigner(write('junk.key', 'not a key'), 'x')).toThrow(KeystoreError);
  });

  it('docs/key-custody.md publishes the demo ledger key the server actually uses', () => {
    expect(fs.readFileSync('docs/key-custody.md', 'utf8')).toContain(demoPublicKeys([LEDGER_SIGNER_ID])[LEDGER_SIGNER_ID]);
  });

  it('the key folder is ignored by git', () => {
    expect(fs.readFileSync('.gitignore', 'utf8')).toMatch(/^\.keys\/$/m);
  });
});
