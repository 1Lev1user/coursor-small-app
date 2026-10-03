import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/views/import.js', import.meta.url), 'utf8');

test('import file picker accepts CSV, spreadsheet, XML, MT940 and OFX/QFX extensions', () => {
    const matches = [...source.matchAll(/input\.accept\s*=\s*'([^']*)'/g)];
    assert.equal(matches.length, 1, 'exactly one input.accept assignment');
    const tokens = matches[0][1].split(',').map((t) => t.trim());
    for (const ext of ['.csv', '.txt', '.xlsx', '.xls', '.xml', '.sta', '.mt940', '.ofx', '.qfx']) {
        assert.ok(tokens.includes(ext), `accept list contains ${ext}`);
    }
});
