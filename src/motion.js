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

const ADD_FORMS = ['Add expense', 'Add income'];
const ADD_CLOSED = ['Home', 'Expense added', 'Income added', 'Refund added'];
const MONTH_TABS = ['month', 'chart'];

/**
 * Screen change from `prev` to `next` ({ tab, title, monthKey }) as a transition kind, or null for none.
 * Month kinds only when the tab stays Month or Chart: on Add, setMonthKey runs before goTo('month').
 */
export function transitionKind(prev, next) {
    if (prev === null) {
        return null;
    }
    if (prev.tab !== next.tab) {
        return 'tab';
    }
    if (next.tab === 'add') {
        if (prev.title === 'Home' && ADD_FORMS.includes(next.title)) {
            return 'sheet-open';
        }
        return ADD_FORMS.includes(prev.title) && ADD_CLOSED.includes(next.title) ? 'sheet-close' : null;
    }
    if (MONTH_TABS.includes(next.tab) && prev.monthKey !== next.monthKey) {
        return next.monthKey > prev.monthKey ? 'month-next' : 'month-prev';
    }
    return null;
}

let transitionSeq = 0;

/**
 * Runs `update` inside a same-document View Transition when the browser has one, `kind` is not null
 * and Reduce Motion is off; otherwise at once. `data-transition` holds the kind until the latest
 * transition ends. Returns true when a transition started.
 */
export function runWithTransition(kind, update, env = {}) {
    const doc = env.doc ?? globalThis.document;
    const reduce = env.reduce ?? prefersReducedMotion;
    if (kind === null || reduce() || typeof doc?.startViewTransition !== 'function') {
        update();
        return false;
    }
    const mine = ++transitionSeq;
    const dataset = doc.documentElement.dataset;
    dataset.transition = kind;
    const clear = () => {
        if (mine === transitionSeq) {
            delete dataset.transition;
        }
    };
    try {
        doc.startViewTransition(update).finished.then(clear, clear);
    } catch {
        clear();
        update();
        return false;
    }
    return true;
}
