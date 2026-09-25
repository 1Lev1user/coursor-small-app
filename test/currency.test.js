import test from 'node:test';
import assert from 'node:assert/strict';
import { formatEuro } from '../src/money.js';
import { CURRENCIES, isCurrencyCode, formatMoney, describeForeign } from '../src/currency.js';

test('CURRENCIES lists the common ISO codes including EUR', () => {
    assert.ok(CURRENCIES.includes('EUR'));
    assert.ok(CURRENCIES.includes('USD'));
    assert.ok(CURRENCIES.includes('RUB'));
    assert.equal(CURRENCIES.length, 17);
});

test('isCurrencyCode accepts known codes and rejects unknown or invalid input', () => {
    assert.equal(isCurrencyCode('EUR'), true);
    assert.equal(isCurrencyCode('usd'), true);
    assert.equal(isCurrencyCode('XXX'), false);
    assert.equal(isCurrencyCode(''), false);
    assert.equal(isCurrencyCode(null), false);
    assert.equal(isCurrencyCode(42), false);
});

test('formatMoney for EUR matches money.js formatEuro exactly', () => {
    for (const cents of [0, 1, 50, 12345, -500]) {
        assert.equal(formatMoney(cents, 'EUR'), formatEuro(cents));
    }
});

test('formatMoney for other currencies uses code, space, comma thousands, two decimals', () => {
    assert.equal(formatMoney(5000, 'USD'), 'USD 50.00');
    assert.equal(formatMoney(123456, 'USD'), 'USD 1,234.56');
    assert.equal(formatMoney(1, 'GBP'), 'GBP 0.01');
    assert.equal(formatMoney(-5000, 'USD'), 'USD -50.00');
});

test('describeForeign is empty for EUR or currency-less entries', () => {
    assert.equal(describeForeign({ currency: 'EUR', originalAmountCents: 5000 }), '');
    assert.equal(describeForeign({ originalAmountCents: 5000 }), '');
    assert.equal(describeForeign({}), '');
    assert.equal(describeForeign(null), '');
});

test('describeForeign renders the original amount in the original currency', () => {
    assert.equal(
        describeForeign({ currency: 'USD', originalAmountCents: 5000, amountCents: 4600 }),
        'USD 50.00',
    );
});
