import { element } from './shared.js';

export function renderRightsSection() {
    const section = element('section', 'card stack');
    section.id = 'more-rights';
    section.append(element('h2', 'section-title', 'Rights & privacy'));

    section.append(
        element('h3', 'category-name', 'All rights reserved'),
        element(
            'p',
            '',
            '© Ļevs Krilovs. All rights reserved. '
                + 'My Expenses is his work: the app, its design, its code and related materials '
                + 'such as the user guide. Only he may share, copy, distribute or republish it.',
        ),
        element(
            'p',
            '',
            'Personal use is allowed only if he gave you access. '
                + 'Sharing the app, its link, screenshots for redistribution, or the guide '
                + 'without his permission is not allowed.',
        ),
        element(
            'p',
            'muted',
            'The fonts Onest and Unbounded are not his work. They are used under the '
                + 'SIL Open Font License 1.1.',
        ),
        element('h3', 'category-name', 'Your data'),
        element(
            'p',
            '',
            'This app does not create an account and does not sync to a cloud. '
                + 'Your expenses, income, and settings stay only on this device '
                + '(in this browser / Home Screen app).',
        ),
        element(
            'p',
            'muted',
            'If you delete the app, clear site data, or lose the device without a backup, '
                + 'your data is gone. Export a JSON backup from Backup & export if you want a copy.',
        ),
        element(
            'p',
            'muted rights-footer-line',
            '© Ļevs Krilovs · All rights reserved · Share only with his permission',
        ),
    );

    return section;
}
