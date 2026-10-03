import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const swSource = readFileSync(join(root, 'sw.js'), 'utf8');
const shipListPath = join(root, 'scripts', 'ship-files.txt');

function shipEntries() {
    const content = readFileSync(shipListPath, 'utf8');
    return content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
}

function coreAssets() {
    const block = swSource.match(/const CORE_ASSETS = \[([\s\S]*?)\];/);
    assert.ok(block, 'CORE_ASSETS list not found in sw.js');
    return [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

function covered(path, entries) {
    // Strip './' prefix from CORE_ASSETS entries
    let assetPath = path;
    if (assetPath.startsWith('./')) {
        assetPath = assetPath.slice(2);
    }

    // Convert empty path (which was './') to 'index.html'
    if (assetPath === '') {
        assetPath = 'index.html';
    }

    // Check for exact match or directory match
    for (const entry of entries) {
        if (entry === assetPath) {
            return true;
        }
        if (entry.endsWith('/') && assetPath.startsWith(entry)) {
            return true;
        }
    }
    return false;
}

function overlaps(pathA, pathB) {
    // Both ways: check if either fully contains the other's scope
    // Case-insensitive comparison
    const pathALower = pathA.toLowerCase();
    const pathBLower = pathB.toLowerCase();
    const aDir = pathALower.endsWith('/');
    const bDir = pathBLower.endsWith('/');

    if (aDir && bDir) {
        // Both directories: overlap if one is inside the other
        return pathALower.startsWith(pathBLower) || pathBLower.startsWith(pathALower);
    }
    if (aDir) {
        // A is dir, B is file: overlap if B is inside A
        return pathBLower.startsWith(pathALower);
    }
    if (bDir) {
        // B is dir, A is file: overlap if A is inside B
        return pathALower.startsWith(pathBLower);
    }
    // Both files: overlap only if exact match
    return pathALower === pathBLower;
}

function validateEntry(entry) {
    const problems = [];
    if (!entry) problems.push('empty entry');
    if (entry.startsWith('/')) problems.push("starts with '/'");
    if (entry.includes('..')) problems.push("contains '..'");
    if (entry.startsWith('./')) problems.push("starts with './'");
    if (entry.includes('\\')) problems.push('contains backslash');
    return problems;
}

function findDuplicates(entries) {
    return entries.filter((entry, index) => entries.indexOf(entry) !== index);
}

test('ship list file exists', () => {
    const stat = statSync(shipListPath);
    assert.ok(stat.isFile(), 'ship-files.txt is not a file');

    const entries = shipEntries();
    assert.ok(entries.length > 0, 'ship list is empty');
});

test('every CORE_ASSETS entry is covered by ship list', () => {
    const entries = shipEntries();
    const assets = coreAssets();
    assert.ok(assets.length > 0, 'CORE_ASSETS is empty');

    for (const asset of assets) {
        assert.ok(
            covered(asset, entries),
            `CORE_ASSETS entry "${asset}" is not covered by ship list`
        );
    }
});

// True when the entry exists on disk as what its spelling says: dir if it ends with '/', file otherwise.
function existsAsDeclared(entry) {
    try {
        const stat = statSync(join(root, entry));
        return entry.endsWith('/') ? stat.isDirectory() : stat.isFile();
    } catch {
        return false;
    }
}

const FORBIDDEN = [
    'test/',
    'scripts/',
    '.claude/',
    '.github/',
    'cards/',
    'process/',
    'package.json',
    'CLAUDE.md',
    'AGENTS.md',
    'anchor.md',
    'SPEC.md',
    'STORYMAP.md',
    'claude-progress.txt',
    'DESIGN.md',
    'PROJECT_MAP.json',
    'RELEASE_PLAN.json',
];

function forbiddenHits(entries) {
    return entries.flatMap((entry) =>
        FORBIDDEN.filter((forbid) => overlaps(entry, forbid)).map((forbid) => `${entry} ~ ${forbid}`)
    );
}

test('every ship list entry exists', () => {
    const entries = shipEntries();
    assert.ok(entries.length > 0, 'ship list is empty');

    for (const entry of entries) {
        assert.ok(existsAsDeclared(entry), `entry "${entry}" does not exist as a ${entry.endsWith('/') ? 'directory' : 'file'}`);
    }
});

test('existsAsDeclared rejects missing paths and wrong kinds', () => {
    assert.ok(existsAsDeclared('src/'));
    assert.ok(existsAsDeclared('index.html'));
    assert.ok(!existsAsDeclared('no-such-dir-xyz/'));
    assert.ok(!existsAsDeclared('no-such-file-xyz.txt'));
    assert.ok(!existsAsDeclared('index.html/'), 'a file spelled as a directory');
    assert.ok(!existsAsDeclared('src'), 'a directory spelled as a file');
});

test('ship list does not overlap forbidden paths', () => {
    assert.deepEqual(forbiddenHits(shipEntries()), []);
});

test('every forbidden path from the card is flagged when listed', () => {
    const fromCard = [
        'test/', 'scripts/', '.claude/', '.github/', 'cards/', 'process/', 'package.json',
        'CLAUDE.md', 'AGENTS.md', 'anchor.md', 'SPEC.md', 'STORYMAP.md', 'claude-progress.txt',
        'DESIGN.md', 'PROJECT_MAP.json', 'RELEASE_PLAN.json',
    ];
    for (const path of fromCard) {
        assert.ok(forbiddenHits([path]).length > 0, `"${path}" should be flagged`);
    }
    assert.deepEqual(forbiddenHits(['src/', 'index.html']), []);
    assert.ok(forbiddenHits(['scripts/x.js']).length > 0, 'file nested inside a forbidden directory');
    assert.ok(forbiddenHits(['claude.md']).length > 0, 'forbidden file in different case');
    assert.ok(forbiddenHits(['TEST/']).length > 0, 'forbidden directory in different case');
});

test('ship list entries are valid', () => {
    const entries = shipEntries();

    assert.ok(entries.length > 0, 'ship list is empty');

    for (const entry of entries) {
        assert.deepEqual(validateEntry(entry), [], `entry "${entry}" is invalid`);
    }
    assert.deepEqual(findDuplicates(entries), [], 'duplicate entries in ship list');
});

test('validateEntry rejects bad entries and accepts a good one', () => {
    const bad = ['src/../test/', 'docs/..', 'a/../b', '../x', '..', '/abs', './x', 'a\\b', ''];
    for (const entry of bad) {
        assert.ok(validateEntry(entry).length > 0, `"${entry}" should be rejected`);
    }
    assert.deepEqual(validateEntry('src/'), []);
});

test('findDuplicates detects a repeated entry', () => {
    assert.deepEqual(findDuplicates(['a', 'src/', 'a']), ['a']);
    assert.deepEqual(findDuplicates(['a', 'src/']), []);
});

test('covered matches files, directories and the ./ root only', () => {
    assert.ok(covered('./', ['index.html']), "'./' maps to index.html");
    assert.ok(!covered('./', ['style.css']), 'index.html not listed');
    assert.ok(covered('./src/a.js', ['src/']), 'file inside listed directory');
    assert.ok(!covered('./srcx/a.js', ['src/']), 'sibling prefix is not covered');
    assert.ok(!covered('./foo.js', ['index.html']), 'unlisted file');
    assert.ok(!covered('index.html', ['index.h']), 'a file entry is not a prefix match');
});

test('forbidden path check is case-insensitive', () => {
    assert.ok(overlaps('Claude.MD', 'CLAUDE.md'), 'different case, entry first');
    assert.ok(overlaps('CLAUDE.md', 'Claude.MD'), 'different case, forbidden first');
    assert.ok(overlaps('Scripts/x.js', 'scripts/'), 'directory prefix in different case');
    assert.ok(overlaps('SCRIPTS/', 'scripts/x.js'), 'uppercase directory containing a forbidden file');
});

test('overlaps handles every file and directory combination', () => {
    assert.ok(overlaps('scripts/x.js', 'scripts/'), 'file inside forbidden dir');
    assert.ok(overlaps('scripts/', 'scripts/x.js'), 'dir containing forbidden file');
    assert.ok(overlaps('scripts/sub/', 'scripts/'), 'dir inside forbidden dir');
    assert.ok(overlaps('scripts/', 'scripts/sub/'), 'dir containing forbidden dir');
    assert.ok(!overlaps('scriptsx/', 'scripts/'), 'sibling prefix is not an overlap');
    assert.ok(!overlaps('a.md', 'b.md'), 'different files');
});

test('rejects entries overlapping with forbidden directories', () => {
    // Test that scripts/x.js is caught as overlapping with forbidden scripts/
    const entry = 'scripts/x.js';
    const forbidden = 'scripts/';
    assert.ok(overlaps(entry, forbidden), 'scripts/x.js should overlap with scripts/ directory');
});
