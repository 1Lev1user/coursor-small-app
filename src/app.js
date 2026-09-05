import { load, save as saveToStorage, requestPersistence } from './storage.js';
import { currentMonthKey } from './months.js';
import { render as renderAdd } from './views/add.js';
import { render as renderMonth } from './views/month.js';
import { render as renderChart } from './views/chartView.js';
import { render as renderMore } from './views/more.js';
import { render as renderSetup } from './views/setup.js';

const TOAST_MS = 2000;

const views = {
    add: { title: 'Add expense', render: renderAdd },
    month: { title: 'Month', render: renderMonth },
    chart: { title: 'Chart', render: renderChart },
    more: { title: 'More', render: renderMore },
};

const app = {
    data: load(),
    tab: 'add',
    monthKey: currentMonthKey(),
};

const titleElement = document.getElementById('screen-title');
const viewElement = document.getElementById('view');
const tabbarElement = document.getElementById('tabbar');
const tabButtons = [...tabbarElement.querySelectorAll('[data-tab]')];

let toastTimer = null;

function toast(message) {
    let node = document.getElementById('toast');

    if (node === null) {
        node = document.createElement('div');
        node.id = 'toast';
        node.className = 'toast';
        node.setAttribute('role', 'status');
        node.setAttribute('aria-live', 'polite');
        document.body.append(node);
    }

    node.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.remove(), TOAST_MS);
}

function save() {
    const saved = saveToStorage(app.data);
    if (!saved) {
        toast('Could not save to this device');
    }
    render();
    return saved;
}

function setMonthKey(key) {
    app.monthKey = key;
    render();
}

function goTo(tab) {
    if (!app.data.settings.setupComplete) {
        return;
    }
    if (!Object.hasOwn(views, tab)) {
        return;
    }

    app.tab = tab;
    render();
}

function context() {
    return {
        data: app.data,
        save,
        render,
        monthKey: app.monthKey,
        setMonthKey,
        goTo,
        toast,
    };
}

function render() {
    const setupComplete = app.data.settings.setupComplete === true;
    document.body.classList.toggle('is-setup', !setupComplete);
    tabbarElement.hidden = !setupComplete;

    for (const button of tabButtons) {
        button.disabled = !setupComplete;
    }

    viewElement.replaceChildren();

    if (!setupComplete) {
        titleElement.textContent = 'Setup';
        document.title = 'Setup - My Expenses';
        renderSetup(viewElement, context());
        return;
    }

    const view = views[app.tab];

    titleElement.textContent = view.title;
    document.title = `${view.title} - My Expenses`;

    for (const button of tabButtons) {
        const isActive = button.dataset.tab === app.tab;
        button.classList.toggle('is-active', isActive);
        if (isActive) {
            button.setAttribute('aria-current', 'page');
        } else {
            button.removeAttribute('aria-current');
        }
    }

    view.render(viewElement, context());
}

tabbarElement.addEventListener('click', (event) => {
    const button = event.target.closest('[data-tab]');
    if (button !== null && !button.disabled) {
        goTo(button.dataset.tab);
    }
});

requestPersistence();
render();
