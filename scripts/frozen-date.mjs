// Used with `node --import ./scripts/frozen-date.mjs --test ...` to prove tests do not depend on today's date.
// If FROZEN_DATE (YYYY-MM-DD) is set, new Date() and Date.now() return that day at 12:00 local time.
const frozen = process.env.FROZEN_DATE;
if (frozen) {
    const [y, m, d] = frozen.split('-').map(Number);
    const now = new Date(y, m - 1, d, 12, 0, 0).getTime();
    const Real = globalThis.Date;
    globalThis.Date = class extends Real {
        constructor(...args) {
            super(...(args.length ? args : [now]));
        }
        static now() {
            return now;
        }
    };
}
