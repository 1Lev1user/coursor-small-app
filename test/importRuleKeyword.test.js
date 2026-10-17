import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPattern } from '../src/import/core.js';

test('a name with a digit keeps its digit: TELE2 SIA offers TELE2, not the legal form', () => {
    assert.equal(extractPattern('TELE2 SIA'), 'TELE2');
    assert.equal(extractPattern('SIA TELE2'), 'TELE2');
});

test('a trailing run of 4 or more digits is cut from a token, the shop part stays', () => {
    assert.equal(extractPattern('BOLT.EUR2610011807 Tallinn'), 'BOLT.EUR');
    assert.equal(extractPattern('BOLT.EU/R/2610061652 Tallinn'), 'BOLT.EU');
    assert.equal(extractPattern('HESBURGER 43019 Riga'), 'HESBURGER');
});

test('a legal form left alone is never a keyword', () => {
    assert.equal(extractPattern('SIA'), '');
    assert.equal(extractPattern('SIA 1234'), '');
});

test('card masks and numbers still leave the name', () => {
    assert.equal(extractPattern('Revolut**6588* Dublin'), 'REVOLUT');
    assert.equal(extractPattern('RIMI SHM ORIGO (RIGA) RIGA'), 'RIMI');
});

test('tokens that are only digits, or lose their letters, are still dropped', () => {
    assert.equal(extractPattern('12345 17.09 RĪGA LV'), '');
    assert.equal(extractPattern('A1 12345'), '');
});
