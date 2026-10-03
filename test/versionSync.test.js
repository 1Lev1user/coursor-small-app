import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', 'scripts', 'sync-version.mjs');
const REAL_PACKAGE = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8'));

const SW = (eol) => ['// header', "const VERSION = '2.0.0';", 'const CACHE_NAME = `x-${VERSION}`;', ''].join(eol);

function makeRoot(pkgVersion, swText) {
    const dir = mkdtempSync(join(tmpdir(), 'version-sync-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: pkgVersion }));
    writeFileSync(join(dir, 'sw.js'), swText);
    return dir;
}

const run = (dir) => execFileSync(process.execPath, [SCRIPT], {
    env: { ...process.env, VERSION_ROOT: dir },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
});

function withRoot(pkgVersion, swText, fn) {
    const dir = makeRoot(pkgVersion, swText);
    try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('writes the package.json version into sw.js and prints it', () => {
    withRoot('9.9.9', SW('\n'), (dir) => {
        const out = run(dir);
        assert.equal(out.trim(), '9.9.9');
        assert.equal(readFileSync(join(dir, 'sw.js'), 'utf8'), SW('\n').replace('2.0.0', '9.9.9'));
    });
});

test('a second run changes nothing', () => {
    withRoot('9.9.9', SW('\n'), (dir) => {
        run(dir);
        const first = readFileSync(join(dir, 'sw.js'), 'utf8');
        run(dir);
        assert.equal(readFileSync(join(dir, 'sw.js'), 'utf8'), first);
    });
});

test('keeps CRLF line endings', () => {
    withRoot('3.1.4', SW('\r\n'), (dir) => {
        run(dir);
        assert.equal(readFileSync(join(dir, 'sw.js'), 'utf8'), SW('\r\n').replace('2.0.0', '3.1.4'));
    });
});

test('a missing VERSION line exits 1 with a message and leaves sw.js alone', () => {
    const text = '// no version here\n';
    withRoot('9.9.9', text, (dir) => {
        assert.throws(() => run(dir), (err) => err.status === 1 && /VERSION/.test(err.stderr));
        assert.equal(readFileSync(join(dir, 'sw.js'), 'utf8'), text);
    });
});

test('package.json runs the sync as its version script and stages sw.js', () => {
    const script = REAL_PACKAGE.scripts.version;
    assert.match(script, /sync-version\.mjs/);
    assert.match(script, /git add sw\.js/);
});
