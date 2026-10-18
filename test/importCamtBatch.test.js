import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultData } from '../src/model.js';
import { parseCamt } from '../src/import/xml.js';
import {
    defaultDecisions,
    findDuplicates,
    buildImport,
    applyImport,
} from '../src/import/core.js';

const NOW = new Date(2026, 9, 6, 12);
const UNSPLIT = '1 batch entry could not be split into its payments; it is imported as one row.';

function freshData() {
    const data = defaultData();
    data.rules = [];
    data.imports = [];
    return data;
}

// Synthetic payment inside a batch. Made-up data only.
function part({
    ref = '',
    e2e = '',
    amount = '10.00',
    ccy = 'EUR',
    party = '',
    partyRole = 'Cdtr',
    text = '',
    instd = '',
    indicator = '',
    amountIn = 'AmtDtls',
} = {}) {
    const refs = ref || e2e
        ? `<Refs>${ref ? `<AcctSvcrRef>${ref}</AcctSvcrRef>` : ''}${e2e ? `<EndToEndId>${e2e}</EndToEndId>` : ''}</Refs>`
        : '';
    const foreign = instd ? `<InstdAmt><Amt Ccy="USD">${instd}</Amt></InstdAmt>` : '';
    const amounts = amountIn === 'none'
        ? ''
        : amountIn === 'Amt'
            ? `<Amt Ccy="${ccy}">${amount}</Amt>`
            : `<AmtDtls><TxAmt><Amt Ccy="${ccy}">${amount}</Amt></TxAmt>${foreign}</AmtDtls>`;
    const indicatorTag = indicator ? `<CdtDbtInd>${indicator}</CdtDbtInd>` : '';
    const parties = party ? `<RltdPties><${partyRole}><Nm>${party}</Nm></${partyRole}></RltdPties>` : '';
    const remittance = text ? `<RmtInf><Ustrd>${text}</Ustrd></RmtInf>` : '';
    return `<TxDtls>${refs}${amounts}${indicatorTag}${parties}${remittance}</TxDtls>`;
}

function entry({
    ref = 'B1',
    acctRef = '',
    direction = 'DBIT',
    reversal = null,
    amount = '60.00',
    ccy = 'EUR',
    date = '2026-03-10',
    status = 'BOOK',
    parts = [],
    batch = false,
} = {}) {
    const rvsl = reversal === null ? '' : `<RvslInd>${reversal}</RvslInd>`;
    const btch = batch ? '<Btch><NbOfTxs>3</NbOfTxs></Btch>' : '';
    const details = parts.length > 0 || batch ? `<NtryDtls>${btch}${parts.join('')}</NtryDtls>` : '';
    return `<Ntry>${ref ? `<NtryRef>${ref}</NtryRef>` : ''}<Amt Ccy="${ccy}">${amount}</Amt><CdtDbtInd>${direction}</CdtDbtInd>`
        + `${rvsl}<Sts>${status}</Sts><BookgDt><Dt>${date}</Dt></BookgDt><ValDt><Dt>${date}</Dt></ValDt>`
        + `${acctRef ? `<AcctSvcrRef>${acctRef}</AcctSvcrRef>` : ''}${details}</Ntry>`;
}

function statement(currency, ...entries) {
    return '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt><Id>S1</Id>'
        + `<Acct><Id><IBAN>LV00TEST0000000000001</IBAN></Id><Ccy>${currency}</Ccy></Acct>`
        + `${entries.join('')}</Stmt></BkToCstmrStmt></Document>`;
}

function parse(...entries) {
    const result = parseCamt(statement('EUR', ...entries));
    assert.equal(result.ok, true);
    return result;
}

const THREE = [
    part({ ref: 'T1', amount: '10.00', party: 'Alpha', text: 'Invoice A' }),
    part({ ref: 'T2', amount: '20.00', party: 'Beta', text: 'Invoice B' }),
    part({ ref: 'T3', amount: '30.00', party: 'Gamma', text: 'Invoice C' }),
];

// --- the split ---

test('a batch entry whose parts add up becomes one row per payment', () => {
    const { rows, warnings } = parse(entry({ parts: THREE }));
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((row) => row.direction), ['out', 'out', 'out']);
    assert.deepEqual(rows.map((row) => row.amountCents), [1000, 2000, 3000]);
    assert.deepEqual(rows.map((row) => row.counterparty), ['Alpha', 'Beta', 'Gamma']);
    assert.deepEqual(rows.map((row) => row.description), ['Invoice A', 'Invoice B', 'Invoice C']);
    assert.deepEqual(rows.map((row) => row.bankRef), ['T1', 'T2', 'T3']);
    assert.deepEqual(rows.map((row) => row.date), ['2026-03-10', '2026-03-10', '2026-03-10']);
    assert.deepEqual(rows.map((row) => row.currency), ['EUR', 'EUR', 'EUR']);
    assert.equal(rows.some((row) => Object.hasOwn(row, 'reversal')), false);
    assert.deepEqual(warnings, []);
});

