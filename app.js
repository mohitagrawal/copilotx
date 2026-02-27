// ═══════════════════════════════════════
//  Copilot+ — Advanced insights for Copilot Money
// ═══════════════════════════════════════

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const PALETTE = [
  '#b08d57','#7ab08d','#8b7ec8','#5e9cc7','#c7855e',
  '#6b8fa3','#c75e8a','#8ec75e','#a39e93','#c7b95e',
  '#5ec7c1','#c75e5e','#5e7ec7','#c7a85e','#8b57b0',
];

const YEAR_COLORS = {
  '2019':'#d4c5a9','2020':'#c7b09a','2021':'#a3c4a9','2022':'#8bb0c7',
  '2023':'#a48bc7','2024':'#c7a08b','2025':'#e07a3a','2026':'#d15656',
};

// ── Global state ──
let DATA = {};          // { year: { total, txns, monthly, categories, subcategories } }
let TXN_DATA = {};      // { year: { parentCat: { subCat: [{d,n,a}] } } }
let CAT_ORDER = [];     // sorted parent categories
let COLORS = {};        // cat -> color
let YEARS = [];
let currentYear = '';
let currentSankeyMonth = 'all'; // 'all' or '01'..'12'

// Chart instances
let ovMonthlyChart, ovDonutChart;
let trAnnualChart, trMonthlyOverlay;
let trCatCharts = [];

// ═══════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════
function fmt(v) { return '$' + Math.round(v).toLocaleString('en-US'); }
function fmtK(v) { return v >= 1000 ? '$' + (v/1000).toFixed(1) + 'k' : '$' + Math.round(v); }

const chartTooltip = {
  backgroundColor: '#fff', titleColor: '#1a1714', bodyColor: '#1a1714',
  borderColor: 'rgba(0,0,0,0.08)', borderWidth: 1, cornerRadius: 10, padding: 12,
  displayColors: false,
  titleFont: { family: 'DM Sans', weight: 600 },
  bodyFont: { family: 'DM Sans' },
};

// ═══════════════════════════════════════
//  CSV PARSING
// ═══════════════════════════════════════
function parseCSV(text) {
  const result = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (result.errors.length > 3) throw new Error('Too many CSV parse errors. Check your file format.');

  const rows = result.data;
  if (!rows.length) throw new Error('No data rows found in CSV.');

  // Validate columns
  const cols = Object.keys(rows[0]).map(c => c.trim().toLowerCase());
  const required = ['date', 'amount'];
  for (const r of required) {
    if (!cols.some(c => c.includes(r))) throw new Error(`Missing required column: "${r}"`);
  }

  // Normalize column names
  const colMap = {};
  Object.keys(rows[0]).forEach(k => {
    const lk = k.trim().toLowerCase();
    if (lk === 'date') colMap.date = k;
    else if (lk === 'name') colMap.name = k;
    else if (lk === 'amount') colMap.amount = k;
    else if (lk === 'category') colMap.category = k;
    else if (lk === 'parent category') colMap.parentCategory = k;
    else if (lk === 'excluded') colMap.excluded = k;
    else if (lk === 'type') colMap.type = k;
  });

  // Process rows
  const yearData = {};
  const yearTxns = {};

  for (const row of rows) {
    const date = (row[colMap.date] || '').trim();
    if (!date || !/^\d{4}/.test(date)) continue;

    const amount = parseFloat(row[colMap.amount]);
    if (isNaN(amount) || amount <= 0) continue;

    const excluded = (row[colMap.excluded] || '').trim().toLowerCase();
    if (excluded === 'true') continue;

    const year = date.slice(0, 4);
    const month = date.slice(5, 7);
    const name = (row[colMap.name] || 'Unknown').trim();
    const parentCat = (row[colMap.parentCategory] || '').trim() || 'Uncategorized';
    const subCat = (row[colMap.category] || '').trim() || 'Other';

    // Init year
    if (!yearData[year]) {
      yearData[year] = { total: 0, txns: 0, monthly: {}, categories: {}, subcategories: {} };
      yearTxns[year] = {};
    }

    const yd = yearData[year];
    yd.total += amount;
    yd.txns++;
    yd.monthly[month] = (yd.monthly[month] || 0) + amount;
    yd.categories[parentCat] = (yd.categories[parentCat] || 0) + amount;

    if (!yd.subcategories[parentCat]) yd.subcategories[parentCat] = {};
    yd.subcategories[parentCat][subCat] = (yd.subcategories[parentCat][subCat] || 0) + amount;

    // Transaction-level
    if (!yearTxns[year][parentCat]) yearTxns[year][parentCat] = {};
    if (!yearTxns[year][parentCat][subCat]) yearTxns[year][parentCat][subCat] = [];
    yearTxns[year][parentCat][subCat].push({ d: date, n: name, a: Math.round(amount * 100) / 100 });
  }

  // Round and sort
  for (const y of Object.keys(yearData)) {
    yearData[y].total = Math.round(yearData[y].total * 100) / 100;
    for (const m of Object.keys(yearData[y].monthly)) {
      yearData[y].monthly[m] = Math.round(yearData[y].monthly[m] * 100) / 100;
    }
    for (const c of Object.keys(yearData[y].categories)) {
      yearData[y].categories[c] = Math.round(yearData[y].categories[c] * 100) / 100;
    }
    for (const c of Object.keys(yearData[y].subcategories)) {
      for (const s of Object.keys(yearData[y].subcategories[c])) {
        yearData[y].subcategories[c][s] = Math.round(yearData[y].subcategories[c][s] * 100) / 100;
      }
    }
  }

  // Sort transactions by date desc
  for (const y of Object.keys(yearTxns)) {
    for (const pc of Object.keys(yearTxns[y])) {
      for (const sc of Object.keys(yearTxns[y][pc])) {
        yearTxns[y][pc][sc].sort((a, b) => b.d.localeCompare(a.d));
      }
    }
  }

  return { yearData, yearTxns };
}

