// Creates a development signing key for the ledger checkpoint. NOT FOR PRODUCTION (docs/key-custody.md).
//   node scripts/dev-keystore.mjs [.keys/ledger.key]
// Then start the server with MADOUN_LEDGER_KEY_FILE=.keys/ledger.key. The .keys folder is ignored by git.
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex } from '@noble/hashes/utils.js';

const file = process.argv[2] ?? '.keys/ledger.key';
if (fs.existsSync(file)) {
  console.error(`${file} already exists; refusing to overwrite a key.`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(file), { recursive: true });
const secret = randomBytes(32);
fs.writeFileSync(file, bytesToHex(secret) + '\n', { mode: 0o600 });
console.log(`Development key written to ${file} (owner read and write only where the file system supports it).`);
console.log(`Public key: ${bytesToHex(ed25519.getPublicKey(secret))}`);
console.log('WARNING: a key in a file is for development only. Use an HSM or KMS for anything real.');
