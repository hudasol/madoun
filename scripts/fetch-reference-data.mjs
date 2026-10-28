// Downloads the published Korea Customs declaration dataset used by `npm run benchmark`.
//
//   node scripts/fetch-reference-data.mjs
//
// Source: https://github.com/Seondong/Customs-Declaration-Datasets (MIT licence, Institute for Basic Science
// and Korea Customs Service), described in arXiv 2208.02484. The files are checked against pinned SHA-256
// digests (the same ones recorded in docs/preregistration-benchmark.md) and are written to data/external/,
// which git ignores. The data is a synthetic copy of real Korean declarations; read the preregistration for
// what it can and cannot show.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'data', 'external', 'korea-customs');
const base = 'https://raw.githubusercontent.com/Seondong/Customs-Declaration-Datasets/en/data/';
const files = {
  'df_syn_train_eng.csv': 'ecec832d94f9f01e49a76884102c8d346945b61cf26b36ca75fea1a703a3cec5',
  'df_syn_valid_eng.csv': 'ad012c2da5ec025e6676466f10535309028ec0963b6a135215fbb07de79ac7de',
  'df_syn_test_eng.csv': '618b81fca639119e40dfdb55dfa7f07822b7bd5abdcdb66fc8d02d71ebbba98e',
};

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
fs.mkdirSync(dir, { recursive: true });

let failed = false;
for (const [name, digest] of Object.entries(files)) {
  const target = path.join(dir, name);
  if (fs.existsSync(target) && sha(fs.readFileSync(target)) === digest) {
    console.log(`ok       ${name} (already present)`);
    continue;
  }
  const res = await fetch(base + name);
  if (!res.ok) {
    console.error(`FAILED   ${name}: HTTP ${res.status}`);
    failed = true;
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha(buf) !== digest) {
    console.error(`FAILED   ${name}: SHA-256 does not match the pinned value, so the file was not saved`);
    failed = true;
    continue;
  }
  fs.writeFileSync(target, buf);
  console.log(`fetched  ${name} (${buf.length} bytes)`);
}
process.exit(failed ? 1 : 0);