function initFromParsed(yearData, yearTxns) {
  DATA = yearData;
  TXN_DATA = yearTxns;
  YEARS = Object.keys(DATA).sort();

  // Determine category order from all years combined
  const catTotals = {};
  for (const y of YEARS) {
    for (const [c, v] of Object.entries(DATA[y].categories)) {
      catTotals[c] = (catTotals[c] || 0) + v;
    }
  }
  CAT_ORDER = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).map(e => e[0]);

  // Assign colors
  COLORS = {};
  CAT_ORDER.forEach((c, i) => { COLORS[c] = PALETTE[i % PALETTE.length]; });

  // Default to most recent full year (skip current partial year)
  currentYear = YEARS[YEARS.length - 1];
  // If the latest year has < 6 months of data and there's a prior year, default to prior
  if (YEARS.length > 1) {
    const latestMonths = Object.keys(DATA[currentYear].monthly).length;
    if (latestMonths < 4) currentYear = YEARS[YEARS.length - 2];
  }
}

// ═══════════════════════════════════════
//  VIEW / TAB SWITCHING
// ═══════════════════════════════════════
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelectorAll('.nav-links a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));

  if (tab === 'overview') renderOverview();
  if (tab === 'sankey') renderSankey();
  if (tab === 'trends') renderTrends();
}

// Tab navigation
document.querySelectorAll('.nav-links a').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    switchTab(a.dataset.tab);
  });
});

// New upload
document.getElementById('newUploadBtn').addEventListener('click', () => {
  showView('uploadView');
});

// ═══════════════════════════════════════
//  YEAR SELECTORS
// ═══════════════════════════════════════
function buildYearSelector(containerId, onChange) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  YEARS.forEach(y => {
    const btn = document.createElement('button');
    btn.textContent = y;
    btn.dataset.year = y;
    if (y === currentYear) btn.classList.add('active');
    btn.onclick = () => {
      currentYear = y;
      document.querySelectorAll('.year-selector button').forEach(b => b.classList.toggle('active', b.dataset.year === y));
      document.querySelectorAll('.year-accent').forEach(el => el.textContent = "'" + y.slice(2));
      onChange();
    };
    el.appendChild(btn);
  });
}

// ═══════════════════════════════════════
//  MODAL
// ═══════════════════════════════════════
const overlay = document.getElementById('modalOverlay');
document.getElementById('modalClose').addEventListener('click', () => overlay.classList.remove('open'));
overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') overlay.classList.remove('open'); });

