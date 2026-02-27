# CopilotX

## Project Overview

Client-side expense visualization dashboard. Users upload a CSV of their transactions and get interactive dashboards — no backend, no data leaves the browser.

Live at https://copilotplus.vercel.app
Repo: https://github.com/mohitagrawal/copilotplus

## Architecture

Single-page app with zero build step. All vanilla HTML/CSS/JS.

```
index.html   — SPA shell: upload view + dashboard view with 3 tabs (overview, sankey, trends)
style.css    — All styles. Warm light theme (cream/off-white, orange accent, Playfair Display + DM Sans)
app.js       — All logic: CSV parsing, data processing, view routing, chart rendering
vercel.json  — SPA rewrite rules for Vercel
```

## Key Design Decisions

- **No framework** — intentionally vanilla for simplicity, zero build, instant deploy
- **Single HTML file with tabs** — avoids state-passing between pages; parsed data lives in JS globals
- **PapaParse for CSV** — robust CSV parsing with header detection
- **Data flows**: CSV text → `parseCSV()` → `{yearData, yearTxns}` → `initFromParsed()` sets globals → `launchDashboard()` renders
- **Global state**: `DATA` (aggregated by year), `TXN_DATA` (raw transactions by year/cat/subcat), `CAT_ORDER`, `COLORS`, `YEARS`, `currentYear`
- **Chart instances** are stored in module-level vars and `.destroy()`ed before re-creation to prevent memory leaks

## CSV Format

Designed for Copilot Money exports. Minimum columns: `date`, `amount`. Full columns:
`date, name, amount, status, category, parent category, excluded, tags, type, account, account mask, note, recurring`

- Rows with `excluded=true` are filtered out (income, internal transfers)
- Only positive amounts are treated as expenses
- `parent category` drives the Sankey first level, `category` drives the second level

## Conventions

- No build tools, no npm dependencies, no bundler
- CDN-only for libraries (D3, Chart.js, PapaParse, Google Fonts)
- All CSS in `style.css`, all JS in `app.js`, structure in `index.html`
- Use `fmt()` for dollar formatting, `fmtK()` for compact ($1.2k), `escHtml()` for XSS safety
- Chart.js tooltip config reused via `chartTooltip` constant
- Color palette assigned dynamically based on category frequency across all years

## Deployment

Vercel static site. Auto-deploys on push to `main`. The `vercel.json` rewrites all routes to `index.html`.