test('parts that do not add up to the entry give one row without a counterparty and a warning', () => {
    const { rows, warnings } = parse(entry({
        parts: [THREE[0], THREE[1], part({ ref: 'T3', amount: '25.00', party: 'Gamma', text: 'Invoice C' })],
    }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].amountCents, 6000);
    assert.equal(rows[0].counterparty, '');
    assert.equal(rows[0].bankRef, 'B1');
    assert.deepEqual(warnings, [UNSPLIT]);
});

test('several unsplit batch entries are counted in one plural warning', () => {
    const bad = entry({ parts: [THREE[0], part({ ref: 'T9', amount: '5.00' })] });
    const { rows, warnings } = parse(bad, bad);
    assert.equal(rows.length, 2);
    assert.deepEqual(warnings, ['2 batch entries could not be split into their payments; they are imported as one row each.']);
});

test('a foreign amount is read inside its own part only', () => {
    const { rows } = parse(entry({
        parts: [
            THREE[0],
            part({ ref: 'T2', amount: '20.00', party: 'Beta', text: 'Invoice B', instd: '35.00' }),
            THREE[2],
        ],
    }));
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((row) => row.currency), ['EUR', 'USD', 'EUR']);
    assert.deepEqual(rows.map((row) => row.amountCents), [1000, 2000, 3000]);
    assert.deepEqual(rows.map((row) => row.originalAmountCents), [1000, 3500, 3000]);
});

test('a part without an amount, with another currency or with a non-positive amount prevents the split', () => {
    const cases = [
        part({ ref: 'T3', party: 'Gamma', amountIn: 'none' }),
        part({ ref: 'T3', amount: '30.00', ccy: 'CHF', party: 'Gamma' }),
        part({ ref: 'T3', amount: '0.00', party: 'Gamma' }),
    ];
    for (const bad of cases) {
        const first = part({ ref: 'T1', amount: '30.00', party: 'Alpha' });
        const { rows, warnings } = parse(entry({ amount: '30.00', parts: [first, bad] }));
        assert.equal(rows.length, 1);
        assert.equal(rows[0].counterparty, '');
        assert.deepEqual(warnings, [UNSPLIT]);
    }
});

test('the part amount may also be written as TxDtls/Amt', () => {
    const { rows } = parse(entry({
        amount: '30.00',
        parts: [
            part({ ref: 'T1', amount: '10.00', party: 'Alpha', amountIn: 'Amt' }),
            part({ ref: 'T2', amount: '20.00', party: 'Beta', amountIn: 'Amt' }),
        ],
    }));
    assert.deepEqual(rows.map((row) => row.amountCents), [1000, 2000]);
});

// --- references ---

test('parts without their own reference are numbered after the entry', () => {
    const bare = [10, 20, 30].map((n) => part({ amount: `${n}.00`, party: `P${n}` }));
    const { rows } = parse(entry({ parts: bare }));
    assert.deepEqual(rows.map((row) => row.bankRef), ['B1-1', 'B1-2', 'B1-3']);
});

test('a part falls back to EndToEndId, and NOTPROVIDED is not a reference', () => {
    const { rows } = parse(entry({
        parts: [
            part({ e2e: 'E-1', amount: '10.00' }),
            part({ e2e: 'NOTPROVIDED', amount: '20.00' }),
            part({ amount: '30.00' }),
        ],
    }));
    assert.deepEqual(rows.map((row) => row.bankRef), ['E-1', 'B1-2', 'B1-3']);
});

test('parts that all repeat the entry reference are told apart by their number', () => {
    const same = [1, 2, 3].map(() => part({ ref: 'ABN9', e2e: 'NOTPROVIDED', amount: '20.00', party: 'Same', text: 'Pay' }));
    const { rows } = parse(entry({ ref: '', acctRef: 'ABN9', parts: same }));
    assert.deepEqual(rows.map((row) => row.bankRef), ['ABN9-1', 'ABN9-2', 'ABN9-3']);
});

test('without any reference the parts have an empty reference', () => {
    const bare = [part({ amount: '25.00' }), part({ amount: '35.00' })];
    const { rows } = parse(entry({ ref: '', parts: bare }));
    assert.deepEqual(rows.map((row) => row.bankRef), ['', '']);
});

// --- entries that are not split ---

test('entries with one payment, a batch tag alone or no details keep giving one row', () => {
    const one = parse(entry({
        amount: '10.00',
        batch: true,
        parts: [part({ ref: 'T1', amount: '10.00', party: 'Alpha', text: 'Invoice A' })],
    }));
    assert.deepEqual(one.rows, [{
        date: '2026-03-10',
        amountCents: 1000,
        direction: 'out',
        currency: 'EUR',
        originalAmountCents: 1000,
        description: 'Invoice A',
        counterparty: 'Alpha',
        bankRef: 'B1',
    }]);
    assert.deepEqual(one.warnings, []);

    const tagOnly = parse(entry({ batch: true }));
    assert.equal(tagOnly.rows.length, 1);
    assert.equal(tagOnly.rows[0].counterparty, '');
    assert.deepEqual(tagOnly.warnings, []);

    const plain = parse(entry({}));
    assert.equal(plain.rows.length, 1);
    assert.equal(plain.rows[0].bankRef, 'B1');
    assert.deepEqual(plain.warnings, []);
});