function openModal(title, parentCat, subCat, opts) {
  const year = (opts && opts.year) || currentYear;
  const month = (opts && opts.month) || null;
  const yearTxns = TXN_DATA[year] || {};
  let txns = [];

  if (!parentCat && !subCat) {
    Object.values(yearTxns).forEach(cats => Object.values(cats).forEach(arr => txns.push(...arr)));
  } else if (subCat && parentCat) {
    txns = (yearTxns[parentCat] && yearTxns[parentCat][subCat]) || [];
  } else if (parentCat) {
    const catTxns = yearTxns[parentCat] || {};
    Object.values(catTxns).forEach(arr => txns.push(...arr));
  }

  // Filter by month if specified
  if (month && month !== 'all') {
    txns = txns.filter(t => t.d.slice(5, 7) === month);
  }

  txns.sort((a, b) => b.d.localeCompare(a.d));
  const total = txns.reduce((s, t) => s + t.a, 0);

  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalTotal').textContent = `${fmt(total)} · ${txns.length} transactions`;

  const max = 300;
  let html = `<table class="txn-table"><thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Amount</th></tr></thead><tbody>`;
  txns.slice(0, max).forEach(t => {
    html += `<tr><td class="txn-date">${t.d}</td><td>${escHtml(t.n)}</td><td class="txn-amount">${fmt(t.a)}</td></tr>`;
  });
  if (txns.length > max) html += `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:0.8rem">Showing ${max} of ${txns.length}</td></tr>`;
  html += '</tbody></table>';
  if (!txns.length) html = '<div style="padding:2rem;text-align:center;color:var(--text-muted)">No transactions found</div>';

  document.getElementById('modalBody').innerHTML = html;
  overlay.classList.add('open');
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ═══════════════════════════════════════
//  TOOLTIP
// ═══════════════════════════════════════
const tooltip = document.getElementById('tooltip');
function showTooltip(e, label, value, detail) {
  document.getElementById('ttLabel').textContent = label;
  document.getElementById('ttValue').textContent = value;
  document.getElementById('ttDetail').textContent = detail || '';
  tooltip.classList.add('visible');
  positionTooltip(e);
}
function positionTooltip(e) {
  tooltip.style.left = Math.min(e.clientX + 16, window.innerWidth - 300) + 'px';
  tooltip.style.top = Math.min(e.clientY - 10, window.innerHeight - 100) + 'px';
}
function hideTooltip() { tooltip.classList.remove('visible'); }

// ═══════════════════════════════════════
//  OVERVIEW TAB
// ═══════════════════════════════════════
function renderOverview() {
  const d = DATA[currentYear];
  if (!d) return;
  const prevYear = String(+currentYear - 1);
  const prev = DATA[prevYear];

  document.getElementById('ovTitleYear').textContent = "'" + currentYear.slice(2);

  // Summary
  const months = Object.keys(d.monthly).sort();
  const monthVals = months.map(m => d.monthly[m]);
  const maxMonth = Math.max(...monthVals);
  const minMonth = Math.min(...monthVals);
  const maxMonthName = MONTH_NAMES[+months[monthVals.indexOf(maxMonth)] - 1] || '?';
  const minMonthName = MONTH_NAMES[+months[monthVals.indexOf(minMonth)] - 1] || '?';
  const avg = d.total / months.length;

  let changeHtml = '';
  if (prev) {
    const pct = ((d.total - prev.total) / prev.total * 100);
    changeHtml = `<div class="change ${pct >= 0 ? 'up' : 'down'}">${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct).toFixed(1)}% vs ${prevYear}</div>`;
  }

  document.getElementById('ovSummaryGrid').innerHTML = `
    <div class="summary-card"><div class="label">Total Spent</div><div class="value">${fmt(d.total)}</div><div class="detail"><em>${d.txns.toLocaleString()}</em> transactions</div>${changeHtml}</div>
    <div class="summary-card"><div class="label">Monthly Average</div><div class="value">${fmt(avg)}</div><div class="detail">across <em>${months.length}</em> months</div></div>
    <div class="summary-card"><div class="label">Highest Month</div><div class="value">${fmt(maxMonth)}</div><div class="detail"><em>${maxMonthName}</em> ${currentYear}</div></div>
    <div class="summary-card"><div class="label">Lowest Month</div><div class="value">${fmt(minMonth)}</div><div class="detail"><em>${minMonthName}</em> ${currentYear}</div></div>`;

  // Monthly chart
  const monthData = MONTH_NAMES.map((_, i) => d.monthly[String(i + 1).padStart(2, '0')] || 0);
  if (ovMonthlyChart) ovMonthlyChart.destroy();
  ovMonthlyChart = new Chart(document.getElementById('ovMonthlyChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: MONTH_NAMES,
      datasets: [{ data: monthData, backgroundColor: monthData.map(v => v > avg ? 'rgba(224,122,58,0.75)' : v > 0 ? 'rgba(224,122,58,0.3)' : 'transparent'), borderColor: monthData.map(v => v > 0 ? 'rgba(224,122,58,0.9)' : 'transparent'), borderWidth: 1, borderRadius: 6, borderSkipped: false }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { ...chartTooltip, callbacks: { label: ctx => fmt(ctx.parsed.y) } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#9c9488', font: { family: 'DM Sans', size: 12, weight: 500 } }, border: { display: false } },
        y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#9c9488', font: { family: 'DM Sans', size: 11 }, callback: v => fmtK(v) }, border: { display: false } }
      }
    }
  });

  // Categories
  const cats = CAT_ORDER.filter(c => (d.categories[c] || 0) > 0).map(c => ({ name: c, amount: d.categories[c], color: COLORS[c] }));

  // Donut
  if (ovDonutChart) ovDonutChart.destroy();
  ovDonutChart = new Chart(document.getElementById('ovDonutChart').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: cats.map(c => c.name),
      datasets: [{ data: cats.map(c => c.amount), backgroundColor: cats.map(c => c.color), borderColor: '#fff', borderWidth: 2 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: { legend: { display: false }, tooltip: { ...chartTooltip, callbacks: { label: ctx => ` ${fmt(ctx.parsed)} (${((ctx.parsed / d.total) * 100).toFixed(1)}%)` } } }
    }
  });

  // Cat list
  const catList = document.getElementById('ovCatList');
  catList.innerHTML = cats.map(c => {
    const pct = ((c.amount / d.total) * 100).toFixed(1);
    return `<li><span class="cat-name"><span class="dot" style="background:${c.color}"></span>${escHtml(c.name)}</span><span><span class="cat-amount">${fmt(c.amount)}</span><span class="cat-pct">${pct}%</span></span></li>`;
  }).join('');

  // Subcategories
  const subcatEl = document.getElementById('ovSubcatSection');
  const allSubVals = [];
  cats.forEach(cat => { const subs = d.subcategories[cat.name]; if (subs) Object.values(subs).forEach(v => allSubVals.push(v)); });
  const maxSub = Math.max(...allSubVals, 1);

  subcatEl.innerHTML = cats.map(cat => {
    const subs = d.subcategories[cat.name];
    if (!subs) return '';
    const rows = Object.entries(subs).sort((a, b) => b[1] - a[1]).map(([name, amount]) => {
      const pct = (amount / maxSub) * 100;
      return `<div class="subcat-bar-row"><span class="subcat-bar-label">${escHtml(name)}</span><div class="subcat-bar-track"><div class="subcat-bar-fill" style="width:${pct}%;background:${cat.color};opacity:0.65"></div></div><span class="subcat-bar-val">${fmtK(amount)}</span></div>`;
    }).join('');
    return `<div class="subcat-group"><div class="subcat-group-title"><span>${escHtml(cat.name)}</span><span>${fmt(cat.amount)}</span></div>${rows}</div>`;
  }).join('');
}

// ═══════════════════════════════════════
//  SANKEY TAB
// ═══════════════════════════════════════

// Build month-filtered aggregation from TXN_DATA
function getSankeyData(year, month) {
  if (month === 'all') return DATA[year];
  const yearTxns = TXN_DATA[year] || {};
  const result = { total: 0, txns: 0, categories: {}, subcategories: {} };
  const mm = month; // '01'..'12'
  for (const [parentCat, subs] of Object.entries(yearTxns)) {
    for (const [subCat, txns] of Object.entries(subs)) {
      const filtered = txns.filter(t => t.d.slice(5, 7) === mm);
      if (filtered.length === 0) continue;
      const sum = filtered.reduce((s, t) => s + t.a, 0);
      result.total += sum;
      result.txns += filtered.length;
      result.categories[parentCat] = (result.categories[parentCat] || 0) + sum;
      if (!result.subcategories[parentCat]) result.subcategories[parentCat] = {};
      result.subcategories[parentCat][subCat] = (result.subcategories[parentCat][subCat] || 0) + sum;
    }
  }
  // Round
  result.total = Math.round(result.total * 100) / 100;
  for (const c of Object.keys(result.categories)) result.categories[c] = Math.round(result.categories[c] * 100) / 100;
  for (const c of Object.keys(result.subcategories)) {
    for (const s of Object.keys(result.subcategories[c])) result.subcategories[c][s] = Math.round(result.subcategories[c][s] * 100) / 100;
  }
  return result;
}

function buildMonthSelector() {
  const el = document.getElementById('skMonthSelector');
  el.innerHTML = '';
  // "Full Year" button
  const allBtn = document.createElement('button');
  allBtn.textContent = 'Full Year';
  allBtn.dataset.month = 'all';
  if (currentSankeyMonth === 'all') allBtn.classList.add('active');
  allBtn.onclick = () => { currentSankeyMonth = 'all'; updateMonthSelector(); renderSankey(); };
  el.appendChild(allBtn);
  // Individual month buttons — only show months that have data
  const yd = DATA[currentYear];
  MONTH_NAMES.forEach((name, i) => {
    const mm = String(i + 1).padStart(2, '0');
    if (!yd || !yd.monthly[mm]) return;
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.dataset.month = mm;
    if (currentSankeyMonth === mm) btn.classList.add('active');
    btn.onclick = () => { currentSankeyMonth = mm; updateMonthSelector(); renderSankey(); };
    el.appendChild(btn);
  });
}

function updateMonthSelector() {
  document.querySelectorAll('#skMonthSelector button').forEach(b => {
    b.classList.toggle('active', b.dataset.month === currentSankeyMonth);
  });
}

function renderSankey() {
  const d = getSankeyData(currentYear, currentSankeyMonth);
  if (!d || d.total === 0) {
    document.getElementById('skSankeyWrap').innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text-muted)">No data for this period</div>';
    return;
  }

  const monthLabel = currentSankeyMonth === 'all' ? '' : ' ' + MONTH_NAMES[parseInt(currentSankeyMonth) - 1];
  document.getElementById('skTitleYear').textContent = "'" + currentYear.slice(2) + monthLabel;

  // Legend
  const legend = document.getElementById('skLegend');
  legend.innerHTML = CAT_ORDER.filter(c => (d.categories[c] || 0) > 0).map(cat =>
    `<div class="legend-item" onclick="openModal('${cat.replace(/'/g,"\\'")}','${cat.replace(/'/g,"\\'")}',null,{month:currentSankeyMonth})"><span class="legend-dot" style="background:${COLORS[cat]}"></span>${escHtml(cat)}</div>`
  ).join('');

  // Build sankey
  const wrap = document.getElementById('skSankeyWrap');
  wrap.innerHTML = '';

  const width = Math.max(wrap.clientWidth, 800);
  const cats = CAT_ORDER.filter(c => (d.categories[c] || 0) > 0);
  const subCount = cats.reduce((s, c) => s + Object.keys(d.subcategories[c] || {}).length, 0);
  const height = Math.max(600, subCount * 26 + 80);

  const nodeNames = ['Total Spend'];
  const nodeMap = { 'Total Spend': 0 };
  const nodeMeta = [{ type: 'root' }];
  let idx = 1;

  cats.forEach(c => { nodeMap[c] = idx; nodeNames.push(c); nodeMeta.push({ type: 'parent', cat: c }); idx++; });
  cats.forEach(cat => {
    const subs = d.subcategories[cat];
    if (!subs) return;
    Object.keys(subs).sort((a, b) => subs[b] - subs[a]).forEach(sub => {
      const key = 'sub__' + cat + '__' + sub;
      nodeMap[key] = idx; nodeNames.push(sub); nodeMeta.push({ type: 'sub', cat, sub }); idx++;
    });
  });

  const nodes = nodeNames.map((name, i) => ({ name, index: i }));
  const links = [];
  cats.forEach(c => links.push({ source: 0, target: nodeMap[c], value: d.categories[c] }));
  cats.forEach(cat => {
    const subs = d.subcategories[cat];
    if (!subs) return;
    Object.entries(subs).sort((a, b) => b[1] - a[1]).forEach(([sub, val]) => links.push({ source: nodeMap[cat], target: nodeMap['sub__' + cat + '__' + sub], value: val }));
  });

  const svg = d3.select(wrap).append('svg')
    .attr('width', width).attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('max-width', '100%').style('height', 'auto');

  const sankey = d3.sankey()
    .nodeId(d => d.index).nodeWidth(16).nodePadding(7)
    .nodeAlign(d3.sankeyLeft)
    .nodeSort(null)
    .linkSort(null)
    .extent([[50, 16], [width - 180, height - 16]]);

  const graph = sankey({ nodes: nodes.map(d => ({ ...d })), links: links.map(d => ({ ...d })) });

  function getColor(d) {
    const m = nodeMeta[d.index];
    return m.type === 'root' ? '#e07a3a' : COLORS[m.cat] || '#9c9488';
  }
  function getLinkColor(d) {
    const m = nodeMeta[d.source.index];
    return m.type === 'parent' ? COLORS[m.cat] : COLORS[nodeMeta[d.target.index]?.cat] || '#9c9488';
  }

  const linkEls = svg.append('g').selectAll('path').data(graph.links).join('path')
    .attr('class', 'link').attr('d', d3.sankeyLinkHorizontal())
    .attr('stroke', d => getLinkColor(d)).attr('stroke-width', d => Math.max(1, d.width)).attr('stroke-opacity', 0.2);

  const nodeEls = svg.append('g').selectAll('g').data(graph.nodes).join('g').attr('class', 'node');

  nodeEls.append('rect')
    .attr('x', d => d.x0).attr('y', d => d.y0)
    .attr('height', d => Math.max(2, d.y1 - d.y0)).attr('width', d => d.x1 - d.x0)
    .attr('fill', d => getColor(d)).attr('opacity', 0.85).attr('rx', 4);

  nodeEls.append('text')
    .attr('x', d => d.x0 < width / 2 ? d.x1 + 10 : d.x0 - 10)
    .attr('y', d => (d.y1 + d.y0) / 2).attr('dy', '0.35em')
    .attr('text-anchor', d => d.x0 < width / 2 ? 'start' : 'end')
    .text(d => (d.value || 0) > 200 ? `${d.name}  ${fmtK(d.value)}` : d.name)
    .style('font-size', d => d.index === 0 ? '14px' : '11px')
    .style('font-weight', d => d.index === 0 ? '700' : '500');

  // Interactions
  function getRelatedNodes(ni) {
    const s = new Set([ni]);
    const m = nodeMeta[ni];
    graph.links.forEach(l => {
      if (l.source.index === ni) s.add(l.target.index);
      if (l.target.index === ni) s.add(l.source.index);
    });
    if (m.type === 'parent') { s.add(0); graph.links.forEach(l => { if (l.source.index === ni) s.add(l.target.index); }); }
    if (m.type === 'sub') { s.add(nodeMap[m.cat]); s.add(0); }
    return s;
  }

  nodeEls
    .on('mouseenter', function(e, d) {
      const rel = getRelatedNodes(d.index);
      nodeEls.classed('dimmed', n => !rel.has(n.index));
      linkEls.classed('dimmed', l => !rel.has(l.source.index) || !rel.has(l.target.index));
      linkEls.classed('highlighted', l => rel.has(l.source.index) && rel.has(l.target.index));
      const pct = ((d.value / getSankeyData(currentYear, currentSankeyMonth).total) * 100).toFixed(1);
      showTooltip(e, d.name, fmt(d.value), `${pct}% of total · Click to view transactions`);
    })
    .on('mousemove', (e) => positionTooltip(e))
    .on('mouseleave', () => { nodeEls.classed('dimmed', false); linkEls.classed('dimmed', false).classed('highlighted', false); hideTooltip(); })
    .on('click', (e, d) => {
      const m = nodeMeta[d.index];
      const mo = {month: currentSankeyMonth};
      if (m.type === 'parent') openModal(m.cat, m.cat, null, mo);
      else if (m.type === 'sub') openModal(`${m.cat} → ${m.sub}`, m.cat, m.sub, mo);
      else openModal('All Transactions', null, null, mo);
    });

  linkEls
    .on('mouseenter', function(e, d) {
      linkEls.classed('dimmed', l => l !== d);
      d3.select(this).classed('dimmed', false).classed('highlighted', true);
      showTooltip(e, `${d.source.name} → ${d.target.name}`, fmt(d.value), `${((d.value / getSankeyData(currentYear, currentSankeyMonth).total) * 100).toFixed(1)}% of total · Click to view`);
    })
    .on('mousemove', (e) => positionTooltip(e))
    .on('mouseleave', () => { linkEls.classed('dimmed', false).classed('highlighted', false); hideTooltip(); })
    .on('click', (e, d) => {
      const tm = nodeMeta[d.target.index];
      const mo = {month: currentSankeyMonth};
      if (tm.type === 'sub') openModal(`${tm.cat} → ${tm.sub}`, tm.cat, tm.sub, mo);
      else if (tm.type === 'parent') openModal(tm.cat, tm.cat, null, mo);
    });
}

