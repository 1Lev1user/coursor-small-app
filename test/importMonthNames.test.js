import test from 'node:test';
import assert from 'node:assert/strict';
import {
    parseDateWith,
    inferDateFormat,
    parseDelimited,
    findHeaderRow,
    guessColumns,
    rowsToStatement,
} from '../src/import/text.js';
import {
    checkSummary,
    checkWarnings,
    outOfRangeIndexes,
    layoutFitsSample,
    DATE_FORMAT_OPTIONS,
} from '../src/views/import.js';

const NOW = new Date(2026, 9, 17, 12);

function text(value) {
    return parseDateWith(value, 'TEXT');
}

test('English month names, full and short, any case and order', () => {
    for (const value of [
        '17 Sep 2026', '17 September 2026', 'SEP 17, 2026', 'Sep 17, 2026', '17-Sep-26',
        '17/Sep/2026', '17 Sep. 2026', '17 sep 2026 10:22', '17 SEPTEMBER 2026 10:22:05', '2026 Sep 17',
    ]) {
        assert.equal(text(value), '2026-09-17', value);
    }
    assert.equal(text('1 Jan 2026'), '2026-01-01');
    assert.equal(text('31 Dec 2026'), '2026-12-31');
    assert.equal(text('4 May 2026'), '2026-05-04');
});

test('Latvian month names, with and without diacritics', () => {
    assert.equal(text('17. septembris 2026'), '2026-09-17');
    assert.equal(text('17. sept 2026'), '2026-09-17');
    assert.equal(text('17. septembra 2026'), '2026-09-17');
    assert.equal(text('5. maijs 2026'), '2026-05-05');
    assert.equal(text('3. jūn 2026'), '2026-06-03');
    assert.equal(text('3. jun 2026'), '2026-06-03');
    assert.equal(text('3. jūnijs 2026'), '2026-06-03');
    assert.equal(text('1. marts 2026'), '2026-03-01');
    assert.equal(text('2. febr 2026'), '2026-02-02');
    assert.equal(text('4. okt 2026'), '2026-10-04');
    assert.equal(text('4. OKTOBRIS 2026. gada'), '2026-10-04');
    assert.equal(text('12. decembris 2026'), '2026-12-12');
    assert.equal(text('8. janvāris 2026'), '2026-01-08');
});

test('Russian month names, nominative, genitive and short forms', () => {
    assert.equal(text('17 сентября 2026'), '2026-09-17');
    assert.equal(text('17 СЕНТЯБРЯ 2026'), '2026-09-17');
    assert.equal(text('17 сентябрь 2026'), '2026-09-17');
    assert.equal(text('5 мая 2026'), '2026-05-05');
    assert.equal(text('5 май 2026'), '2026-05-05');
    assert.equal(text('3 янв 2026'), '2026-01-03');
    assert.equal(text('9 дек 2026'), '2026-12-09');
    assert.equal(text('12 ноября 2026'), '2026-11-12');
    assert.equal(text('17 сентября 2026 г.'), '2026-09-17');
    assert.equal(text('1 июня 2026'), '2026-06-01');
});

test('every month name in the three languages maps to one month', () => {
    const names = {
        1: ['jan', 'january', 'janvaris', 'январь', 'января', 'янв'],
        2: ['feb', 'february', 'februaris', 'febr', 'февраль', 'февраля', 'февр'],
        3: ['mar', 'march', 'marts', 'март', 'марта'],
        4: ['apr', 'april', 'aprilis', 'апрель', 'апреля', 'апр'],
        5: ['may', 'maijs', 'май', 'мая'],
        6: ['jun', 'june', 'junijs', 'июнь', 'июня', 'июн'],
        7: ['jul', 'july', 'julijs', 'июль', 'июля', 'июл'],
        8: ['aug', 'august', 'augusts', 'август', 'августа', 'авг'],
        9: ['sep', 'sept', 'september', 'septembris', 'сентябрь', 'сентября', 'сент'],
        10: ['oct', 'october', 'okt', 'oktobris', 'октябрь', 'октября', 'окт'],
        11: ['nov', 'november', 'novembris', 'ноябрь', 'ноября', 'нояб'],
        12: ['dec', 'december', 'decembris', 'декабрь', 'декабря', 'дек'],
    };
    for (const [month, words] of Object.entries(names)) {
        for (const word of words) {
            assert.equal(text(`10 ${word} 2026`), `2026-${month.padStart(2, '0')}-10`, word);
        }
    }
});

test('every Russian short form is read in lower, upper and title case', () => {
    const short = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const extra = { сент: 9, нояб: 11, февр: 2 };
    const cases = [...short.map((word, index) => [word, index + 1]), ...Object.entries(extra)];
    for (const [word, month] of cases) {
        const title = word[0].toUpperCase() + word.slice(1);
        for (const form of [word, word.toUpperCase(), title]) {
            assert.equal(text(`5 ${form} 2026`), `2026-${String(month).padStart(2, '0')}-05`, form);
        }
    }
});

test('text dates that are not dates return null', () => {
    for (const value of ['31 Sep 2026', '17 Foo 2026', '17 Sep', 'Sep 2026', '17 Sep 2026 extra', '17.09.2026', '', '17 Sep 20266']) {
        assert.equal(text(value), null, value);
    }
});

