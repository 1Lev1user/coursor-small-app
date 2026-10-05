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

/** Row collapse: keep COLLAPSE_MS and EASE_OUT equal to --dur-collapse and --ease in style.css. */
export const COLLAPSE_MS = 200;
export const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Resolves when `animation` finishes or is cancelled, or after `fallbackMs` if neither event arrives. */
export function afterMotion(animation, fallbackMs) {
    return new Promise((resolve) => {
        const done = () => {
            clearTimeout(timer);
            animation.removeEventListener('finish', done);
            animation.removeEventListener('cancel', done);
            resolve();
        };
        const timer = setTimeout(done, fallbackMs);
        animation.addEventListener('finish', done);
        animation.addEventListener('cancel', done);
    });
}

export const entryIdSet = (data) =>
    new Set([...data.expenses, ...data.incomes].map(({ id }) => id));

/** The one entry id in `data` that is not in `previousIds`; null for none, or for several (an import). */
export function findNewEntryId(previousIds, data) {
    const added = [...entryIdSet(data)].filter((id) => !previousIds.has(id));
    return added.length === 1 ? added[0] : null;
}

/** Target keyframe of a removed row; the start is the row's own style. */
export const collapseKeyframes = () => [{
    gridTemplateRows: '0fr',
    opacity: 0,
    paddingBlock: '0px',
    borderTopWidth: '0px',
}];