// ── Category trend cards (yearly vs total) ──
function renderCatTrendCards(fullYears, latestYear, mode) {
  trCatCharts.forEach(c => c.destroy());
  trCatCharts = [];
  const grid = document.getElementById('trCatGrid');
  grid.innerHTML = '';

  CAT_ORDER.forEach(cat => {
    const vals = fullYears.map(y => DATA[y].categories[cat] || 0);
    if (Math.max(...vals) < 100) return;

    let displayVals, labels, headerHtml;

    if (mode === 'total') {
      // Cumulative running total
      let running = 0;
      displayVals = vals.map(v => { running += v; return running; });
      labels = fullYears;
      const total = displayVals[displayVals.length - 1];
      headerHtml = `<div class="tc-header"><div><div class="tc-cat"><span class="tc-dot" style="background:${COLORS[cat]}"></span>${escHtml(cat)}</div><div class="tc-amount">${fmt(total)} <span style="font-size:0.65rem;color:var(--text-muted)">all time</span></div></div></div>`;
    } else {
      displayVals = vals;
      labels = fullYears;
      const cur = vals[vals.length - 1];
      const prev = vals[vals.length - 2] || 0;
      const pct = prev > 0 ? ((cur - prev) / prev * 100) : 0;
      const dir = pct >= 0 ? 'up' : 'down';
      headerHtml = `<div class="tc-header"><div><div class="tc-cat"><span class="tc-dot" style="background:${COLORS[cat]}"></span>${escHtml(cat)}</div><div class="tc-amount">${fmt(cur)} <span style="font-size:0.65rem;color:var(--text-muted)">in ${latestYear}</span></div></div><span class="tc-change ${dir}">${dir === 'up' ? '↑' : '↓'} ${Math.abs(pct).toFixed(0)}%</span></div>`;
    }

    const card = document.createElement('div');
    card.className = 'trend-card';
    card.innerHTML = `${headerHtml}<div class="chart-wrap-sm"><canvas></canvas></div>`;
    grid.appendChild(card);

    const ch = new Chart(card.querySelector('canvas').getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{ data: displayVals, borderColor: COLORS[cat], backgroundColor: COLORS[cat] + '15', fill: true, tension: 0.35, pointRadius: 4, pointHoverRadius: 7, pointBackgroundColor: COLORS[cat], pointBorderColor: '#fff', pointBorderWidth: 2, borderWidth: 2.5 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { ...chartTooltip, callbacks: { label: ctx => fmt(ctx.parsed.y) } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#9c9488', font: { family: 'DM Sans', size: 11 } }, border: { display: false } },
          y: { grid: { color: 'rgba(0,0,0,0.03)' }, ticks: { color: '#9c9488', font: { family: 'DM Sans', size: 10 }, callback: v => fmtK(v) }, border: { display: false }, beginAtZero: mode !== 'total' }
        }
      }
    });
    trCatCharts.push(ch);
  });
}

