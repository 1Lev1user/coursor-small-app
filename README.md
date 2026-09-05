# My Expenses

Local-only EUR expense and income tracker that runs in the browser as a PWA. All data stays on your device — no account, no server sync. Each browser/device has its own copy.

**Live app:** https://1lev1user.github.io/coursor-small-app/

## Run locally

```bash
python -m http.server 8080
# or: npm run serve
```

Open http://localhost:8080/

## First-run setup

On first launch you set:

1. **Monthly spend budget** (EUR)
2. **Savings %** — share of usual income pinned to Savings
3. **Usual monthly income** (EUR)

You can change these later under **Settings**.

## Backup, import, and CSV

Under **Settings → Backup & export**:

- **Export backup (JSON)** — full restore file for this or another device
- **Import backup** — replaces local data after confirmation
- **Month CSV** — Europe (`;` + comma decimals) or Standard (`,` + dot decimals)

Export a JSON backup regularly; Safari and some browsers can clear site data.

## Install on phone

Use **Add to Home Screen** (Safari / Chrome share menu). Installed mode keeps storage more reliably than a transient Safari tab, and gives a standalone app icon.

## Tests

```bash
npm test
# or: node --test
```
