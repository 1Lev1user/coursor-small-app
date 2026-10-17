import test from 'node:test';
import assert from 'node:assert/strict';
import { splitBankDetails } from '../src/import/details.js';

const BOOKING = '2026-10-01';

function parts(text, bookingDate = BOOKING) {
    return splitBankDetails(text, bookingDate);
}

test('Swedbank card payment in EUR: merchant and date, card mask gone, no original', () => {
    const r = parts('PIRKUMS 400000******0000 2026.09.28 12.34 5.00 EUR (123456) KAFEJNICA PARAUGS');
    assert.deepEqual(r, { description: '', counterparty: 'KAFEJNICA PARAUGS', date: '2026-09-28', mcc: '' });
    assert.equal('original' in r, false);
    for (const value of Object.values(r)) {
        assert.doesNotMatch(value, /\*/);
    }
});

test('Swedbank foreign purchase: the original amount and currency are read', () => {
    const r = parts('PIRKUMS 400000******0000 2026.09.28 12.34 24.90 CHF VALŪTAS KURSS 1.0712 KONVERTĀCIJAS MAKSA 0.52 EUR (123456) SHOP PARAUGS');
    assert.deepEqual(r, {
        description: '',
        counterparty: 'SHOP PARAUGS',
        date: '2026-09-28',
        mcc: '',
        original: { cents: 2490, currency: 'CHF' },
    });
});

test('Swedbank ECB variant with a thousands separator, and a tail after the merchant', () => {
    const ecb = parts('PIRKUMS 400000******0000 2026.09.28 12:34 1,024.90 CHF, ATTIECĪBĀ PRET ECB VALŪTAS KURSU 2.3% (123456) SHOP PARAUGS');
    assert.equal(ecb.counterparty, 'SHOP PARAUGS');
    assert.deepEqual(ecb.original, { cents: 102490, currency: 'CHF' });

    const tail = parts('PIRKUMS 400000******0000 2026.09.28 12.34 24.90 CHF (123456) SHOP PARAUGS VALŪTAS KURSS 1.0712 KONVERTĀCIJAS MAKSA 0.52 EUR');
    assert.equal(tail.counterparty, 'SHOP PARAUGS');
    assert.deepEqual(tail.original, { cents: 2490, currency: 'CHF' });
});

test('SEB domestic card payment: merchant before the city, no original', () => {
    const r = parts('28/09/2026 08:53 kortelė...000000 CAFE PARAUGS/VILNIUS/LTU #832000, dok. nr. CLR1, operacijos nr. RO1');
    assert.deepEqual(r, { description: '', counterparty: 'CAFE PARAUGS', date: '2026-09-28', mcc: '' });
    assert.equal('original' in r, false);

    const slash = parts('28/09/2026 08:53 kortelė...000000 LIDL/60175 LIDL X/VILNIUS/LTU #832000, dok. nr. CLR1');
    assert.equal(slash.counterparty, 'LIDL/60175 LIDL X');
});

test('SEB foreign purchase: merchant, date and the original amount', () => {
    const r = parts('28/09/2026 18:02 299.00 NOK(25.67 EUR + mokestis 0.68 EUR(2.65%)) kortelė...000000 ALLE PARAUGS!/OSLO/NOR #468544, dok. nr. CLR2');
    assert.deepEqual(r, {
        description: '',
        counterparty: 'ALLE PARAUGS!',
        date: '2026-09-28',
        mcc: '',
        original: { cents: 29900, currency: 'NOK' },
    });
});

test('look-alikes stay unchanged', () => {
    const texts = [
        'PIRKUMS 5.00 EUR (123456) KAFEJNICA PARAUGS',
        'PIRKUMS RIMI 2026.09.28',
        '28/09/2026 08:53 CAFE PARAUGS/VILNIUS/LTU #832000, dok. nr. CLR1',
        '28/09/2026 18:02 299.00 NOK(25.67 EUR + mokestis 0.68 EUR(2.65%)) ALLE PARAUGS!/OSLO/NOR #468544',
    ];
    for (const text of texts) {
        assert.deepEqual(parts(text), { description: text, counterparty: '', date: '', mcc: '' }, text);
    }
});

test('card date window: 0 and 60 days count, 61 days before or after do not', () => {
    const swed = (day) => `PIRKUMS 400000******0000 ${day} 12.34 5.00 EUR (123456) KAFEJNICA PARAUGS`;
    const seb = (day) => `${day} 08:53 kortelė...000000 CAFE PARAUGS/VILNIUS/LTU #832000`;
    assert.equal(parts(swed('2026.10.01')).date, '2026-10-01');
    assert.equal(parts(swed('2026.08.02')).date, '2026-08-02');
    assert.equal(parts(seb('02/08/2026')).date, '2026-08-02');
    for (const r of [parts(swed('2026.08.01')), parts(swed('2026.10.02'))]) {
        assert.equal(r.date, '');
        assert.equal(r.counterparty, 'KAFEJNICA PARAUGS');
    }
    for (const r of [parts(seb('01/08/2026')), parts(seb('02/10/2026'))]) {
        assert.equal(r.date, '');
        assert.equal(r.counterparty, 'CAFE PARAUGS');
    }
});

const LEAKS = /LV80BANK|010190|12345|\*|Jānis|Bērziņš/;
const EXTRA_LINE = 'LV80BANK0000000000001 Jānis Bērziņš 010190-12345 411111******1111 01019012345';

test('Swedbank card line with a second line: IBAN, personal codes and masks are scrubbed', () => {
    const r = parts(`PIRKUMS 400000******0000 2026.09.28 12.34 5.00 EUR (123456) KAFEJNICA PARAUGS\n${EXTRA_LINE}`);
    assert.equal(r.counterparty, 'KAFEJNICA PARAUGS');
    assert.equal(r.date, '2026-09-28');
    assert.doesNotMatch(r.description, /LV80BANK|010190|12345|\*/);
    assert.doesNotMatch(r.counterparty, LEAKS);
});

test('SEB card line with a second line: IBAN, personal codes and masks are scrubbed', () => {
    const r = parts(`28/09/2026 08:53 kortelė...000000 CAFE PARAUGS/VILNIUS/LTU #832000\n${EXTRA_LINE}`);
    assert.equal(r.counterparty, 'CAFE PARAUGS');
    assert.equal(r.date, '2026-09-28');
    assert.doesNotMatch(r.description, /LV80BANK|010190|12345|\*/);
    assert.doesNotMatch(r.counterparty, LEAKS);
});

test('a second card mask inside the merchant is removed', () => {
    const swed = parts('PIRKUMS 400000******0000 2026.09.28 12.34 5.00 EUR (123456) SHOP 411111******1111');
    assert.equal(swed.counterparty, 'SHOP');
    const seb = parts('28/09/2026 08:53 kortelė...000000 SHOP 411111******1111/VILNIUS/LTU #832000');
    assert.equal(seb.counterparty, 'SHOP');
});

test('a card shape that is not on the first line is not read as a card payment', () => {
    const r = parts('NOTE\nPIRKUMS 400000******0000 2026.09.28 12.34 5.00 EUR (123456) SHOP PARAUGS');
    assert.equal(r.counterparty, '');
    assert.equal(r.date, '');
});
