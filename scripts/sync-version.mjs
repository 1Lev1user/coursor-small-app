// Copies the version from package.json into `const VERSION = '...';` in sw.js. Exit 1 with a message on problems.
// Run by npm after `npm version` bumps package.json. Override the repo root with VERSION_ROOT (used for tests).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.VERSION_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const LINE = /const VERSION = '[^']*';/;

const fail = (msg) => { console.error(`sync-version: ${msg}`); process.exit(1); };

const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
if (typeof version !== 'string' || version.trim() === '') fail('package.json has no version');

const swPath = join(ROOT, 'sw.js');
const text = readFileSync(swPath, 'utf8');
if (!LINE.test(text)) fail("sw.js has no `const VERSION = '...';` line");

const next = text.replace(LINE, () => `const VERSION = '${version}';`);
if (next !== text) writeFileSync(swPath, next);
console.log(version);
