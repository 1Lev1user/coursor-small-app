import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, chartColour, donutSlices } from '../src/donut.js';

test('donutSlices calculates fractions and contiguous clockwise angles', () => {
    const slices = donutSlices([
        { id: 'a', label: 'Alpha', valueCents: 100 },
        { id: 'b', label: 'Beta', valueCents: 200 },
        { id: 'c', label: 'Gamma', valueCents: 300 },
    ]);

    assert.equal(slices.reduce((sum, { fraction }) => sum + fraction, 0), 1);
    assert.equal(slices[0].startAngle, 0);
    for (let index = 1; index < slices.length; index += 1) {
        assert.equal(slices[index].startAngle, slices[index - 1].endAngle);
    }
    assert.equal(slices.at(-1).endAngle, 360);
});

test('donutSlices drops zero and negative values and preserves positive item data', () => {
    assert.deepEqual(
        donutSlices([
            { id: 'zero', label: 'Zero', valueCents: 0 },
            { id: 'positive', label: 'Positive', valueCents: 250 },
            { id: 'negative', label: 'Negative', valueCents: -10 },
        ]).map(({ id, label, valueCents }) => ({ id, label, valueCents })),
        [{ id: 'positive', label: 'Positive', valueCents: 250 }],
    );
});

test('donutSlices returns an empty array when nothing is positive', () => {
    assert.deepEqual(donutSlices([]), []);
    assert.deepEqual(donutSlices([
        { id: 'zero', label: 'Zero', valueCents: 0 },
        { id: 'negative', label: 'Negative', valueCents: -1 },
    ]), []);
});

test('donutSlices emits a non-empty full-circle path for one item', () => {
    const [slice] = donutSlices([
        { id: 'only', label: 'Only', valueCents: 500 },
    ]);

    assert.ok(slice.path.length > 0);
    assert.equal(slice.endAngle, 360);
});

test('PALETTE uses the theme category colours in fixed order', () => {
    assert.equal(PALETTE[0], 'var(--cat-1)');
    assert.ok(PALETTE.length >= 8);
    assert.equal(new Set(PALETTE).size, PALETTE.length);
});

test('donutSlices uses the palette first, then distinct generated colours', () => {
    const items = Array.from({ length: PALETTE.length + 2 }, (_, index) => ({
        id: String(index),
        label: `Item ${index}`,
        valueCents: 1,
    }));
    const slices = donutSlices(items);

    assert.deepEqual(
        slices.map(({ colour }) => colour),
        items.map((_, index) => chartColour(index)),
    );
    assert.deepEqual(slices.slice(0, PALETTE.length).map(({ colour }) => colour), PALETTE);
    const extra = slices.slice(PALETTE.length).map(({ colour }) => colour);
    assert.ok(extra.every((colour) => colour.startsWith('hsl(')));
    assert.equal(new Set(extra).size, extra.length);
});
