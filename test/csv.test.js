import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import { buildMonthCsv, csvFilename } from '../src/csv.js';

const BOM = '\uFEFF';

function fixture() {
    const data = defaultData();
    data.expenses = [
        {
            id: 'exp_b',
            categoryId: 'necessary',
            subcategoryId: 'groceries',
            amountCents: 1234,
            note: 'milk, bread',
            date: '2026-09-02',
        },
        {
            id: 'exp_a',
            categoryId: 'subscriptions',
            subcategoryId: '',
            amountCents: 999,
            note: 'quoted "plan"',
            date: '2026-09-01',
        },
        {
            id: 'exp_other',
            categoryId: 'missing-cat',
            subcategoryId: 'missing-sub',
            amountCents: 500,
            note: 'line1\nline2',
            date: '2026-09-03',
        },
        {
            id: 'exp_aug',
            categoryId: 'random',
            subcategoryId: 'shopping',
            amountCents: 1000,
            note: 'last month',
            date: '2026-08-31',
        },
    ];
    data.incomes = [
        {
            id: 'inc_a',
            incomeCategoryId: 'salary',
            amountCents: 250000,
            note: 'payday',
            date: '2026-09-01',
        },
        {
            id: 'inc_oct',
            incomeCategoryId: 'income-other',
            amountCents: 1000,
            note: 'next month',
            date: '2026-10-01',
        },
    ];
    return data;
}

function linesOf(csv) {
    assert.equal(csv.startsWith(BOM), true);
    return csv.slice(BOM.length).replace(/\n$/, '').split('\n');
}

test('csvFilename names europe and standard exports', () => {
    assert.equal(csvFilename('2026-09', 'europe'), 'expenses-2026-09-europe.csv');
    assert.equal(csvFilename('2026-09', 'standard'), 'expenses-2026-09-standard.csv');
});

test('standard CSV starts with BOM, uses commas, and formats amounts with a dot', () => {
    const csv = buildMonthCsv(fixture(), '2026-09', 'standard');

    assert.equal(csv[0], BOM);
    assert.equal(csv.includes('sep='), false);
    assert.equal(csv, [
        `${BOM}Date,Type,Category,Subcategory,Note,Amount,Currency,Original amount`,
        '2026-09-01,Expense,Subscriptions,,"quoted ""plan""",9.99,EUR,9.99',
        '2026-09-01,Income,Salary,,payday,2500.00,EUR,2500.00',
        '2026-09-02,Expense,Necessary expenses,Groceries,"milk, bread",12.34,EUR,12.34',
        '2026-09-03,Expense,missing-cat,missing-sub,"line1\nline2",5.00,EUR,5.00',
        '',
    ].join('\n'));
});

test('europe CSV starts with BOM, uses semicolons, and formats amounts with a comma', () => {
    const csv = buildMonthCsv(fixture(), '2026-09', 'europe');

    assert.equal(csv[0], BOM);
    assert.equal(csv.includes('sep='), false);
    assert.equal(csv, [
        `${BOM}Date;Type;Category;Subcategory;Note;Amount;Currency;Original amount`,
        '2026-09-01;Expense;Subscriptions;;"quoted ""plan""";9,99;EUR;9,99',
        '2026-09-01;Income;Salary;;payday;2500,00;EUR;2500,00',
        '2026-09-02;Expense;Necessary expenses;Groceries;milk, bread;12,34;EUR;12,34',
        '2026-09-03;Expense;missing-cat;missing-sub;"line1\nline2";5,00;EUR;5,00',
        '',
    ].join('\n'));
});

test('empty month is BOM plus the header only', () => {
    const csv = buildMonthCsv(defaultData(), '2026-09', 'standard');
    assert.equal(csv, `${BOM}Date,Type,Category,Subcategory,Note,Amount,Currency,Original amount\n`);
});

test('empty subcategoryId stays an empty field, not Unspecified', () => {
    const data = defaultData();
    data.expenses = [{
        id: 'exp_1',
        categoryId: 'subscriptions',
        subcategoryId: '',
        amountCents: 100,
        note: '',
        date: '2026-09-05',
    }];

    const csv = buildMonthCsv(data, '2026-09', 'standard');
    assert.equal(csv.includes('Unspecified'), false);
    assert.equal(linesOf(csv)[1], '2026-09-05,Expense,Subscriptions,,,1.00,EUR,1.00');
});

test('rows sort by date, then expense before income, then id', () => {
    const data = defaultData();
    data.expenses = [
        {
            id: 'exp_z',
            categoryId: 'savings',
            subcategoryId: '',
            amountCents: 200,
            note: '',
            date: '2026-09-05',
        },
        {
            id: 'exp_a',
            categoryId: 'savings',
            subcategoryId: '',
            amountCents: 100,
            note: '',
            date: '2026-09-05',
        },
    ];
    data.incomes = [{
        id: 'inc_mid',
        incomeCategoryId: 'salary',
        amountCents: 300,
        note: '',
        date: '2026-09-05',
    }];

    const rows = linesOf(buildMonthCsv(data, '2026-09', 'standard')).slice(1);
    assert.deepEqual(rows.map((row) => row.split(',')[1] + row.slice(row.lastIndexOf(','))), [
        'Expense,1.00',
        'Expense,2.00',
        'Income,3.00',
    ]);
    assert.ok(rows[0].includes('1.00'));
    assert.ok(rows[1].includes('2.00'));
});

test('refunds are negative and foreign amounts keep their currency', () => {
    const data = defaultData();
    data.expenses = [
        {
            id: 'exp_usd',
            categoryId: 'random',
            subcategoryId: '',
            amountCents: 4630,
            note: 'Hotel',
            date: '2026-09-05',
            currency: 'USD',
            originalAmountCents: 5000,
        },
        {
            id: 'exp_ref',
            categoryId: 'random',
            subcategoryId: '',
            amountCents: 1200,
            note: 'Return',
            date: '2026-09-06',
            refund: true,
        },
    ];

    const lines = linesOf(buildMonthCsv(data, '2026-09', 'standard'));
    assert.equal(lines[1], '2026-09-05,Expense,Random small purchases,,Hotel,46.30,USD,50.00');
    assert.equal(lines[2], '2026-09-06,Refund,Random small purchases,,Return,-12.00,EUR,-12.00');
});

test('text that a spreadsheet would run as a formula is neutralised, amounts are not', () => {
    const data = defaultData();
    data.expenses = [{
        id: 'x',
        categoryId: 'random',
        subcategoryId: '',
        amountCents: 100,
        note: '=HYPERLINK("http://example.com")',
        date: '2026-09-05',
        refund: true,
    }];
    const line = linesOf(buildMonthCsv(data, '2026-09', 'standard'))[1];
    assert.ok(line.includes(`"'=HYPERLINK(""http://example.com"")"`));
    assert.ok(line.includes(',-1.00,'));
});