test('the digit formats still do not read month names', () => {
    for (const format of ['DMY', 'MDY', 'YMD']) {
        assert.equal(parseDateWith('17 Sep 2026', format), null, format);
    }
    assert.equal(parseDateWith('17.09.2026', 'DMY'), '2026-09-17');
});

test('inferDateFormat returns TEXT only when every sample is a month-name date', () => {
    assert.equal(inferDateFormat(['17 Sep 2026', '3 Oct 2026']), 'TEXT');
    assert.equal(inferDateFormat(['17 Sep 2026', '', '3 октября 2026']), 'TEXT');
    assert.equal(inferDateFormat(['17.09.2026', '18 Sep 2026']), null);
    assert.equal(inferDateFormat(['17 Sep 2026', '18 Foo 2026']), null);
    assert.equal(inferDateFormat(['17.09.2026', '18.09.2026']), 'DMY');
    assert.equal(inferDateFormat(['2026-09-17', '2026-09-18']), 'YMD');
});

function statementOf(csv) {
    const parsed = parseDelimited(csv);
    const header = findHeaderRow(parsed.rows);
    const guess = guessColumns(parsed.rows[header], parsed.rows.slice(header + 1));
    const statement = rowsToStatement(parsed.rows, header, {
        columns: guess.columns,
        decimalSeparator: guess.decimalSeparator,
        dateFormat: guess.dateFormat,
    });
    return { format: guess.dateFormat, dates: statement.rows.map((row) => row.date), skipped: statement.skipped.length };
}

test('Revolut one-digit hours and Wise date-times are read', () => {
    assert.equal(parseDateWith('2021-09-06 6:11:59', 'YMD'), '2021-09-06');
    assert.equal(parseDateWith('2021-09-06 6:11:59', 'DMY'), '2021-09-06');
    assert.equal(parseDateWith('2021-09-06 06:11:59.123', 'DMY'), '2021-09-06');
    assert.equal(parseDateWith('17-09-2026 14:03:22.123', 'DMY'), '2026-09-17');

    assert.deepEqual(
        statementOf('Type,Started Date,Description,Amount\nCARD_PAYMENT,2021-09-06 6:11:59,Shop,-4.50\nCARD_PAYMENT,2021-09-07 18:01:02,Cafe,-3.20\n'),
        { format: 'YMD', dates: ['2021-09-06', '2021-09-07'], skipped: 0 },
    );
    assert.deepEqual(
        statementOf('Date Time,Description,Amount\n17-09-2026 14:03:22.123,Shop,-4.50\n18-09-2026 09:00:00.000,Cafe,-3.20\n'),
        { format: 'DMY', dates: ['2026-09-17', '2026-09-18'], skipped: 0 },
    );
});

test('a file with month-name dates is read end to end', () => {
    assert.deepEqual(
        statementOf('Date,Description,Amount\n17 Sep 2026,Shop,-4.50\n3 Oct 2026,Cafe,-3.20\n'),
        { format: 'TEXT', dates: ['2026-09-17', '2026-10-03'], skipped: 0 },
    );
});

test('a saved layout with TEXT fits month-name dates only', () => {
    const saved = { dateFormat: 'TEXT', columns: { date: 0 }, decimalSeparator: '.' };
    assert.equal(layoutFitsSample(saved, [['17 Sep 2026', 'x', '1.00']]), true);
    assert.equal(layoutFitsSample(saved, [['17.09.2026', 'x', '1.00']]), false);
});

test('the date question offers the month-name option last', () => {
    assert.deepEqual(DATE_FORMAT_OPTIONS.at(-1), ['TEXT', 'Day and month name (17 Sep 2026)']);
    assert.deepEqual(DATE_FORMAT_OPTIONS.slice(0, 4).map(([value]) => value), ['', 'DMY', 'MDY', 'YMD']);
});

function rowsDated(...dates) {
    return dates.map((date) => ({ date, direction: 'out', amountCents: 100 }));
}

test('out of range: more than 1 year ahead or more than 15 years back', () => {
    const rows = rowsDated(
        '2026-10-17', '2027-10-17', '2027-10-18', '2011-10-17', '2011-10-16', '2062-09-13', '1926-09-14',
    );
    assert.deepEqual([...outOfRangeIndexes(rows, NOW)], [2, 4, 5, 6]);
    assert.equal(outOfRangeIndexes([], NOW).size, 0);
});

test('checkSummary counts far-future and far-past rows only when now is given', () => {
    const rows = rowsDated('2026-10-17', '2062-09-13', '2027-10-18', '1926-09-14');
    const summary = checkSummary(rows, [], { now: NOW });
    assert.equal(summary.futureCount, 2);
    assert.equal(summary.pastCount, 1);
    const plain = checkSummary(rows, []);
    assert.equal(plain.futureCount, 0);
    assert.equal(plain.pastCount, 0);
});

test('checkWarnings adds one line per non-zero count', () => {
    const clean = checkSummary(rowsDated('2026-10-17'), [], { now: NOW });
    assert.deepEqual(checkWarnings(clean, 'columns'), []);
    const both = checkSummary(rowsDated('2062-09-13', '2027-10-18', '1926-09-14'), [], { now: NOW });
    assert.deepEqual(checkWarnings(both, 'columns'), [
        '2 rows are dated more than a year ahead. They are not imported unless you tick them.',
        '1 row is dated more than 15 years back. It is not imported unless you tick it.',
    ]);
});
