import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCamt } from '../src/import/xml.js';

// Made-up camt.053 entries. Only PrtryAmt, AnncdPstngAmt, InstdAmt, TxAmt and CntrValAmt are used,
// with the shapes described in research/3.1/bank-shapes.md. No real bank data.

function amt(kind, ccy, value) {
    return `<${kind}><Amt Ccy="${ccy}">${value}</Amt></${kind}>`;
}

function prtry(tp, ccy, value) {
    return `<PrtryAmt><Tp>${tp}</Tp><Amt Ccy="${ccy}">${value}</Amt></PrtryAmt>`;
}

function xchg(src, trgt, rate) {
    return `<CcyXchg><SrcCcy>${src}</SrcCcy><TrgtCcy>${trgt}</TrgtCcy><XchgRate>${rate}</XchgRate></CcyXchg>`;
}

function entry({
    ccy = 'EUR',
    amount = '10.00',
    direction = 'DBIT',
    amtDtls = '',
} = {}) {
    return `<Ntry><Amt Ccy="${ccy}">${amount}</Amt><CdtDbtInd>${direction}</CdtDbtInd>`
        + `<Sts>BOOK</Sts><BookgDt><Dt>2026-03-10</Dt></BookgDt>`
        + `<NtryDtls><TxDtls><AmtDtls>${amtDtls}</AmtDtls></TxDtls></NtryDtls></Ntry>`;
}

function statement(accountCcy, ...entries) {
    return '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt><Id>S1</Id>'
        + `<Acct><Id><IBAN>LV00TEST0000000000001</IBAN></Id><Ccy>${accountCcy}</Ccy></Acct>`
        + `${entries.join('')}</Stmt></BkToCstmrStmt></Document>`;
}

function parseOne(xml) {
    const result = parseCamt(xml);
    assert.equal(result.ok, true);
    assert.equal(result.rows.length, 1);
    return result.rows[0];
}

test('DNB-like entry: EUR everywhere, the EQUIVALENT PrtryAmt does not change the amount', () => {
    const row = parseOne(statement('EUR', entry({
        amount: '0.29',
        amtDtls: amt('InstdAmt', 'EUR', '0.29') + `<TxAmt><Amt Ccy="EUR">0.29</Amt></TxAmt>`
            + prtry('EQUIVALENT', 'EUR', '0.29'),
    })));
    assert.equal(row.currency, 'EUR');
    assert.equal(row.originalAmountCents, 29);
    assert.equal(row.amountCents, 29);
});

test('Swiss-like entry: a CHF PrtryAmt next to a EUR entry is not the original amount', () => {
    const row = parseOne(statement('EUR', entry({
        amount: '45.00',
        amtDtls: prtry('IBS', 'CHF', '0.03'),
    })));
    assert.equal(row.currency, 'EUR');
    assert.notEqual(row.originalAmountCents, 3);
    assert.equal(row.originalAmountCents, 4500);
    assert.equal(row.amountCents, 4500);
});

test('German DK-like entry: InstdAmt USD is the original amount, TxAmt and CntrValAmt give the EUR amount', () => {
    const row = parseOne(statement('EUR', entry({
        amount: '92.00',
        amtDtls: amt('InstdAmt', 'USD', '100.00')
            + `<TxAmt><Amt Ccy="EUR">92.00</Amt></TxAmt>`
            + `<CntrValAmt><Amt Ccy="EUR">92.00</Amt>${xchg('USD', 'EUR', '1.087')}</CntrValAmt>`,
    })));
    assert.equal(row.currency, 'USD');
    assert.equal(row.originalAmountCents, 10000);
    assert.equal(row.amountCents, 9200);
});

test('Swiss v8-like entry: InstdAmt CHF is the original amount with the EUR booked amount', () => {
    const row = parseOne(statement('EUR', entry({
        amount: '20.97',
        amtDtls: amt('InstdAmt', 'CHF', '19.69')
            + `<TxAmt><Amt Ccy="EUR">20.97</Amt>${xchg('CHF', 'EUR', '1.0650')}</TxAmt>`,
    })));
    assert.equal(row.currency, 'CHF');
    assert.equal(row.originalAmountCents, 1969);
    assert.equal(row.amountCents, 2097);
});

test('a PrtryAmt in another currency alone stays EUR with no original currency', () => {
    const row = parseOne(statement('EUR', entry({
        amount: '20.00',
        amtDtls: prtry('IBS', 'GBP', '8.00'),
    })));
    assert.equal(row.currency, 'EUR');
    assert.equal(row.originalAmountCents, 2000);
    assert.equal(row.amountCents, 2000);
});

test('a CHF entry with only a EUR PrtryAmt keeps its currency and leaves the EUR amount empty', () => {
    const row = parseOne(statement('CHF', entry({
        ccy: 'CHF',
        amount: '45.00',
        amtDtls: prtry('EQUIVALENT', 'EUR', '41.00'),
    })));
    assert.equal(row.currency, 'CHF');
    assert.equal(row.originalAmountCents, 4500);
    assert.equal(row.amountCents, null);
});

test('AnncdPstngAmt in another currency is not an original amount', () => {
    const row = parseOne(statement('EUR', entry({
        amount: '20.00',
        amtDtls: amt('AnncdPstngAmt', 'GBP', '8.00'),
    })));
    assert.equal(row.currency, 'EUR');
    assert.equal(row.originalAmountCents, 2000);
    assert.equal(row.amountCents, 2000);
});

test('a real InstdAmt wins over a PrtryAmt in another currency', () => {
    const row = parseOne(statement('EUR', entry({
        amount: '20.00',
        amtDtls: amt('InstdAmt', 'USD', '25.00') + prtry('IBS', 'GBP', '8.00'),
    })));
    assert.equal(row.currency, 'USD');
    assert.equal(row.originalAmountCents, 2500);
    assert.equal(row.amountCents, 2000);
});

test('batch payments split from one entry do not take a PrtryAmt as their amount', () => {
    const part = (value) => `<TxDtls><AmtDtls><TxAmt><Amt Ccy="EUR">${value}</Amt></TxAmt>`
        + `${prtry('IBS', 'CHF', '0.03')}</AmtDtls></TxDtls>`;
    const xml = statement('EUR', '<Ntry><Amt Ccy="EUR">30.00</Amt><CdtDbtInd>DBIT</CdtDbtInd>'
        + '<Sts>BOOK</Sts><BookgDt><Dt>2026-03-10</Dt></BookgDt>'
        + `<NtryDtls><Btch><NbOfTxs>2</NbOfTxs></Btch>${part('10.00')}${part('20.00')}</NtryDtls></Ntry>`);
    const result = parseCamt(xml);
    assert.equal(result.ok, true);
    assert.equal(result.rows.length, 2);
    for (const row of result.rows) {
        assert.equal(row.currency, 'EUR');
        assert.equal(row.originalAmountCents, row.amountCents);
    }
    assert.deepEqual(result.rows.map((row) => row.amountCents), [1000, 2000]);
});
