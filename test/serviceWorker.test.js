import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const swSource = readFileSync(join(root, 'sw.js'), 'utf8');

function coreAssets() {
    const block = swSource.match(/const CORE_ASSETS = \[([\s\S]*?)\];/);
    assert.ok(block, 'CORE_ASSETS list not found in sw.js');
    return [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

function filesUnder(dir) {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? filesUnder(path) : [path];
    });
}

test('offline cache lists every app module', () => {
    const cached = new Set(coreAssets());
    const modules = filesUnder(join(root, 'src'))
        .filter((path) => path.endsWith('.js'))
        .map((path) => `./${relative(root, path).split('\\').join('/')}`);

    const missing = modules.filter((path) => !cached.has(path));
    assert.deepEqual(missing, [], `add to CORE_ASSETS in sw.js: ${missing.join(', ')}`);
});

test('offline cache lists every font file', () => {
    const cached = new Set(coreAssets());
    const fonts = filesUnder(join(root, 'fonts'))
        .filter((path) => path.endsWith('.woff2'))
        .map((path) => `./${relative(root, path).split('\\').join('/')}`);

    const missing = fonts.filter((path) => !cached.has(path));
    assert.deepEqual(missing, [], `add to CORE_ASSETS in sw.js: ${missing.join(', ')}`);
});

test('offline cache lists only files that exist', () => {
    for (const asset of coreAssets()) {
        if (asset === './') {
            continue;
        }
        assert.ok(statSync(join(root, asset)).isFile(), `${asset} is in CORE_ASSETS but does not exist`);
    }
});

test('service worker version matches package.json', () => {
    const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const match = swSource.match(/const VERSION = '([^']+)';/);
    assert.ok(match, 'VERSION constant not found in sw.js');
    assert.equal(match[1], version);
});
