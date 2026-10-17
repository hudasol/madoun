// Finds a Chromium for the scan scripts. Order: PW_CHROMIUM, the Linux CI image, the Playwright cache,
// then the Microsoft Edge that ships with Windows. Nothing is downloaded.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

export async function launchChromium() {
  const list = [process.env.PW_CHROMIUM, '/opt/pw-browsers/chromium'];
  try {
    for (const d of fs.readdirSync('/opt/pw-browsers')) if (d.startsWith('chromium')) list.push(`/opt/pw-browsers/${d}/chrome-linux/chrome`);
  } catch { /* not the CI image */ }
  const executablePath = list.filter(Boolean).find(isFile);
  const args = ['--no-sandbox'];
  if (executablePath) return chromium.launch({ executablePath, args });
  try {
    return await chromium.launch({ args });
  } catch {
    return chromium.launch({ channel: 'msedge', args });
  }
}
