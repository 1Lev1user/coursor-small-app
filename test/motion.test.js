import test from 'node:test';
import assert from 'node:assert/strict';
import { easeOutCubic, prefersReducedMotion, rollNumber, tweenValue } from '../src/motion.js';

test('tweenValue starts at from and ends at to', () => {
    assert.equal(tweenValue(1000, 4000, 0, 600), 1000);
    assert.equal(tweenValue(1000, 4000, 600, 600), 4000);
    assert.equal(tweenValue(1000, 4000, 900, 600), 4000);
    assert.equal(tweenValue(1000, 4000, -50, 600), 1000);
});

test('easeOutCubic maps 0 to 0 and 1 to 1', () => {
    assert.equal(easeOutCubic(0), 0);
    assert.equal(easeOutCubic(1), 1);
});

test('tweenValue gives integers that never pass the target, rising, falling and across zero', () => {
    for (const [from, to] of [[1000, 4000], [4000, 1000], [-2500, 1500], [1500, -2500]]) {
        const low = Math.min(from, to);
        const high = Math.max(from, to);
        let previous = from;
        for (let elapsed = 0; elapsed <= 600; elapsed += 10) {
            const value = tweenValue(from, to, elapsed, 600);
            assert.ok(Number.isInteger(value));
            assert.ok(value >= low && value <= high);
            assert.ok(to > from ? value >= previous : value <= previous);
            previous = value;
        }
        assert.equal(previous, to);
    }
});

function fakeClock() {
    let time = 0;
    const queue = [];
    return {
        now: () => time,
        raf: (callback) => queue.push(callback),
        pending: () => queue.length,
        tick(ms = 16) {
            time += ms;
            queue.shift()();
        },
    };
}

test('rollNumber ends exactly on the target and stops asking for frames', () => {
    const clock = fakeClock();
    const seen = [];
    rollNumber({ from: 1000, to: 4000, onFrame: (value) => seen.push(value), raf: clock.raf, now: clock.now });
    assert.equal(clock.pending(), 1);
    while (clock.pending() > 0) {
        clock.tick();
    }
    assert.ok(seen.length > 2);
    assert.equal(seen[seen.length - 1], 4000);
    assert.ok(seen.slice(0, -1).every((value) => value !== 4000));
    assert.equal(clock.pending(), 0);
});

test('rollNumber with from equal to to calls onFrame once and schedules nothing', () => {
    const clock = fakeClock();
    const seen = [];
    rollNumber({ from: 700, to: 700, onFrame: (value) => seen.push(value), raf: clock.raf, now: clock.now });
    assert.deepEqual(seen, [700]);
    assert.equal(clock.pending(), 0);
});

test('under Reduce Motion rollNumber shows the target at once', () => {
    assert.equal(prefersReducedMotion(), false);
    globalThis.matchMedia = () => ({ matches: true });
    try {
        assert.equal(prefersReducedMotion(), true);
        const clock = fakeClock();
        const seen = [];
        rollNumber({ from: 1000, to: 4000, onFrame: (value) => seen.push(value), raf: clock.raf, now: clock.now });
        assert.deepEqual(seen, [4000]);
        assert.equal(clock.pending(), 0);
    } finally {
        delete globalThis.matchMedia;
    }
});