test('only the batch entry is split when a file holds two statements', () => {
    const text = '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt>'
        + `<Stmt><Id>S1</Id><Acct><Ccy>EUR</Ccy></Acct>${entry({ ref: 'X1', amount: '5.00' })}</Stmt>`
        + `<Stmt><Id>S2</Id><Acct><Ccy>EUR</Ccy></Acct>${entry({ parts: THREE })}${entry({ ref: 'X2', amount: '7.00' })}</Stmt>`
        + '</BkToCstmrStmt></Document>';
    const result = parseCamt(text);
    assert.equal(result.ok, true);
    assert.deepEqual(result.rows.map((row) => [row.bankRef, row.amountCents]), [
        ['X1', 500], ['T1', 1000], ['T2', 2000], ['T3', 3000], ['X2', 700],
    ]);
});

test('a pending batch is still skipped as a whole', () => {
    const result = parse(entry({ status: 'PDNG', parts: THREE }), entry({ ref: 'X1', amount: '5.00' }));
    assert.equal(result.rows.length, 1);
    assert.deepEqual(result.warnings, ['Skipped 1 entry that is not booked yet.']);
});

// --- reversal and direction ---

test('every part of a reversed batch is a reversal, a batch without the mark has no flag', () => {
    const inbound = [
        part({ ref: 'T1', amount: '10.00', party: 'Alpha', partyRole: 'Dbtr' }),
        part({ ref: 'T2', amount: '20.00', party: 'Beta', partyRole: 'Dbtr' }),
        part({ ref: 'T3', amount: '30.00', party: 'Gamma', partyRole: 'Dbtr' }),
    ];
    const reversed = parse(entry({ direction: 'CRDT', reversal: 'true', parts: inbound }));
    assert.equal(reversed.rows.length, 3);
    assert.deepEqual(reversed.rows.map((row) => row.direction), ['in', 'in', 'in']);
    assert.deepEqual(reversed.rows.map((row) => row.reversal), [true, true, true]);
    assert.deepEqual(reversed.rows.map((row) => row.counterparty), ['Alpha', 'Beta', 'Gamma']);
    const kinds = defaultDecisions(freshData(), reversed.rows).map(({ kind }) => kind);
    assert.deepEqual(kinds, ['refund', 'refund', 'refund']);

    const plain = parse(entry({ reversal: 'false', parts: THREE }));
    assert.equal(plain.rows.some((row) => Object.hasOwn(row, 'reversal')), false);
});

test('a part direction that differs from the entry is ignored with a warning', () => {
    const { rows, warnings } = parse(entry({
        parts: [
            part({ ref: 'T1', amount: '10.00', party: 'Alpha', indicator: 'CRDT' }),
            part({ ref: 'T2', amount: '50.00', party: 'Beta', indicator: 'DBIT' }),
        ],
    }));
    assert.deepEqual(rows.map((row) => row.direction), ['out', 'out']);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /^1 batch payment has/);

    const same = parse(entry({
        parts: [
            part({ ref: 'T1', amount: '10.00', indicator: 'DBIT' }),
            part({ ref: 'T2', amount: '50.00' }),
        ],
    }));
    assert.deepEqual(same.warnings, []);
});

test('on a foreign-currency account each part follows the single-entry rule', () => {
    const chf = (amount, extra = '') => `<TxDtls><Refs><AcctSvcrRef>C${amount}</AcctSvcrRef></Refs><AmtDtls><TxAmt><Amt Ccy="CHF">${amount}</Amt></TxAmt>${extra}</AmtDtls></TxDtls>`;
    const euro = '<CntrValAmt><Amt Ccy="EUR">9.50</Amt></CntrValAmt>';
    const result = parseCamt(statement('CHF', entry({ ccy: 'CHF', amount: '30.00', parts: [chf('10.00', euro), chf('20.00')] })));
    assert.equal(result.ok, true);
    assert.deepEqual(result.rows.map((row) => [row.currency, row.amountCents, row.originalAmountCents]), [
        ['CHF', 950, 1000],
        ['CHF', null, 2000],
    ]);
});

// --- re-import ---

test('re-import of a batch first imported as one row shows the parts as new rows (known, accepted behaviour)', () => {
    const oldRow = {
        date: '2026-03-10',
        amountCents: 6000,
        direction: 'out',
        currency: 'EUR',
        originalAmountCents: 6000,
        description: 'Invoice A Invoice B Invoice C',
        counterparty: 'Alpha',
        bankRef: 'B1',
    };
    const data = freshData();
    const decisions = defaultDecisions(data, [oldRow]);
    const built = buildImport(data, decisions, { rows: [oldRow], format: 'camt', fileName: 'a.xml', now: NOW });
    assert.equal(built.ok, true);
    assert.equal(applyImport(data, built, { '2026-03': 'actualOnly' }).ok, true);

    const { rows } = parse(entry({ parts: THREE }));
    assert.equal(rows.length, 3);
    assert.deepEqual(findDuplicates(data, rows).map((item) => item?.level ?? null), [null, null, null]);
});
