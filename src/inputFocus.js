// Select the whole value of a filled number field on focus, so typing replaces it.
export function shouldSelectOnFocus(target) {
    if (!target || target.tagName !== 'INPUT') return false;
    const numeric = target.inputMode === 'decimal' || target.inputMode === 'numeric' || target.type === 'number';
    return numeric && target.value !== '' && !target.readOnly && !target.disabled;
}

export function selectOnFocus(event) {
    const target = event.target;
    if (!shouldSelectOnFocus(target)) return;
    // iOS Safari drops a selection made inside the focus event; select on the next frame.
    requestAnimationFrame(() => { if (document.activeElement === target) target.select(); });
}
