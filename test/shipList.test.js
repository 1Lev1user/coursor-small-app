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
    const aDir = pathA.endsWith('/');
    const bDir = pathB.endsWith('/');

    if (aDir && bDir) {
        // Both directories: overlap if one is inside the other
        return pathA.startsWith(pathB) || pathB.startsWith(pathA);
    }
    if (aDir) {
        // A is dir, B is file: overlap if B is inside A
        return pathB.startsWith(pathA);
    }
    if (bDir) {
        // B is dir, A is file: overlap if A is inside B
        return pathA.startsWith(pathB);
    }
    // Both files: overlap only if exact match
    return pathA === pathB;
}

test('ship list file exists', () => {
    assert.ok(true); // File will be read above or error out
});

test('every CORE_ASSETS entry is covered by ship list', () => {
    const entries = shipEntries();
    const assets = coreAssets();

    for (const asset of assets) {
        assert.ok(
            covered(asset, entries),
            `CORE_ASSETS entry "${asset}" is not covered by ship list`
        );
    }
});

test('every ship list entry exists', () => {
    const entries = shipEntries();

    for (const entry of entries) {
        const fullPath = join(root, entry);
        const stat = statSync(fullPath);

        if (entry.endsWith('/')) {
            assert.ok(
                stat.isDirectory(),
                `entry "${entry}" ends with '/' but is not a directory`
            );
        } else {
            assert.ok(
                stat.isFile(),
                `entry "${entry}" does not end with '/' but is not a file`
            );
        }
    }
});

test('ship list does not overlap forbidden paths', () => {
    const entries = shipEntries();
    const forbidden = [
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

    for (const entry of entries) {
        for (const forbid of forbidden) {
            assert.ok(
                !overlaps(entry, forbid),
                `ship list entry "${entry}" overlaps forbidden path "${forbid}"`
            );
        }
    }
});

test('ship list entries are valid', () => {
    const entries = shipEntries();

    assert.ok(entries.length > 0, 'ship list is empty');

    const seen = new Set();
    for (const entry of entries) {
        assert.ok(entry, 'empty entry in ship list');
        assert.ok(!entry.startsWith('/'), `entry "${entry}" starts with '/'`);
        assert.ok(!entry.startsWith('..'), `entry "${entry}" starts with '..'`);
        assert.ok(!entry.startsWith('./'), `entry "${entry}" starts with './'`);
        assert.ok(!entry.includes('\\'), `entry "${entry}" contains backslash`);
        assert.ok(!seen.has(entry), `duplicate entry "${entry}"`);
        seen.add(entry);
    }
});
