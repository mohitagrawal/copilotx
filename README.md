# CopilotX — Visualize Your Spending

Upload your transaction CSV and instantly get interactive dashboards, Sankey diagrams, and year-over-year trend analysis. 100% client-side — your data never leaves your browser.

**Live at [copilotx.vercel.app](https://copilotx.vercel.app)**

## Features

- **CSV Upload** — Drag and drop or browse. Parsed entirely in the browser using PapaParse.
- **Overview Dashboard** — Summary cards, monthly spending bar chart, category donut chart, and subcategory breakdowns. Switch between years.
- **Interactive Sankey Diagram** — Full-page money flow visualization (Total Spend → Categories → Subcategories). Hover to highlight flows, click any node or link to see individual transactions in a modal.
- **Year-over-Year Trends** — Annual spend comparison, per-category sparkline trends, YoY change table with percentage badges, and monthly overlay chart comparing recent years.
- **Privacy First** — Zero backend. No data is uploaded, stored, or transmitted anywhere. Everything runs in your browser.

## Supported CSV Format

Works out of the box with [Copilot Money](https://copilot.money) exports. Expected columns:

```
date, name, amount, status, category, parent category, excluded, tags, type, account, account mask, note, recurring
```

Minimum required columns are `date` and `amount`. The app will work with partial data but category breakdowns and Sankey require `category` and `parent category`.

## Tech Stack

- Vanilla HTML/CSS/JS — no build step, no framework
- [D3.js](https://d3js.org/) + [d3-sankey](https://github.com/d3/d3-sankey) for the Sankey diagram
- [Chart.js](https://www.chartjs.org/) for bar, donut, and line charts
- [PapaParse](https://www.papaparse.com/) for CSV parsing
- Deployed on [Vercel](https://vercel.com) as a static site

## Development

```bash
# Just open in a browser — no build step needed
open index.html

# Or use any static server
npx serve .
```

## Deploy

Push to `main` and Vercel auto-deploys. Or deploy manually:

```bash
npx vercel --prod
```

## License

MIT
