import test from 'node:test';
import assert from 'node:assert/strict';
import { splitBankDetails } from '../src/import/details.js';

const NO_DATE = { date: '', mcc: '' };

test('a party line followed by a purpose line: the purpose is the description', () => {
    const r = splitBankDetails('PARAUGS SIA LV00HABA0000000000001\nRēķins par decembri', '2026-10-01');
    assert.deepEqual(r, { description: 'Rēķins par decembri', counterparty: 'PARAUGS SIA', ...NO_DATE });
});

test('purpose before and after the party line: both kept in order, payer reference dropped', () => {
    const r = splitBankDetails('Avanss\nPARAUGS SIA 40000000000 HABALV22 LV00HABA0000000000001\nRēķins Nr. 7\nMaksātāja reference: 12345', '2026-10-01');
    assert.equal(r.counterparty, 'PARAUGS SIA');
    assert.equal(r.description, 'Avanss Rēķins Nr. 7');
    assert.doesNotMatch(r.description, /12345/);
});

test('a token that only looks like an IBAN is not a party line', () => {
    assert.deepEqual(
        splitBankDetails('Invoice PR2026123456789\nsecond line', '2026-10-01'),
        { description: 'Invoice PR2026123456789 second line', counterparty: '', ...NO_DATE },
    );
});

test('an IBAN of a listed country with the wrong length is not a party line', () => {
    for (const bad of ['LV00HABA000000000000', 'LV00HABA00000000000012']) {
        const r = splitBankDetails(`Rent\nPARAUGS SIA ${bad}`, '2026-10-01');
        assert.equal(r.counterparty, '', bad);
        assert.equal(r.description, `Rent PARAUGS SIA ${bad}`, bad);
    }
    // a wrong-length token is not scrubbed from a real transfer's purpose either
    const r = splitBankDetails('Pay LV00HABA000000000000 now\nPARAUGS SIA LV00HABA0000000000001', '2026-10-01');
    assert.equal(r.description, 'Pay LV00HABA000000000000 now');
    // other countries at their real length are accepted
    for (const ok of ['DE00123456789012345678', 'GB00ABCD12345678901234', 'NO0012345678901', 'MT00ABCD12345678901234567890123']) {
        assert.equal(splitBankDetails(`Text\nFIRMA SIA ${ok}`, '2026-10-01').counterparty, 'FIRMA SIA', ok);
    }
});

test('a card mask in a purpose line is removed from the description', () => {
    const r = splitBankDetails('Atmaksa par karti 400000******0000 janvaris\nPARAUGS SIA LV00HABA0000000000001\nPapildus 500000*****1111', '2026-10-01');
    assert.equal(r.description, 'Atmaksa par karti janvaris Papildus');
    assert.doesNotMatch(r.description, /\*/);
});

test('the Citadele transfer shape still gives the same payee and text', () => {
    const r = splitBankDetails('Darba algas izmaksa par 2026. gada septembri\nJĀNIS ĶĒNIŅŠ 010190-12345 HABALV22XXX LV00HABA0000000000002\nMaksātāja reference: 12345', '2026-10-01');
    assert.deepEqual(r, { description: 'Darba algas izmaksa par 2026. gada septembri', counterparty: 'JĀNIS ĶĒNIŅŠ', ...NO_DATE });
});
