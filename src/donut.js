import { formatEuro } from './money.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CENTRE = 50;
const OUTER_RADIUS = 45;
const INNER_RADIUS = 28;

export const PALETTE = [
    '#2563eb',
    '#059669',
    '#d97706',
    '#7c3aed',
    '#dc2626',
    '#0891b2',
    '#db2777',
    '#4d7c0f',
    '#ea580c',
    '#0f766e',
    '#9333ea',
    '#b45309',
];

/** Distinct chart colour for any index — fixed palette first, then HSL steps. */
export function chartColour(index) {
    if (index < PALETTE.length) {
        return PALETTE[index];
    }
    const hue = Math.round((index * 137.508) % 360);
    const saturation = 55 + (index % 3) * 8;
    const lightness = 38 + (index % 4) * 5;
    return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function point(radius, angle) {
    const radians = angle * Math.PI / 180;
    return {
        x: CENTRE + radius * Math.sin(radians),
        y: CENTRE - radius * Math.cos(radians),
    };
}

function annulusPath(startAngle, endAngle) {
    const outerStart = point(OUTER_RADIUS, startAngle);
    const outerEnd = point(OUTER_RADIUS, endAngle);
    const innerEnd = point(INNER_RADIUS, endAngle);
    const innerStart = point(INNER_RADIUS, startAngle);

    if (endAngle - startAngle === 360) {
        const outerMiddle = point(OUTER_RADIUS, startAngle + 180);
        const innerMiddle = point(INNER_RADIUS, startAngle + 180);
        return [
            `M ${outerStart.x} ${outerStart.y}`,
            `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 0 1 ${outerMiddle.x} ${outerMiddle.y}`,
            `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 0 1 ${outerStart.x} ${outerStart.y}`,
            `L ${innerStart.x} ${innerStart.y}`,
            `A ${INNER_RADIUS} ${INNER_RADIUS} 0 0 0 ${innerMiddle.x} ${innerMiddle.y}`,
            `A ${INNER_RADIUS} ${INNER_RADIUS} 0 0 0 ${innerStart.x} ${innerStart.y}`,
            'Z',
        ].join(' ');
    }

    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return [
        `M ${outerStart.x} ${outerStart.y}`,
        `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
        `L ${innerEnd.x} ${innerEnd.y}`,
        `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
        'Z',
    ].join(' ');
}

export function donutSlices(items) {
    const positive = items.filter(({ valueCents }) => valueCents > 0);
    const total = positive.reduce((sum, { valueCents }) => sum + valueCents, 0);
    let angle = 0;

    return positive.map((item, index) => {
        const fraction = item.valueCents / total;
        const startAngle = angle;
        const endAngle = index === positive.length - 1
            ? 360
            : startAngle + fraction * 360;
        angle = endAngle;

        return {
            ...item,
            fraction,
            startAngle,
            endAngle,
            path: annulusPath(startAngle, endAngle),
            colour: chartColour(index),
        };
    });
}

function svgElement(tagName) {
    return document.createElementNS(SVG_NS, tagName);
}

export function renderDonut(items, options = {}) {
    const { centreLabel = '', centreValue = '', onSelect } = options;
    const svg = svgElement('svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.classList.add('donut');

    if (typeof onSelect !== 'function') {
        svg.setAttribute('aria-hidden', 'true');
    }

    for (const slice of donutSlices(items)) {
        const path = svgElement('path');
        path.setAttribute('d', slice.path);
        path.setAttribute('fill', slice.colour);
        path.setAttribute('stroke', '#ffffff');
        path.setAttribute('stroke-width', '1');

        if (typeof onSelect === 'function') {
            path.setAttribute('role', 'button');
            path.setAttribute('tabindex', '0');
            path.setAttribute('aria-label', `${slice.label}: ${formatEuro(slice.valueCents)}`);
            const select = () => onSelect(slice);
            path.addEventListener('click', select);
            path.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    select();
                }
            });
        }

        svg.append(path);
    }

    const value = svgElement('text');
    value.setAttribute('x', '50');
    value.setAttribute('y', '48');
    value.setAttribute('text-anchor', 'middle');
    value.classList.add('donut-value');
    value.textContent = centreValue;

    const label = svgElement('text');
    label.setAttribute('x', '50');
    label.setAttribute('y', '59');
    label.setAttribute('text-anchor', 'middle');
    label.classList.add('donut-label');
    label.textContent = centreLabel;

    svg.append(value, label);
    return svg;
}
