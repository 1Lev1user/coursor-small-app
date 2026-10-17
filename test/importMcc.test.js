import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData, deleteCategory, deleteSubcategory, UNCATEGORISED_ID } from '../src/model.js';
import { statementRow } from '../src/import/types.js';
import { subcategoryForMcc } from '../src/import/mcc.js';
import {
    applyImport,
    buildImport,
    defaultDecisions,
    findDuplicates,
    upsertRule,
} from '../src/import/core.js';

const NOW = new Date(2026, 9, 6, 12);

const GROUPS = {
    groceries: [5411, 5422, 5441, 5451, 5462, 5499],
    'eating-out': [5811, 5812, 5813, 5814],
    transport: [4011, 4111, 4112, 4121, 4131, 4784, 4789, 5541, 5542, 7512, 7523],
    utilities: [4814, 4899, 4900],
    health: [5122, 5912, 8011, 8021, 8031, 8041, 8042, 8043, 8049, 8050, 8062, 8071, 8099],
    insurance: [6300],
    shopping: [
        5200, 5251, 5261, 5310, 5311, 5611, 5621, 5631, 5641, 5651, 5655, 5661, 5691, 5699,
        5712, 5719, 5722, 5732, 5733, 5941, 5942, 5945, 5977, 5992, 5999,
    ],
};

const EXPECTED = new Map();
for (const [id, codes] of Object.entries(GROUPS)) {
    for (const code of codes) EXPECTED.set(String(code), id);
}

function freshData() {
    const data = defaultData();
    data.rules = [];
    data.imports = [];
    return data;
}

function rimi(extra = {}) {
    return {
        ...statementRow({ date: '2026-10-05', amountCents: 840, direction: 'out', description: 'RIMI 123 RIGA', bankRef: 'R-1' }),
        mcc: '5411',
        ...extra,
    };
}

const PLAIN = {
    include: true,
    kind: 'expense',
    categoryId: UNCATEGORISED_ID,
    subcategoryId: '',
    incomeCategoryId: 'income-other',
    remember: false,
    ruleId: '',
    showAs: '',
};

test('each group maps its sample code to its default subcategory', () => {
    const samples = {
        5411: 'groceries', 5812: 'eating-out', 4121: 'transport', 4814: 'utilities',
        8021: 'health', 6300: 'insurance', 5691: 'shopping',
    };
    for (const [code, id] of Object.entries(samples)) {
        assert.equal(subcategoryForMcc(code), id, code);
    }
    assert.equal(subcategoryForMcc(5411), 'groceries');
    assert.equal(subcategoryForMcc(' 5411 '), 'groceries');
});

test('unmapped and malformed codes give an empty string', () => {
    const codes = ['5734', '5818', '7999', '5994', '6012', '7011', '4829', '3304', '4511', '', '54', 'abcd', 54110, undefined, null];
    for (const code of codes) {
        assert.equal(subcategoryForMcc(code), '', String(code));
    }
});

test('sweeping 0000-9999 maps exactly the codes of the card and no others', () => {
    const data = defaultData();
    const subIds = new Set(data.categories.flatMap(({ subcategories }) => subcategories.map(({ id }) => id)));
    for (let n = 0; n <= 9999; n += 1) {
        const code = String(n).padStart(4, '0');
        const got = subcategoryForMcc(code);
        assert.equal(got, EXPECTED.get(code) ?? '', code);
        if (got !== '') assert.equal(subIds.has(got), true, `${code} -> ${got}`);
    }
    for (const [from, to] of [[3000, 3350], [3501, 3999], [6010, 6012]]) {
        for (let n = from; n <= to; n += 1) assert.equal(subcategoryForMcc(String(n)), '');
    }
});

test('a money-out row with an MCC is suggested the matching default category', () => {
    const [decision] = defaultDecisions(freshData(), [rimi()]);
    assert.deepEqual(decision, { ...PLAIN, categoryId: 'necessary', subcategoryId: 'groceries' });
});

test('a deleted subcategory or category gives no suggestion', () => {
    const noSub = freshData();
    assert.equal(deleteSubcategory(noSub, 'necessary', 'groceries').ok, true);
    assert.deepEqual(defaultDecisions(noSub, [rimi()])[0], PLAIN);

    const noCategory = freshData();
    assert.equal(deleteCategory(noCategory, 'necessary').ok, true);
    assert.deepEqual(defaultDecisions(noCategory, [rimi()])[0], PLAIN);
});