// ═══════════════════════════════════════
//  TRENDS TAB
// ═══════════════════════════════════════
function renderTrends() {
  const fullYears = YEARS.filter(y => Object.keys(DATA[y].monthly).length >= 4);
  if (fullYears.length < 2) {
    document.getElementById('tab-trends').innerHTML = '<div class="page-header"><h1>Trends</h1></div><div class="panel" style="text-align:center;padding:3rem;color:var(--text-muted)">Need at least 2 years of data to show trends.</div>';
    return;
  }

  const latestYear = fullYears[fullYears.length - 1];
  const prevYear = fullYears[fullYears.length - 2];
  const recentYears = fullYears.slice(-4);

  // Insights
  const d = DATA[latestYear];
  const p = DATA[prevYear];
  const totalChange = ((d.total - p.total) / p.total * 100).toFixed(1);

  let biggestInc = { cat: '—', pct: -Infinity, cur: 0, prev: 0 };
  let biggestDec = { cat: '—', pct: Infinity, cur: 0, prev: 0 };
  CAT_ORDER.forEach(c => {
    const cur = d.categories[c] || 0;
    const prev = p.categories[c] || 0;
    if (prev > 500) {
      const pct = (cur - prev) / prev * 100;
      if (pct > biggestInc.pct) biggestInc = { cat: c, pct, cur, prev };
      if (pct < biggestDec.pct) biggestDec = { cat: c, pct, cur, prev };
    }
  });

  document.getElementById('trInsights').innerHTML = `
    <div class="insight-card"><div class="ic-label">${latestYear} vs ${prevYear}</div><div class="ic-value">${totalChange > 0 ? '+' : ''}${totalChange}%</div><div class="ic-detail">${fmt(d.total)} vs ${fmt(p.total)}</div></div>
    <div class="insight-card"><div class="ic-label">Biggest Increase</div><div class="ic-value" style="font-size:1.05rem">${escHtml(biggestInc.cat)}</div><div class="ic-detail">+${biggestInc.pct.toFixed(0)}% (${fmt(biggestInc.prev)} → ${fmt(biggestInc.cur)})</div></div>
    <div class="insight-card"><div class="ic-label">Biggest Decrease</div><div class="ic-value" style="font-size:1.05rem">${escHtml(biggestDec.cat)}</div><div class="ic-detail">${biggestDec.pct.toFixed(0)}% (${fmt(biggestDec.prev)} → ${fmt(biggestDec.cur)})</div></div>`;

  // Annual chart
  if (trAnnualChart) trAnnualChart.destroy();
  trAnnualChart = new Chart(document.getElementById('trAnnualChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: fullYears,
      datasets: [{ data: fullYears.map(y => DATA[y].total), backgroundColor: fullYears.map(y => y === latestYear ? 'rgba(224,122,58,0.75)' : 'rgba(224,122,58,0.25)'), borderColor: fullYears.map(y => y === latestYear ? '#e07a3a' : 'rgba(224,122,58,0.5)'), borderWidth: 1, borderRadius: 8, borderSkipped: false }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { ...chartTooltip, callbacks: {
        label: ctx => { const y = fullYears[ctx.dataIndex]; const prev = DATA[String(+y - 1)]; let c = ''; if (prev) { const p = ((ctx.parsed.y - prev.total) / prev.total * 100).toFixed(1); c = ` (${p > 0 ? '+' : ''}${p}% YoY)`; } return fmt(ctx.parsed.y) + c; }
      } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#9c9488', font: { family: 'DM Sans', size: 13, weight: 600 } }, border: { display: false } },
        y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#9c9488', font: { family: 'DM Sans', size: 11 }, callback: v => fmtK(v) }, border: { display: false }, beginAtZero: true }
      }
    }
  });

  // YoY table (clickable cells)
  const displayYears = fullYears.slice(-5);
  const table = document.getElementById('trYoyTable');
  let thtml = '<thead><tr><th>Category</th>';
  displayYears.forEach(y => thtml += `<th>${y}</th>`);
  thtml += `<th>${prevYear}→${latestYear}</th></tr></thead><tbody>`;

  thtml += `<tr style="font-weight:700"><td>Total</td>`;
  displayYears.forEach(y => thtml += `<td class="highlight yoy-cell" data-year="${y}" data-cat="">${fmt(DATA[y].total)}</td>`);
  const tc = ((d.total - p.total) / p.total * 100);
  thtml += `<td><span class="change-badge ${tc >= 0 ? 'up' : 'down'}">${tc >= 0 ? '+' : ''}${tc.toFixed(1)}%</span></td></tr>`;

  CAT_ORDER.forEach(cat => {
    const hasData = displayYears.some(y => (DATA[y].categories[cat] || 0) > 0);
    if (!hasData) return;
    const eCat = escHtml(cat);
    thtml += `<tr><td><span class="dot" style="background:${COLORS[cat]};display:inline-block;width:8px;height:8px;border-radius:3px;margin-right:6px"></span>${eCat}</td>`;
    displayYears.forEach(y => { const v = DATA[y].categories[cat] || 0; thtml += `<td class="yoy-cell" data-year="${y}" data-cat="${eCat}">${v > 0 ? fmtK(v) : '—'}</td>`; });
    const cur = DATA[latestYear].categories[cat] || 0;
    const prv = DATA[prevYear].categories[cat] || 0;
    if (prv > 100 && cur > 0) { const pc = (cur - prv) / prv * 100; thtml += `<td><span class="change-badge ${pc >= 0 ? 'up' : 'down'}">${pc >= 0 ? '+' : ''}${pc.toFixed(0)}%</span></td>`; }
    else thtml += '<td><span class="change-badge na">n/a</span></td>';
    thtml += '</tr>';
  });
  thtml += '</tbody>';
  table.innerHTML = thtml;

  // Make YoY cells clickable
  table.querySelectorAll('.yoy-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const y = cell.dataset.year;
      const cat = cell.dataset.cat;
      if (cat) {
        openModal(`${cat} in ${y}`, cat, null, { year: y });
      } else {
        openModal(`All Transactions in ${y}`, null, null, { year: y });
      }
    });
  });

  // Category sparklines (supports 'yearly' and 'total' modes)
  renderCatTrendCards(fullYears, latestYear, 'yearly');

  // Toggle handler
  document.querySelectorAll('#trendToggle .trend-toggle-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#trendToggle .trend-toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderCatTrendCards(fullYears, latestYear, btn.dataset.mode);
    };
  });

  // Monthly overlay
  if (trMonthlyOverlay) trMonthlyOverlay.destroy();
  trMonthlyOverlay = new Chart(document.getElementById('trMonthlyOverlay').getContext('2d'), {
    type: 'line',
    data: {
      labels: MONTH_NAMES,
      datasets: recentYears.map(y => ({
        label: y,
        data: MONTH_NAMES.map((_, i) => DATA[y].monthly[String(i + 1).padStart(2, '0')] || 0),
        borderColor: YEAR_COLORS[y] || '#999',
        backgroundColor: 'transparent',
        tension: 0.35,
        pointRadius: y === latestYear ? 5 : 3,
        pointHoverRadius: 7,
        pointBackgroundColor: YEAR_COLORS[y] || '#999',
        pointBorderColor: '#fff',
        pointBorderWidth: y === latestYear ? 2 : 1,
        borderWidth: y === latestYear ? 3 : 1.5,
        borderDash: y === latestYear ? [] : [4, 3],
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true, pointStyle: 'circle', padding: 20, color: '#5c5549', font: { family: 'DM Sans', size: 12, weight: 500 } } },
        tooltip: { ...chartTooltip, callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#9c9488', font: { family: 'DM Sans', size: 12, weight: 500 } }, border: { display: false } },
        y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#9c9488', font: { family: 'DM Sans', size: 11 }, callback: v => fmtK(v) }, border: { display: false } }
      }
    }
  });
}

