import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData, UNCATEGORISED_ID } from '../src/model.js';
import { parseCamt } from '../src/import/xml.js';
import {
    defaultDecisions,
    findDuplicates,
    buildImport,
    applyImport,
    upsertRule,
} from '../src/import/core.js';

const NOW = new Date(2026, 9, 6, 12);
const PAIR_WARNING = '1 payment and its reversal are left out; they cancel out.';
const ONE_REVERSAL = '1 entry is a reversal marked by the bank. Check it.';

function freshData() {
    const data = defaultData();
    data.rules = [];
    data.imports = [];
    return data;
}

// Synthetic entry. `party` goes under Cdtr for DBIT and Dbtr for CRDT unless `partyRole` says otherwise.
function entry({
    ref = 'R1',
    acctRef = '',
    direction = 'DBIT',
    reversal = 'false',
    amount = '25.00',
    date = '2026-03-10',
    status = 'BOOK',
    party = '',
    partyRole = direction === 'DBIT' ? 'Cdtr' : 'Dbtr',
    returnReason = '',
} = {}) {
    const rvsl = reversal === null ? '' : `<RvslInd>${reversal}</RvslInd>`;
    const parties = party ? `<RltdPties><${partyRole}><Nm>${party}</Nm></${partyRole}></RltdPties>` : '';
    const rtr = returnReason
        ? `<RtrInf><Rsn><Cd>${returnReason}</Cd></Rsn></RtrInf>`
        : '';
    const details = parties || rtr ? `<NtryDtls><TxDtls>${parties}${rtr}</TxDtls></NtryDtls>` : '';
    return `<Ntry><NtryRef>${ref}</NtryRef><Amt Ccy="EUR">${amount}</Amt><CdtDbtInd>${direction}</CdtDbtInd>`
        + `${rvsl}<Sts>${status}</Sts><BookgDt><Dt>${date}</Dt></BookgDt><ValDt><Dt>${date}</Dt></ValDt>`
        + `${acctRef ? `<AcctSvcrRef>${acctRef}</AcctSvcrRef>` : ''}${details}</Ntry>`;
}

function statement(...entries) {
    return '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt><Id>S1</Id>'
        + '<Acct><Id><IBAN>LV00TEST0000000000001</IBAN></Id><Ccy>EUR</Ccy></Acct>'
        + `${entries.join('')}</Stmt></BkToCstmrStmt></Document>`;
}

function parse(...entries) {
    const result = parseCamt(statement(...entries));
    assert.equal(result.ok, true);
    return result;
}

function kindsOf(rows, data = freshData()) {
    return defaultDecisions(data, rows).map(({ kind }) => kind);
}

const ORDINARY_KEYS = [
    'date', 'amountCents', 'direction', 'currency', 'originalAmountCents', 'description', 'counterparty', 'bankRef',
];

// --- reversal flag and warning ---

test('a reversal that arrives as money in is read as a refund', () => {
    const result = parse(
        entry({ ref: 'R1', direction: 'DBIT' }),
        entry({ ref: 'R1-RV', direction: 'CRDT', reversal: 'true' }),
    );
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].direction, 'out');
    assert.equal(result.rows[0].amountCents, 2500);
    assert.equal(Object.hasOwn(result.rows[0], 'reversal'), false);
    assert.equal(result.rows[1].direction, 'in');
    assert.equal(result.rows[1].amountCents, 2500);
    assert.equal(result.rows[1].reversal, true);
    assert.deepEqual(kindsOf(result.rows), ['expense', 'refund']);
    assert.deepEqual(result.warnings, [ONE_REVERSAL]);
});

test('a reversal marked as money out stays a visible expense', () => {
    const result = parse(entry({ ref: 'R9', direction: 'DBIT', reversal: 'true' }));
    assert.equal(result.rows[0].direction, 'out');
    assert.equal(result.rows[0].amountCents, 2500);
    assert.equal(result.rows[0].reversal, true);
    assert.deepEqual(kindsOf(result.rows), ['expense']);
});

test('RvslInd true, TRUE and 1 are reversals; false, 0 and a missing element are not', () => {
    for (const value of ['true', 'TRUE', ' True ', '1']) {
        const { rows } = parse(entry({ reversal: value }));
        assert.equal(rows[0].reversal, true, value);
    }
    for (const value of ['false', '0', null]) {
        const result = parse(entry({ reversal: value }));
        assert.equal(Object.hasOwn(result.rows[0], 'reversal'), false, String(value));
        assert.deepEqual(result.warnings, []);
    }
});

test('without any RvslInd the rows and warnings are what they were', () => {
    const result = parse(entry({ ref: 'A', reversal: null, party: 'Shop' }), entry({ ref: 'B', direction: 'CRDT', reversal: null }));
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.rows[0], {
        date: '2026-03-10',
        amountCents: 2500,
        direction: 'out',
        currency: 'EUR',
        originalAmountCents: 2500,
        description: '',
        counterparty: 'Shop',
        bankRef: 'A',
    });
    assert.deepEqual(Object.keys(result.rows[1]), ORDINARY_KEYS);
});