test('a renamed subcategory with the same id is still suggested', () => {
    const data = freshData();
    data.categories.find(({ id }) => id === 'necessary').subcategories.find(({ id }) => id === 'groceries').name = 'Food shopping';
    const [decision] = defaultDecisions(data, [rimi()]);
    assert.equal(decision.categoryId, 'necessary');
    assert.equal(decision.subcategoryId, 'groceries');
});

test('a saved rule wins over the MCC', () => {
    const data = freshData();
    upsertRule(data, { pattern: 'RIMI', kind: 'expense', categoryId: 'random', subcategoryId: 'shopping' });
    const [decision] = defaultDecisions(data, [rimi()]);
    assert.equal(decision.categoryId, 'random');
    assert.equal(decision.subcategoryId, 'shopping');
    assert.equal(decision.ruleId, data.rules[0].id);
    assert.notEqual(decision.ruleId, '');
});

test('a saved skip or transfer rule keeps its kind and gets no MCC category', () => {
    for (const kind of ['skip', 'transfer']) {
        const data = freshData();
        upsertRule(data, { pattern: 'RIMI', kind });
        const [decision] = defaultDecisions(data, [rimi()]);
        assert.equal(decision.kind, kind);
        assert.equal(decision.categoryId, UNCATEGORISED_ID);
        assert.equal(decision.subcategoryId, '');
        assert.equal(decision.ruleId, data.rules[0].id);
    }
});

test('money in with an MCC stays income, or a refund of a matching expense rule', () => {
    const moneyIn = rimi({ direction: 'in' });
    const [income] = defaultDecisions(freshData(), [moneyIn]);
    assert.deepEqual(income, { ...PLAIN, kind: 'income' });

    const data = freshData();
    upsertRule(data, { pattern: 'RIMI', kind: 'expense', categoryId: 'random', subcategoryId: 'shopping' });
    const [refund] = defaultDecisions(data, [moneyIn]);
    assert.equal(refund.kind, 'refund');
    assert.equal(refund.categoryId, 'random');
    assert.equal(refund.subcategoryId, 'shopping');
});

test('rows without an MCC, with an empty one or an unmapped one get exactly the plain decision', () => {
    const base = statementRow({ date: '2026-10-05', amountCents: 840, direction: 'out', description: 'RIMI 123 RIGA' });
    const decisions = defaultDecisions(freshData(), [base, { ...base, mcc: '' }, { ...base, mcc: '7999' }]);
    for (const decision of decisions) assert.deepEqual(decision, PLAIN);
});

test('importing a suggested row saves the expense in the suggested category and no rule', () => {
    const data = freshData();
    const rows = [rimi()];
    const built = buildImport(data, defaultDecisions(data, rows), { rows, format: 'xls', fileName: 'a.xls', now: NOW });
    assert.equal(built.ok, true);
    assert.deepEqual(built.rules, []);
    assert.equal(built.expenses.length, 1);
    assert.equal(built.expenses[0].categoryId, 'necessary');
    assert.equal(built.expenses[0].subcategoryId, 'groceries');
});

test('ticking Remember saves a rule in the suggested category', () => {
    const data = freshData();
    const rows = [rimi()];
    const decisions = defaultDecisions(data, rows);
    decisions[0].remember = true;
    decisions[0].pattern = 'RIMI';
    const built = buildImport(data, decisions, { rows, format: 'xls', fileName: 'a.xls', now: NOW });
    assert.equal(built.ok, true);
    assert.equal(built.rules.length, 1);
    assert.equal(built.rules[0].categoryId, 'necessary');
    assert.equal(built.rules[0].subcategoryId, 'groceries');
});

test('a duplicate row stays unticked but still carries the suggestion', () => {
    const data = freshData();
    const rows = [rimi()];
    const built = buildImport(data, defaultDecisions(data, rows), { rows, format: 'xls', fileName: 'a.xls', now: NOW });
    assert.equal(applyImport(data, built, {}).ok, true);

    const duplicates = findDuplicates(data, rows);
    assert.ok(duplicates[0].level);
    const [decision] = defaultDecisions(data, rows, duplicates);
    assert.equal(decision.include, false);
    assert.equal(decision.categoryId, 'necessary');
    assert.equal(decision.subcategoryId, 'groceries');
});
