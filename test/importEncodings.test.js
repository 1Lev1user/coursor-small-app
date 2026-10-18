import test from 'node:test';
import assert from 'node:assert/strict';

import { decodeBytes } from '../src/import/text.js';

function utf16(str, le) {
    const out = new Uint8Array(str.length * 2);
    for (let i = 0; i < str.length; i += 1) {
        const code = str.charCodeAt(i);
        out[i * 2 + (le ? 0 : 1)] = code & 0xff;
        out[i * 2 + (le ? 1 : 0)] = code >> 8;
    }
    return out;
}

// Builds single-byte text by asking the decoder which byte gives each character.
function encode(label, str) {
    const decoder = new TextDecoder(label);
    const byChar = new Map();
    for (let b = 255; b >= 0; b -= 1) {
        byChar.set(decoder.decode(new Uint8Array([b])), b);
    }
    return Uint8Array.from(Array.from(str), (ch) => {
        if (!byChar.has(ch)) {
            throw new Error(`no ${label} byte for ${ch}`);
        }
        return byChar.get(ch);
    });
}

const LATIN = 'Datums;Apraksts;Summa\n01.10.2026;Kafija;-3,50\n02.10.2026;Maxima;-12,40\n';
const RUSSIAN = [
    'Дата;Описание;Сумма',
    '01.10.2026;Продукты в магазине;-12,40',
    '02.10.2026;Оплата за проезд;-1,50',
    '03.10.2026;Зарплата за месяц;1200,00',
    '',
].join('\n');
const LATVIAN = [
    'Datums;Apraksts;Summa',
    '01.10.2026;Šokolāde un ķirši;-4,20',
    '02.10.2026;Čaumala ģimenei, ūdens, žāvēta zivs;-17,80',
    '03.10.2026;Ļoti vēlā rēķina apmaksa, Ņujorkas ceļš;-30,00',
    '',
].join('\n');
const ESTONIAN = 'Kuupäev;Selgitus;Summa\n01.10.2026;Õunamahl ja töötasu, üürileping, käsitöö, jäätis, õhtusöök, päikese, tüdruk, söögikoht;-8,00\n'.repeat(2);
const LITHUANIAN = 'Data;Aprašymas;Suma\n01.10.2026;Ąžuolų gatvė, įmoka už šaltį, mėnesio užmokestis, žąsų ėdalas, ūkininko pienas, vėžių sriuba;-9,00\n'.repeat(2);

test('UTF-16LE without a BOM is detected', () => {
    const result = decodeBytes(utf16(LATIN, true));
    assert.equal(result.text, LATIN);
    assert.equal(result.encoding, 'utf-16le');
});

test('UTF-16BE without a BOM is detected', () => {
    const result = decodeBytes(utf16(LATIN, false));
    assert.equal(result.text, LATIN);
    assert.equal(result.encoding, 'utf-16be');
});

test('a tiny UTF-16 file without a BOM is detected', () => {
    assert.equal(decodeBytes(utf16('A;B', true)).encoding, 'utf-16le');
    assert.equal(decodeBytes(utf16('A;B', false)).encoding, 'utf-16be');
});

test('UTF-16LE without a BOM keeps Latvian letters', () => {
    const text = 'Datums;Apraksts;Summa\n01.10.2026;Šokolāde;-4,20\n';
    const result = decodeBytes(utf16(text, true));
    assert.equal(result.text, text);
    assert.equal(result.encoding, 'utf-16le');
});

test('a Russian windows-1251 CSV is detected', () => {
    const result = decodeBytes(encode('windows-1251', RUSSIAN));
    assert.equal(result.text, RUSSIAN);
    assert.equal(result.encoding, 'windows-1251');
});

test('windows-1251 is detected for lowercase-only and capitals-only text', () => {
    const lower = 'оплата за проезд в автобусе;оплата за продукты в магазине\n';
    const upper = 'ОПЛАТА ЗА ПРОЕЗД В АВТОБУСЕ;ОПЛАТА ЗА ПРОДУКТЫ В МАГАЗИНЕ\n';
    for (const text of [lower, upper]) {
        const result = decodeBytes(encode('windows-1251', text));
        assert.equal(result.text, text);
        assert.equal(result.encoding, 'windows-1251');
    }
});

test('a short Russian windows-1251 file below 20 letters stays windows-1257', () => {
    const result = decodeBytes(encode('windows-1251', 'Дата;Описание;Сумма'));
    assert.equal(result.encoding, 'windows-1257');
});

test('a Latvian windows-1257 CSV stays windows-1257', () => {
    const result = decodeBytes(encode('windows-1257', LATVIAN));
    assert.equal(result.text, LATVIAN);
    assert.equal(result.encoding, 'windows-1257');
});

test('a Latvian windows-1257 CSV with few diacritics stays windows-1257', () => {
    const text = 'Datums;Apraksts;Summa\n01.10.2026;Kafija un ēdiens;-3,50\n';
    const result = decodeBytes(encode('windows-1257', text));
    assert.equal(result.text, text);
    assert.equal(result.encoding, 'windows-1257');
});

