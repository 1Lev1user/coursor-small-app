import test from 'node:test';
import assert from 'node:assert/strict';
import { splitBankDetails } from '../src/import/details.js';

const NO_DATE = { date: '', mcc: '' };
const DAY = '2026-10-01';

// Test-local copy of the 97 IBAN registry lengths (SWIFT registry as in ibantools 4.5.4).
const LENGTHS = {
    AD: 24, AE: 23, AL: 28, AT: 20, AX: 18, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22,
    BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28, EE: 20,
    EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GF: 27, GI: 23, GL: 18,
    GP: 27, GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27,
    JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, LY: 25,
    MC: 27, MD: 24, ME: 22, MF: 27, MK: 19, MN: 20, MQ: 27, MR: 27, MT: 31, MU: 30,
    NC: 27, NI: 28, NL: 18, NO: 15, OM: 23, PF: 27, PK: 24, PL: 28, PM: 27, PS: 29,
    PT: 25, QA: 29, RE: 27, RO: 24, RS: 22, RU: 33, SA: 24, SC: 31, SD: 18, SE: 24,
    SI: 19, SK: 24, SM: 27, SO: 23, ST: 25, SV: 28, TF: 27, TL: 23, TN: 24, TR: 26,
    UA: 29, VA: 22, VG: 24, WF: 27, XK: 20, YE: 30, YT: 27,
};

function fake(country, length) {
    return country + '00' + 'ABCD1234567890XYZ'.repeat(5).slice(0, length - 4);
}

const PAYEE = 'PARAUGS SIA LV00HABA0000000000001';

function purposeResult(purpose) {
    return splitBankDetails(`${PAYEE}\n${purpose}`, DAY);
}

test('the table holds 97 registry countries', () => {
    assert.equal(Object.keys(LENGTHS).length, 97);
});

test('every registry country: its IBAN makes the payee, the first line stays the description', () => {
    for (const [country, length] of Object.entries(LENGTHS)) {
        const iban = fake(country, length);
        assert.equal(iban.length, length, country);
        const r = splitBankDetails(`Text\nFIRMA SIA ${iban}`, DAY);
        assert.deepEqual(r, { description: 'Text', counterparty: 'FIRMA SIA', ...NO_DATE }, country);
    }
});

test('every registry country: one character too long or too short is not a payee', () => {
    for (const [country, length] of Object.entries(LENGTHS)) {
        for (const wrong of [length + 1, length - 1]) {
            const token = fake(country, wrong);
            const r = splitBankDetails(`Text\nFIRMA SIA ${token}`, DAY);
            assert.equal(r.counterparty, '', `${country} ${wrong}`);
            assert.equal(r.description, `Text FIRMA SIA ${token}`, `${country} ${wrong}`);
        }
    }
});

test('LI, IS, UA, TR and AE: the IBAN is the payee on a party line and scrubbed in a purpose line', () => {
    for (const country of ['LI', 'IS', 'UA', 'TR', 'AE']) {
        const iban = fake(country, LENGTHS[country]);
        const party = splitBankDetails(`Rent\nFIRMA SIA ${iban}`, DAY);
        assert.equal(party.counterparty, 'FIRMA SIA', country);
        const purpose = splitBankDetails(`Transfer to ${iban} done\n${PAYEE}`, DAY);
        assert.equal(purpose.counterparty, 'PARAUGS SIA', country);
        assert.equal(purpose.description, 'Transfer to done', country);
    }
});

test('countries outside the registry stay unrecognised', () => {
    for (const [country, length] of [['MA', 28], ['DZ', 26], ['IR', 26]]) {
        const token = fake(country, length);
        const r = splitBankDetails(`Text\nFIRMA SIA ${token}`, DAY);
        assert.equal(r.counterparty, '', country);
        assert.equal(r.description, `Text FIRMA SIA ${token}`, country);
    }
});

test('11 digits next to a personal code word are scrubbed', () => {
    const cases = [
        ['Personas kods 32123456789 alga', 'Personas kods alga'],
        ['p.k. 12345678901 alga', 'p.k. alga'],
        ['Персональный код 40000000000', 'Персональный код'],
        ['PERSONAS KODS: 99999999999', 'PERSONAS KODS:'],
    ];
    for (const [purpose, expected] of cases) {
        const r = purposeResult(purpose);
        assert.equal(r.counterparty, 'PARAUGS SIA', purpose);
        assert.equal(r.description, expected, purpose);
    }
});

test('11 digits that form a valid Latvian personal code are scrubbed', () => {
    const cases = [
        ['01019012345 darbs', 'darbs'],
        ['Maksa 32123456789', 'Maksa'],
        ['Maksa no 01019012345', 'Maksa no'],
        ['29022012345', ''],
        ['Alga 010190-12345', 'Alga'],
    ];
    for (const [purpose, expected] of cases) {
        assert.equal(purposeResult(purpose).description, expected, purpose);
    }
});

test('11 digits that are an invoice, customer or other number are kept', () => {
    for (const purpose of [
        'Rēķins 12345678901', 'Rēķins Nr. 32123456789', 'Klienta nr 32123456789', 'Invoice 32123456789',
        'Līgums 12345678901', 'Konts 40000000000', 'Apmaksa 29021012345', 'Apmaksa 31029912345',
        'Piegāde 37120000000', 'Id 123456789012', 'Apmaksa PR32123456789',
    ]) {
        assert.equal(purposeResult(purpose).description, purpose, purpose);
    }
});

test('11 digits are kept when a label stands within the 3 words before them', () => {
    for (const purpose of [
        'Faktūra 32123456789', 'Invoice No 32123456789', 'Order no 32123456789', 'Pavadzīme 32123456789',
        'Klienta numurs 01019012345', 'Rēķins par 32123456789', 'Konts 01019012345',
        'Kvīts 32123456789', 'Čeks 32123456789', 'Номер 32123456789',
    ]) {
        assert.equal(purposeResult(purpose).description, purpose, purpose);
    }
});

test('11 digits are scrubbed when "no" is the only word before them, or the line names a personal code', () => {
    const cases = [
        ['Maksa no 01019012345', 'Maksa no'],
        ['Pers. kods 01019012345 alga', 'Pers. kods alga'],
        ['Pers.kods 32123456789', 'Pers.kods'],
        ['Rēķins apmaksāts par preci no 32123456789', 'Rēķins apmaksāts par preci no'],
    ];
    for (const [purpose, expected] of cases) {
        assert.equal(purposeResult(purpose).description, expected, purpose);
    }
});

test('Citadele: the payee name still ends at the personal code or the 11 digits', () => {
    const salary = splitBankDetails(
        'Darba algas izmaksa\nJĀNIS ĶĒNIŅŠ 010190-12345 HABALV22XXX LV00HABA0000000000002\nMaksātāja reference: 12345',
        DAY,
    );
    assert.deepEqual(salary, { description: 'Darba algas izmaksa', counterparty: 'JĀNIS ĶĒNIŅŠ', ...NO_DATE });
    const company = splitBankDetails('Rent\nPARAUGS SIA 40000000000 HABALV22 LV00HABA0000000000001', DAY);
    assert.deepEqual(company, { description: 'Rent', counterparty: 'PARAUGS SIA', ...NO_DATE });
});