test('a pending entry and a reversal give both warnings, the pending one first', () => {
    const result = parse(
        entry({ ref: 'P', status: 'PDNG' }),
        entry({ ref: 'RV', direction: 'CRDT', reversal: 'true' }),
    );
    assert.deepEqual(result.warnings, ['Skipped 1 entry that is not booked yet.', ONE_REVERSAL]);
});

test('several unpaired reversals are counted in one sentence', () => {
    const result = parse(
        entry({ ref: 'X1', direction: 'DBIT', reversal: 'true', amount: '5.00' }),
        entry({ ref: 'X2', direction: 'DBIT', reversal: 'true', amount: '7.00' }),
    );
    assert.deepEqual(result.warnings, ['2 entries are reversals marked by the bank. Check them.']);
});

// --- default kind ---

test('a reversal in uses the category of a matching shop rule, else Uncategorised', () => {
    const { rows } = parse(
        entry({ ref: 'R1-RV', direction: 'CRDT', reversal: 'true', party: 'SHOP A' }),
    );
    const withRule = freshData();
    upsertRule(withRule, { pattern: 'SHOP A', kind: 'expense', categoryId: 'necessary', subcategoryId: '' });
    const [refund] = defaultDecisions(withRule, rows);
    assert.equal(refund.kind, 'refund');
    assert.equal(refund.categoryId, 'necessary');

    const [plain] = defaultDecisions(freshData(), rows);
    assert.equal(plain.kind, 'refund');
    assert.equal(plain.categoryId, UNCATEGORISED_ID);
});

test('re-importing a reversal row that was stored as a refund is an exact duplicate', () => {
    const { rows } = parse(
        entry({ ref: 'R1', direction: 'DBIT' }),
        entry({ ref: 'R1-RV', direction: 'CRDT', reversal: 'true' }),
    );
    const data = freshData();
    const decisions = defaultDecisions(data, rows);
    const built = buildImport(data, decisions, { rows, format: 'camt', fileName: 'a.xml', now: NOW });
    assert.equal(built.ok, true);
    assert.equal(built.expenses.length, 2);
    assert.equal(built.expenses[1].refund, true);
    const applied = applyImport(data, built, { '2026-03': 'actualOnly' });
    assert.equal(applied.ok, true);
    assert.deepEqual(findDuplicates(data, rows).map((item) => item?.level), ['exact', 'exact']);
});

// --- pairing ---

test('an original and its reversal with the same party cancel out and are both skipped', () => {
    const result = parse(
        entry({ ref: 'O1', acctRef: 'A1', direction: 'CRDT', party: 'Payer One' }),
        entry({ ref: 'O2', acctRef: 'A2', direction: 'DBIT', reversal: 'true', party: 'Payer One', partyRole: 'Dbtr', returnReason: 'MD06' }),
    );
    assert.equal(result.rows[1].direction, 'out');
    assert.equal(result.rows[1].reversal, true);
    assert.equal(result.rows[1].counterparty, result.rows[0].counterparty);
    assert.deepEqual(kindsOf(result.rows), ['skip', 'skip']);
    assert.deepEqual(result.warnings, [PAIR_WARNING]);
    assert.deepEqual(Object.keys(result.rows[0]), ORDINARY_KEYS);
});

test('pairs link by a shared reference alone', () => {
    const result = parse(
        entry({ ref: 'S', acctRef: 'REF-7', direction: 'CRDT', party: 'Alpha' }),
        entry({ ref: 'S', acctRef: 'REF-7', direction: 'DBIT', reversal: 'true', party: 'Beta' }),
    );
    assert.deepEqual(kindsOf(result.rows), ['skip', 'skip']);
});

test('pairs link by the counterparty alone, ignoring case and spacing', () => {
    const result = parse(
        entry({ ref: 'A', direction: 'CRDT', party: 'Acme  Sia' }),
        entry({ ref: 'B', direction: 'DBIT', reversal: 'true', party: 'ACME SIA' }),
    );
    assert.deepEqual(kindsOf(result.rows), ['skip', 'skip']);
    assert.deepEqual(result.warnings, [PAIR_WARNING]);
});

test('an original money out and a reversal money in also pair', () => {
    const result = parse(
        entry({ ref: 'A', direction: 'DBIT', party: 'Shop' }),
        entry({ ref: 'B', direction: 'CRDT', reversal: 'true', party: 'Shop' }),
    );
    assert.deepEqual(kindsOf(result.rows), ['skip', 'skip']);
});

test('no pair without a shared reference or party, or with a different amount', () => {
    const noLink = parse(
        entry({ ref: 'A', direction: 'CRDT', party: 'One' }),
        entry({ ref: 'B', direction: 'DBIT', reversal: 'true', party: 'Two' }),
    );
    assert.deepEqual(kindsOf(noLink.rows), ['income', 'expense']);
    assert.deepEqual(noLink.warnings, [ONE_REVERSAL]);

    const otherAmount = parse(
        entry({ ref: 'A', direction: 'CRDT', party: 'One', amount: '25.00' }),
        entry({ ref: 'B', direction: 'DBIT', reversal: 'true', party: 'One', amount: '24.00' }),
    );
    assert.deepEqual(kindsOf(otherAmount.rows), ['income', 'expense']);
    assert.deepEqual(otherAmount.warnings, [ONE_REVERSAL]);
});