// ═══════════════════════════════════════
//  LAUNCH DASHBOARD
// ═══════════════════════════════════════
function launchDashboard() {
  buildYearSelector('ovYearSelector', renderOverview);
  buildYearSelector('skYearSelector', () => { currentSankeyMonth = 'all'; buildMonthSelector(); renderSankey(); });
  buildMonthSelector();
  document.querySelectorAll('.year-accent').forEach(el => el.textContent = "'" + currentYear.slice(2));

  showView('dashView');
  switchTab('overview');
}

// ═══════════════════════════════════════
//  FILE UPLOAD
// ═══════════════════════════════════════
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const errorEl = document.getElementById('uploadError');

function handleFile(file) {
  errorEl.textContent = '';
  if (!file.name.endsWith('.csv')) {
    errorEl.textContent = 'Please upload a .csv file';
    return;
  }
  dropZone.classList.add('loading');

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const { yearData, yearTxns } = parseCSV(e.target.result);
      initFromParsed(yearData, yearTxns);
      launchDashboard();
    } catch (err) {
      errorEl.textContent = err.message;
    }
    dropZone.classList.remove('loading');
  };
  reader.onerror = () => {
    errorEl.textContent = 'Failed to read file';
    dropZone.classList.remove('loading');
  };
  reader.readAsText(file);
}

