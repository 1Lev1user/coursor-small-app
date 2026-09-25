# My Expenses

Local-only EUR expense and income tracker (PWA). Data stays on your device — no account, no cloud sync.

**Live app:** https://1lev1user.github.io/coursor-small-app/

## First-run setup

1. **Your name** — used on Home  
2. **Monthly spend budget** (EUR)  
3. **Savings** — € or % of that budget  
4. **Usual monthly income** (EUR)

Change these later under **Settings → Plan**.

## Backup, import, and CSV

Under **Settings → Backup & export**:

- **Export backup (JSON)** — full restore file for this or another device  
- **Import backup** — replaces local data after confirmation  
- **Month CSV** — Europe or Standard format  

Export a JSON backup regularly; browsers can clear site data.

## Install on phone

Open the link in Safari (iPhone) or Chrome (Android), then **Add to Home Screen** / **Install app**.

## Development

- `npm test` runs all tests (Node 22, no packages to install). GitHub runs them on every push and pull request.
- Releasing: raise `version` in `package.json` and `VERSION` in `sw.js` together. A test fails if they differ or if a file in `src/` or `fonts/` is missing from the offline cache list in `sw.js`.
- Colours, fonts, radii and motion are design tokens at the top of `style.css`, with a dark theme below them.

## Rights

© Ļevs Krilovs. All rights reserved. The code is public to read, but sharing, copying, distributing or republishing it needs his permission.

The fonts in `fonts/` (Onest and Unbounded) are under the SIL Open Font License 1.1; see `fonts/LICENSE-*.txt`.
