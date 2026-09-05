import test from 'node:test';
import assert from 'node:assert/strict';
import {
    todayISO,
    currentMonthKey,
    monthKeyOf,
    dayOf,
    addMonths,
    daysInMonth,
    clampDay,
    monthLabel,
    dateInMonth,
    isInMonth,
    compareMonthKeys,
} from '../src/months.js';

test('todayISO returns local date as YYYY-MM-DD', () => {
    assert.equal(todayISO(new Date(2026, 8, 5)), '2026-09-05');
    assert.equal(todayISO(new Date(2026, 0, 1)), '2026-01-01');
    assert.equal(todayISO(new Date(2026, 11, 31)), '2026-12-31');
});

test('currentMonthKey returns YYYY-MM from local date', () => {
    assert.equal(currentMonthKey(new Date(2026, 8, 5)), '2026-09');
    assert.equal(currentMonthKey(new Date(2027, 0, 15)), '2027-01');
});

test('monthKeyOf extracts month key from date string', () => {
    assert.equal(monthKeyOf('2026-09-05'), '2026-09');
    assert.equal(monthKeyOf('2027-01-01'), '2027-01');
});

test('monthKeyOf returns null for malformed input', () => {
    assert.equal(monthKeyOf(''), null);
    assert.equal(monthKeyOf('2026-9-5'), null);
    assert.equal(monthKeyOf('not a date'), null);
    assert.equal(monthKeyOf(null), null);
});

test('dayOf extracts day of month as number', () => {
    assert.equal(dayOf('2026-09-05'), 5);
    assert.equal(dayOf('2026-09-01'), 1);
    assert.equal(dayOf('2026-09-30'), 30);
});

test('dayOf returns null for malformed input', () => {
    assert.equal(dayOf(''), null);
    assert.equal(dayOf('2026-9-5'), null);
    assert.equal(dayOf('not a date'), null);
    assert.equal(dayOf(null), null);
});

test('addMonths moves across months and years', () => {
    assert.equal(addMonths('2026-09', 1), '2026-10');
    assert.equal(addMonths('2026-12', 1), '2027-01');
    assert.equal(addMonths('2026-01', -1), '2025-12');
    assert.equal(addMonths('2026-09', 0), '2026-09');
    assert.equal(addMonths('2026-09', -14), '2025-07');
});

test('daysInMonth returns correct day count including leap years', () => {
    assert.equal(daysInMonth('2026-02'), 28);
    assert.equal(daysInMonth('2024-02'), 29);
    assert.equal(daysInMonth('2000-02'), 29);
    assert.equal(daysInMonth('1900-02'), 28);
    assert.equal(daysInMonth('2026-04'), 30);
    assert.equal(daysInMonth('2026-12'), 31);
});

test('clampDay clamps day to valid range for month', () => {
    assert.equal(clampDay('2026-02', 31), 28);
    assert.equal(clampDay('2024-02', 31), 29);
    assert.equal(clampDay('2026-09', 31), 30);
    assert.equal(clampDay('2026-09', 5), 5);
    assert.equal(clampDay('2026-09', 0), 1);
});

test('monthLabel returns English month and year', () => {
    assert.equal(monthLabel('2026-09'), 'September 2026');
    assert.equal(monthLabel('2027-01'), 'January 2027');
});

test('dateInMonth builds date string with clamped day', () => {
    assert.equal(dateInMonth('2026-09', 5), '2026-09-05');
    assert.equal(dateInMonth('2026-02', 31), '2026-02-28');
    assert.equal(dateInMonth('2024-02', 31), '2024-02-29');
});

test('isInMonth checks membership in month', () => {
    assert.equal(isInMonth('2026-09-05', '2026-09'), true);
    assert.equal(isInMonth('2026-10-01', '2026-09'), false);
    assert.equal(isInMonth('', '2026-09'), false);
    assert.equal(isInMonth('2026-9-5', '2026-09'), false);
    assert.equal(isInMonth('not a date', '2026-09'), false);
});

test('compareMonthKeys orders month keys chronologically', () => {
    assert.ok(compareMonthKeys('2025-12', '2026-01') < 0);
    assert.equal(compareMonthKeys('2026-09', '2026-09'), 0);
    assert.ok(compareMonthKeys('2027-01', '2026-12') > 0);
});
