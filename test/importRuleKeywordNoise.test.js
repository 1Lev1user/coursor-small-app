import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPattern } from '../src/import/core.js';

test('a reference code glued to digits before the merchant is skipped: TERM1234 RIMI offers RIMI', () => {
    assert.equal(extractPattern('TERM1234 RIMI'), 'RIMI');
    assert.equal(extractPattern('Nr1234 TELE2'), 'TELE2');
    assert.equal(extractPattern('POS TERM1234 RIMI'), 'RIMI');
    assert.equal(extractPattern('SIA TERM1234 RIMI'), 'RIMI');
    assert.equal(extractPattern('RIMI4321 Brivibas'), 'RIMI');
    assert.equal(extractPattern('LIDL1234 Riga'), 'LIDL');
});

test('an IBAN in the description is dropped, the merchant is offered', () => {
    assert.equal(extractPattern('LV80HABA0551012345678 RIMI'), 'RIMI');
    assert.equal(extractPattern('RIMI LV80HABA0551012345678'), 'RIMI');
    assert.equal(extractPattern('DE89370400440532013000 REWE'), 'REWE');
    assert.equal(extractPattern('LV80HABA0551012345678'), '');
});

test('an amount glued to a currency is dropped, both orders', () => {
    assert.equal(extractPattern('EUR12.50 RIMI'), 'RIMI');
    assert.equal(extractPattern('RIMI EUR12.50'), 'RIMI');
    assert.equal(extractPattern('EUR1250 RIMI'), 'RIMI');
    assert.equal(extractPattern('12.50EUR RIMI'), 'RIMI');
});

test('names that look like noise keep their keyword: TELE2, BOLT.EUR and TERM alone', () => {
    assert.equal(extractPattern('TELE2 SIA'), 'TELE2');
    assert.equal(extractPattern('SIA TELE2'), 'TELE2');
    assert.equal(extractPattern('BOLT.EUR2610011807 Tallinn'), 'BOLT.EUR');
    assert.equal(extractPattern('BOLT.EU/R/2610061652 Tallinn'), 'BOLT.EU');
    assert.equal(extractPattern('HESBURGER 43019 Riga'), 'HESBURGER');
    assert.equal(extractPattern('PAYPAL *SPOTIFY 4029357733 LU'), 'PAYPAL SPOTIFY');
    assert.equal(extractPattern('TERM1234'), 'TERM');
});
