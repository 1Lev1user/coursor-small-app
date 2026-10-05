export const prefersReducedMotion = () =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const easeOutCubic = (t) => 1 - (1 - t) ** 3;

/** Value at time `elapsed` of a tween from `from` to `to` cents; integers only. */
export function tweenValue(from, to, elapsed, duration) {
    if (elapsed >= duration) {
        return to;
    }
    return Math.round(from + (to - from) * easeOutCubic(Math.max(0, elapsed) / duration));
}

/** Runs onFrame(cents) on each animation frame and ends exactly on `to`. */
export function rollNumber({ from, to, duration = 600, onFrame, raf = requestAnimationFrame, now = () => performance.now() }) {
    if (from === to || prefersReducedMotion()) {
        onFrame(to);
        return;
    }
    const start = now();
    const step = () => {
        const value = tweenValue(from, to, now() - start, duration);
        onFrame(value);
        if (value !== to) {
            raf(step);
        }
    };
    raf(step);
}