test('Estonian and Lithuanian windows-1257 files stay windows-1257', () => {
    for (const text of [ESTONIAN, LITHUANIAN]) {
        const result = decodeBytes(encode('windows-1257', text));
        assert.equal(result.text, text);
        assert.equal(result.encoding, 'windows-1257');
    }
});

test('a windows-1257 file with a few Latin high letters stays windows-1257', () => {
    const text = 'Date;Cafe;Amount\n01.10.2026;Café é;-3,50\n02.10.2026;Köln;-1,00\n';
    const result = decodeBytes(encode('windows-1257', text));
    assert.equal(result.text, text);
    assert.equal(result.encoding, 'windows-1257');
});

test('a Latvian windows-1257 file with one foreign letter stays windows-1257', () => {
    const body = LATVIAN.split('\n').slice(1, 4).join('\n');
    for (const extra of ['Café', 'Strauß', '€ 5', 'Ó', 'Æ', 'ŗ']) {
        const text = `Datums;Apraksts;Summa\n${body}\n${body}\n01.10.2026;${extra};-3,50\n`;
        const result = decodeBytes(encode('windows-1257', text));
        assert.equal(result.text, text, extra);
        assert.equal(result.encoding, 'windows-1257', extra);
    }
});

test('a diacritic-heavy Latvian windows-1257 file with one foreign letter stays windows-1257', () => {
    const text = `${'ēšķīļģāūžņčē '.repeat(6)}\n01.10.2026;Café;-3,50\n`;
    const result = decodeBytes(encode('windows-1257', text));
    assert.equal(result.text, text);
    assert.equal(result.encoding, 'windows-1257');
});

test('a mostly ASCII Western file with many accents is not read as windows-1251', () => {
    const text = 'Date;Description;Amount\n'
        + '01.10.2026;Café René, crème brûlée, señor Muñoz, Søren Ørsted, élève;-3,50\n'.repeat(5);
    const result = decodeBytes(encode('windows-1252', text));
    assert.equal(result.encoding, 'windows-1257');
});

test('a Russian windows-1251 file with Latin words is still detected', () => {
    const text = [
        'Дата;Описание;Сумма;Валюта',
        '01.10.2026;Оплата в магазине SIA Maxima;-12,40;EUR',
        '02.10.2026;Перевод на карту, получатель Иванов;-30,00;EUR',
        '03.10.2026;Зарплата за месяц;1200,00;EUR',
        '',
    ].join('\n');
    const result = decodeBytes(encode('windows-1251', text));
    assert.equal(result.text, text);
    assert.equal(result.encoding, 'windows-1251');
});

test('pure ASCII stays utf-8', () => {
    const result = decodeBytes(new TextEncoder().encode(LATIN));
    assert.equal(result.text, LATIN);
    assert.equal(result.encoding, 'utf-8');
});

test('UTF-8 with Cyrillic and with a BOM stays utf-8', () => {
    const bytes = new TextEncoder().encode(RUSSIAN);
    assert.deepEqual(decodeBytes(bytes), { text: RUSSIAN, encoding: 'utf-8' });
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...bytes]);
    assert.deepEqual(decodeBytes(withBom), { text: RUSSIAN, encoding: 'utf-8' });
});

test('UTF-16 with a BOM is unchanged', () => {
    const le = new Uint8Array([0xff, 0xfe, ...utf16(LATIN, true)]);
    const be = new Uint8Array([0xfe, 0xff, ...utf16(LATIN, false)]);
    assert.deepEqual(decodeBytes(le), { text: LATIN, encoding: 'utf-16le' });
    assert.deepEqual(decodeBytes(be), { text: LATIN, encoding: 'utf-16be' });
});

test('empty and one-byte inputs do not throw', () => {
    assert.deepEqual(decodeBytes(new Uint8Array(0)), { text: '', encoding: 'utf-8' });
    assert.equal(decodeBytes(new Uint8Array([0x41])).text, 'A');
});

function withStub(failingLabel, fn) {
    const OriginalTextDecoder = globalThis.TextDecoder;
    globalThis.TextDecoder = class {
        constructor(label, options) {
            if (label === failingLabel) {
                throw new RangeError('unsupported label');
            }
            return new OriginalTextDecoder(label, options);
        }
    };
    try {
        return fn();
    } finally {
        globalThis.TextDecoder = OriginalTextDecoder;
    }
}

test('windows-1252 fallback still works when windows-1257 is unsupported', () => {
    const bytes = new Uint8Array([0xc2, 0x20, 0xe7, 0x20, 0xf0]);
    withStub('windows-1257', () => {
        assert.equal(decodeBytes(bytes).encoding, 'windows-1252');
    });
});

test('Russian bytes fall back to windows-1257 when windows-1251 is unsupported', () => {
    const bytes = encode('windows-1251', RUSSIAN);
    withStub('windows-1251', () => {
        assert.equal(decodeBytes(bytes).encoding, 'windows-1257');
    });
});