fileInput.addEventListener('change', (e) => { if (e.target.files[0]) handleFile(e.target.files[0]); });
dropZone.addEventListener('click', (e) => {
  // Don't double-trigger if clicking the label or input directly
  if (e.target.closest('label') || e.target === fileInput) return;
  fileInput.click();
});

dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});

// ═══════════════════════════════════════
//  DEMO DATA
// ═══════════════════════════════════════
document.getElementById('demoBtn').addEventListener('click', () => {
  errorEl.textContent = '';
  dropZone.classList.add('loading');

  // Generate realistic demo data
  const categories = [
    { parent: '🏡 Housing', subs: ['Rent', 'Utilities', 'Insurance'], range: [1200, 2200] },
    { parent: '🍽️ Food', subs: ['Groceries', 'Restaurants', 'Coffee'], range: [80, 350] },
    { parent: '🚗 Transport', subs: ['Gas', 'Parking', 'Rideshare'], range: [30, 200] },
    { parent: '🛒 Shopping', subs: ['Clothing', 'Electronics', 'Home'], range: [20, 300] },
    { parent: '💳 Subscriptions', subs: ['Streaming', 'Software', 'Gym'], range: [10, 50] },
    { parent: '🗺 Travel', subs: ['Flights', 'Hotels', 'Activities'], range: [100, 800] },
    { parent: '🫶 Wellness', subs: ['Healthcare', 'Personal Care'], range: [30, 200] },
  ];

  let csv = 'date,name,amount,status,category,parent category,excluded,tags,type,account,account mask,note,recurring\n';
  const merchants = { Groceries: ['Whole Foods','Trader Joes','Safeway','Costco'], Restaurants: ['Chipotle','Panda Express','Local Cafe','Sushi Place'], Coffee: ['Starbucks','Blue Bottle','Peets'], Rent: ['Landlord LLC'], Utilities: ['PG&E','Water Co','Internet Co'], Insurance: ['Home Insurance Co'], Gas: ['Shell','Chevron','BP'], Parking: ['City Parking','Garage Inc'], Rideshare: ['Uber','Lyft'], Clothing: ['Nike','Zara','H&M','Uniqlo'], Electronics: ['Amazon','Best Buy','Apple'], Home: ['IKEA','Target','Home Depot'], Streaming: ['Netflix','Spotify','HBO'], Software: ['Adobe','Notion','OpenAI'], Gym: ['Planet Fitness','ClassPass'], Flights: ['United','Delta','Southwest'], Hotels: ['Marriott','Airbnb','Hilton'], Activities: ['Museum','Tours','Shows'], Healthcare: ['CVS Pharmacy','Dr. Smith'], 'Personal Care': ['Hair Salon','Spa'] };

  for (let year = 2022; year <= 2025; year++) {
    for (let month = 1; month <= 12; month++) {
      if (year === 2025 && month > 11) continue;
      const daysInMonth = new Date(year, month, 0).getDate();
      categories.forEach(cat => {
        const txnCount = cat.parent === '🏡 Housing' ? 3 : Math.floor(Math.random() * 8) + 3;
        for (let t = 0; t < txnCount; t++) {
          const sub = cat.subs[Math.floor(Math.random() * cat.subs.length)];
          const day = Math.floor(Math.random() * daysInMonth) + 1;
          const amount = (cat.range[0] + Math.random() * (cat.range[1] - cat.range[0])).toFixed(2);
          const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const merch = merchants[sub] ? merchants[sub][Math.floor(Math.random() * merchants[sub].length)] : sub;
          csv += `"${date}","${merch}",${amount},"posted","${sub}","${cat.parent}",false,,"regular","Card","1234","",""\n`;
        }
      });
    }
  }

  setTimeout(() => {
    try {
      const { yearData, yearTxns } = parseCSV(csv);
      initFromParsed(yearData, yearTxns);
      launchDashboard();
    } catch (err) {
      errorEl.textContent = err.message;
    }
    dropZone.classList.remove('loading');
  }, 300);
});
