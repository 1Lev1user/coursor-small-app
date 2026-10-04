import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import { statementRow } from '../src/import/types.js';
import {
    findDuplicates,
    defaultDecisions,
    fingerprint,
    buildImport,
    applyImport,
} from '../src/import/core.js';
import { DUPLICATE_GROUPS } from '../src/views/import.js';

const NOW = new Date(2026, 8, 25, 12, 0, 0);

test('rows that look like a saved entry start unticked, a clean row stays ticked', () => {
    const data = defaultData();
    data.expenses = [
        { id: 'm1', categoryId: 'random', subcategoryId: '', amountCents: 320, note: 'Coffee', date: '2026-09-10' },
        { id: 'm2', categoryId: 'random', subcategoryId: '', amountCents: 999, note: 'Book', date: '2026-09-10' },
    ];
    const rows = [
        statementRow({ date: '2026-09-10', amountCents: 320, direction: 'out', description: 'KAFIJA' }),
        statementRow({ date: '2026-09-12', amountCents: 999, direction: 'out', description: 'BOOKS' }),
        statementRow({ date: '2026-09-11', amountCents: 4500, direction: 'out', description: 'FUEL' }),
    ];
    const duplicates = findDuplicates(data, rows);
    assert.deepEqual(duplicates.map(({ level }) => level), ['probable', 'weak', null]);
    assert.deepEqual(defaultDecisions(data, rows, duplicates).map(({ include }) => include), [false, false, true]);
});

test('a camt row with other text for a CSV entry of the same day is a possible duplicate, unticked', () => {
    const data = defaultData();
    const csvRow = statementRow({ date: '2026-09-13', amountCents: 1234, direction: 'out', description: 'RIMI VEIKALS' });
    data.expenses = [{
        id: 'exp_csv',
        categoryId: 'random',
        subcategoryId: '',
        amountCents: 1234,
        note: 'RIMI VEIKALS',
        date: '2026-09-13',
        importId: 'imp_a',
        fingerprint: fingerprint(csvRow),
    }];
    const camt = statementRow({ date: '2026-09-13', amountCents: 1234, direction: 'out', counterparty: 'SIA RIMI LATVIJA', bankRef: '' });
    const duplicates = findDuplicates(data, [camt]);
    assert.equal(duplicates[0].level, 'weak');
    assert.equal(defaultDecisions(data, [camt], duplicates)[0].include, false);
});

test('a row matched as ignored from an earlier skipped import stays unticked', () => {
    const data = defaultData();
    const rows = [statementRow({ date: '2026-09-03', amountCents: 120, direction: 'out', description: 'Bank fee' })];
    const decisions = defaultDecisions(data, rows);
    decisions[0].kind = 'skip';
    const built = buildImport(data, decisions, { rows, format: 'csv', fileName: 'a.csv', now: NOW });
    assert.equal(applyImport(data, built, {}).ok, true);
    const again = findDuplicates(data, rows);
    assert.equal(again[0].level, 'exact');
    assert.equal(again[0].matchType, 'ignored');
    assert.equal(defaultDecisions(data, rows, again)[0].include, false);
});

test('the duplicate groups keep their order and say that a possible duplicate needs a tick', () => {
    assert.deepEqual(DUPLICATE_GROUPS.map(([level]) => level), ['exact', 'probable', 'weak']);
    const [exact, probable, weak] = DUPLICATE_GROUPS;
    assert.equal(exact[1], 'Exact');
    assert.equal(probable[1].startsWith('Possible duplicate'), true);
    assert.equal(weak[1].startsWith('Possible duplicate'), true);
    assert.equal(probable[2].includes('tick it'), true);
    assert.equal(weak[2].includes('tick it'), true);
});