test('two empty counterparties never pair', () => {
    const result = parse(
        entry({ ref: 'R1', direction: 'DBIT' }),
        entry({ ref: 'R1-RV', direction: 'CRDT', reversal: 'true' }),
    );
    assert.deepEqual(kindsOf(result.rows), ['expense', 'refund']);
});

test('each row pairs once: two originals and one reversal leave one original alone', () => {
    const result = parse(
        entry({ ref: 'A', direction: 'CRDT', party: 'Pat', date: '2026-03-01' }),
        entry({ ref: 'B', direction: 'CRDT', party: 'Pat', date: '2026-03-09' }),
        entry({ ref: 'C', direction: 'DBIT', reversal: 'true', party: 'Pat', date: '2026-03-10' }),
    );
    assert.deepEqual(kindsOf(result.rows), ['income', 'skip', 'skip']);
    assert.deepEqual(result.warnings, [PAIR_WARNING]);
});

test('one original and two reversals leave the second reversal unpaired', () => {
    const result = parse(
        entry({ ref: 'A', direction: 'CRDT', party: 'Pat' }),
        entry({ ref: 'B', direction: 'DBIT', reversal: 'true', party: 'Pat' }),
        entry({ ref: 'C', direction: 'DBIT', reversal: 'true', party: 'Pat' }),
    );
    assert.deepEqual(kindsOf(result.rows), ['skip', 'skip', 'expense']);
    assert.deepEqual(result.warnings, [ONE_REVERSAL, PAIR_WARNING]);
});

test('two ordinary opposite rows of the same amount are not a reversal pair', () => {
    const result = parse(
        entry({ ref: 'A', direction: 'CRDT', party: 'Pat', amount: '5.00' }),
        entry({ ref: 'B', direction: 'DBIT', party: 'Pat', amount: '5.00' }),
    );
    assert.deepEqual(kindsOf(result.rows), ['income', 'expense']);
    assert.deepEqual(result.warnings, []);
});

test('a saved rule on the original, or a stored duplicate of it, stops the pairing', () => {
    const { rows } = parse(
        entry({ ref: 'A', direction: 'CRDT', party: 'Pat' }),
        entry({ ref: 'B', direction: 'DBIT', reversal: 'true', party: 'Pat' }),
    );
    const ruled = freshData();
    upsertRule(ruled, { pattern: 'PAT', kind: 'income', incomeCategoryId: 'income-other' });
    assert.deepEqual(kindsOf(rows, ruled), ['income', 'expense']);

    const stored = freshData();
    const built = buildImport(stored, defaultDecisions(stored, [rows[0]]), { rows: [rows[0]], format: 'camt', fileName: 'a.xml', now: NOW });
    assert.equal(applyImport(stored, built, { '2026-03': 'actualOnly' }).ok, true);
    assert.equal(findDuplicates(stored, rows)[0].level, 'exact');
    assert.deepEqual(kindsOf(rows, stored), ['income', 'expense']);
});

test('a reversal pair is never turned into an own-account transfer', () => {
    const noLink = parse(
        entry({ ref: 'A', direction: 'DBIT', amount: '100.00', party: 'One' }),
        entry({ ref: 'B', direction: 'CRDT', reversal: 'true', amount: '100.00', party: 'Two' }),
    );
    assert.deepEqual(kindsOf(noLink.rows), ['expense', 'refund']);

    const linked = parse(
        entry({ ref: 'A', acctRef: 'X', direction: 'DBIT', amount: '100.00', party: 'One' }),
        entry({ ref: 'B', acctRef: 'X', direction: 'CRDT', reversal: 'true', amount: '100.00', party: 'Two' }),
    );
    assert.deepEqual(kindsOf(linked.rows), ['skip', 'skip']);
});

test('a skipped original is not offered to the own-account transfer pairing', () => {
    const result = parse(
        entry({ ref: 'A', direction: 'DBIT', amount: '100.00', party: 'One' }),
        entry({ ref: 'B', direction: 'CRDT', reversal: 'true', amount: '100.00', party: 'One' }),
        entry({ ref: 'C', direction: 'CRDT', amount: '100.00', party: 'Other' }),
    );
    assert.deepEqual(kindsOf(result.rows), ['skip', 'skip', 'income']);
});

test('a skipped pair stores nothing and counts as skipped', () => {
    const { rows } = parse(
        entry({ ref: 'A', direction: 'CRDT', party: 'Pat' }),
        entry({ ref: 'B', direction: 'DBIT', reversal: 'true', party: 'Pat' }),
    );
    const data = freshData();
    const built = buildImport(data, defaultDecisions(data, rows), { rows, format: 'camt', fileName: 'a.xml', now: NOW });
    assert.equal(built.ok, true);
    assert.equal(built.importRecord.counts.skipped, 2);
    assert.equal(built.expenses.length + built.incomes.length, 0);
    assert.equal(applyImport(data, built, {}).ok, true);
    assert.equal(data.expenses.length + data.incomes.length, 0);
});
