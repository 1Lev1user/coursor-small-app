// Decision F3: the app stays out of search engines. A project site
// (1lev1user.github.io/coursor-small-app/) cannot serve its own robots.txt,
// because crawlers read it only from the host root, so this meta tag in
// index.html is the only control. This test fails if it is removed or loosened.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

function robotsMetas(html) {
    return [...html.matchAll(/<meta\b[^>]*>/gi)]
        .map((match) => match[0])
        .filter((tag) => /\bname\s*=\s*["']robots["']/i.test(tag))
        .map((tag) => (tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i) || [, ''])[1]);
}

function directives(value) {
    return value.toLowerCase().split(',').map((part) => part.trim());
}

test('index.html keeps the noindex, nofollow robots meta (decision F3)', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const metas = robotsMetas(html);
    assert.equal(metas.length, 1, 'index.html must have exactly one robots meta tag');
    assert.deepEqual(directives(metas[0]), ['noindex', 'nofollow']);
    assert.ok(html.includes('<meta name="robots" content="noindex, nofollow">'));
});

test('the robots meta guard detects missing, loosened and duplicate tags', () => {
    assert.deepEqual(robotsMetas('<meta name="description" content="noindex">'), []);
    assert.ok(!directives(robotsMetas('<meta name="robots" content="index, follow">')[0]).includes('noindex'));
    assert.ok(!directives(robotsMetas('<meta name="robots" content="noindex">')[0]).includes('nofollow'));
    assert.equal(
        robotsMetas('<meta name="robots" content="noindex"><meta name="robots" content="index">').length,
        2,
    );
    assert.deepEqual(robotsMetas('<META CONTENT="noindex, nofollow" NAME="Robots">'), ['noindex, nofollow']);
});
