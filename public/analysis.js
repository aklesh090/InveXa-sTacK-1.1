/* ══════════════════════════════════════════
   InveXa Intelligence — analysis.js
   Connected to MongoDB via /api endpoints
   Falls back to generated demo data if < 7 real sales
══════════════════════════════════════════ */

'use strict';

// ══════════════════════════════════════════
//  DATA LAYER — Fetch from API or fallback
// ══════════════════════════════════════════
const API = '';   // same origin

function authHeaders() {
  const token = localStorage.getItem('invexa_token');
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = 'Bearer ' + token;
  return h;
}

async function fetchProducts() {
  const res = await fetch(`${API}/api/products`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch products');
  return res.json();
}

async function fetchSales(days = 180) {
  const res = await fetch(`${API}/api/sales?days=${days}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch sales');
  return res.json();
}

async function fetchCategories() {
  const res = await fetch(`${API}/api/categories`, { headers: authHeaders() });
  if (!res.ok) return [];
  return res.json();
}

// Build per-product daily history from real sale records
function buildHistory(products, sales, days = 180) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const history = {};

  products.forEach(p => {
    const id = p._id || p.id;
    history[id] = [];

    for (let d = days - 1; d >= 0; d--) {
      const date = new Date(today);
      date.setDate(today.getDate() - d);
      const ds = date.toISOString().split('T')[0];
      history[id].push({ date: ds, units: 0, revenue: 0 });
    }
  });

  // Fill from sale records
  sales.forEach(sale => {
    const saleDate = new Date(sale.saleDate).toISOString().split('T')[0];
    (sale.items || []).forEach(item => {
      const pid = item.productId;
      if (history[pid]) {
        const entry = history[pid].find(h => h.date === saleDate);
        if (entry) {
          entry.units += item.quantity;
          entry.revenue += item.subtotal || (item.quantity * item.price);
        }
      }
    });
  });

  return history;
}

// ══════════════════════════════════════════
//  DEMO DATA FALLBACK (if < 7 real sales)
// ══════════════════════════════════════════
const SEASONAL_PROFILE = {
  'Dairy':     [1.0, 0.95, 0.98, 1.0,  1.05, 1.1,  1.15, 1.12, 1.05, 1.0,  0.98, 1.08],
  'Produce':   [0.9, 0.88, 1.0,  1.15, 1.25, 1.3,  1.35, 1.3,  1.2,  1.05, 0.95, 0.88],
  'Beverages': [0.9, 0.88, 0.95, 1.0,  1.1,  1.35, 1.5,  1.45, 1.2,  1.0,  0.92, 0.95],
  'Meat':      [1.0, 0.95, 1.0,  1.05, 1.1,  1.2,  1.25, 1.2,  1.1,  1.0,  1.05, 1.2 ],
  'Bakery':    [1.05,1.0,  1.0,  1.0,  1.0,  0.95, 0.9,  0.92, 1.0,  1.05, 1.1,  1.2 ],
  'Snacks':    [1.0, 0.98, 1.0,  1.05, 1.1,  1.2,  1.25, 1.2,  1.1,  1.05, 1.0,  1.15],
  'Frozen':    [1.0, 0.95, 0.98, 1.0,  1.08, 1.2,  1.3,  1.25, 1.1,  1.0,  0.98, 1.05],
  'Household': [1.0, 1.02, 1.05, 1.08, 1.05, 1.0,  0.98, 0.98, 1.02, 1.05, 1.08, 1.1 ],
  'Grains':    [1.0, 1.0,  1.0,  1.0,  0.98, 0.95, 0.92, 0.95, 1.0,  1.02, 1.05, 1.1 ],
};

function generateDemoHistory(products, days = 180) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const history = {};

  products.forEach(p => {
    const id = p._id || p.id;
    history[id] = [];
    const velocity = p.salesVelocity || 5;
    const profile = SEASONAL_PROFILE[p.category] || Array(12).fill(1);
    const trendDir = Math.random() > 0.5 ? 1 : Math.random() > 0.5 ? -1 : 0;

    for (let d = days - 1; d >= 0; d--) {
      const date = new Date(today);
      date.setDate(today.getDate() - d);
      const month = date.getMonth();
      const dayOfWeek = date.getDay();
      const seasonal = profile[month] || 1;
      const weekendBoost = (dayOfWeek === 0 || dayOfWeek === 6) ? 1.18 : 1.0;
      const trendEffect = 1 + (trendDir * 0.002 * (days - d));
      const noise = 0.75 + Math.random() * 0.50;
      const units = Math.max(0, Math.round(velocity * seasonal * weekendBoost * trendEffect * noise));
      const sell = p.sellingPrice || p.sell || 50;
      history[id].push({
        date: date.toISOString().split('T')[0],
        units,
        revenue: units * sell
      });
    }
  });
  return history;
}

// ══════════════════════════════════════════
//  STATISTICAL ENGINE
// ══════════════════════════════════════════
function movingAverage(data, window = 7) {
  return data.map((_, i) => {
    if (i < window - 1) return null;
    const slice = data.slice(i - window + 1, i + 1);
    return slice.reduce((s, v) => s + v, 0) / window;
  });
}

function linearRegression(values) {
  const n = values.length;
  if (n === 0) return { slope: 0, intercept: 0, predict: () => 0 };
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  values.forEach((y, x) => { num += (x - xMean) * (y - yMean); den += (x - xMean) ** 2; });
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  return { slope, intercept, predict: x => intercept + slope * x };
}

function calcSeasonalIndex(productHistory) {
  const monthTotals = Array(12).fill(0);
  const monthCounts = Array(12).fill(0);
  productHistory.forEach(d => {
    const m = new Date(d.date).getMonth();
    monthTotals[m] += d.units;
    monthCounts[m]++;
  });
  const monthAvgs = monthTotals.map((t, i) => monthCounts[i] > 0 ? t / monthCounts[i] : 0);
  const nonZero = monthAvgs.filter(v => v > 0);
  const overallAvg = nonZero.length > 0 ? nonZero.reduce((s, v) => s + v, 0) / nonZero.length : 1;
  return monthAvgs.map(v => overallAvg > 0 ? v / overallAvg : 1);
}

function forecast(productHistory, product, forecastDays = 30) {
  const units = productHistory.map(d => d.units);
  const ma7 = movingAverage(units, 7).filter(v => v !== null);
  if (ma7.length === 0) return [];
  const reg = linearRegression(ma7);
  const seasonalIdx = calcSeasonalIndex(productHistory);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const forecastPoints = [];
  const sell = product.sellingPrice || product.sell || 50;

  for (let i = 1; i <= forecastDays; i++) {
    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + i);
    const month = futureDate.getMonth();
    const baseValue = reg.predict(ma7.length + i);
    const seasonal = seasonalIdx[month] || 1;
    const dayOfWeek = futureDate.getDay();
    const weekendBoost = (dayOfWeek === 0 || dayOfWeek === 6) ? 1.15 : 1.0;
    const predicted = Math.max(0, baseValue * seasonal * weekendBoost);
    forecastPoints.push({
      date: futureDate.toISOString().split('T')[0],
      predicted: Math.round(predicted),
      upper: Math.round(predicted * 1.18),
      lower: Math.round(predicted * 0.82),
      revenue: Math.round(predicted * sell),
    });
  }
  return forecastPoints;
}

// ══════════════════════════════════════════
//  PRODUCT SCORING & RECOMMENDATION ENGINE
// ══════════════════════════════════════════
function scoreProducts(products, history, forecastDays = 30) {
  return products.map(p => {
    const id = p._id || p.id;
    const hist = history[id] || [];
    if (hist.length === 0) return null;

    const last30 = hist.slice(-30);
    const last7  = hist.slice(-7);
    const prev30 = hist.slice(-60, -30);

    const velocity30 = last30.reduce((s, d) => s + d.units, 0) / 30;
    const velocity7  = last7.reduce((s, d) => s + d.units, 0) / 7;
    const prevVelocity = prev30.length > 0 ? prev30.reduce((s, d) => s + d.units, 0) / 30 : velocity30;

    const trendPct = prevVelocity > 0 ? ((velocity30 - prevVelocity) / prevVelocity) * 100 : 0;
    const cost = p.costPrice || p.cost || 0;
    const sell = p.sellingPrice || p.sell || 0;
    const stock = p.currentStock ?? p.stock ?? 0;
    const minStock = p.minimumStock ?? p.minStock ?? 10;
    const margin = sell > 0 ? ((sell - cost) / sell) * 100 : 0;
    const stockoutDays = velocity7 > 0 ? stock / velocity7 : 999;
    const monthlyDemand = velocity30 * 30;
    const stockMonthsCover = monthlyDemand > 0 ? (stock / monthlyDemand) * 30 : 0;
    const wasteRisk = stockMonthsCover > 90;
    const stockoutRisk = stockoutDays < 14;
    const revenue30 = last30.reduce((s, d) => s + d.revenue, 0);
    const profit30  = revenue30 - (last30.reduce((s, d) => s + d.units, 0) * cost);

    const seasonProfile = SEASONAL_PROFILE[p.category] || Array(12).fill(1);
    const peakMonth = seasonProfile.indexOf(Math.max(...seasonProfile));
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const peakSeason = months[peakMonth];

    const fc = forecast(hist, p, forecastDays);
    const projectedRevenue = fc.reduce((s, d) => s + d.revenue, 0);

    // ── ACTION LOGIC ──────────────────────
    let action = 'keep';
    let reason = '';
    if (velocity30 < 1 && margin < 20) {
      action = 'remove';
      reason = `Very low demand (${velocity30.toFixed(1)} u/day) + thin margin (${margin.toFixed(0)}%). Dead stock.`;
    } else if (wasteRisk && trendPct < -10) {
      action = 'reduce';
      reason = `${stockMonthsCover.toFixed(0)}d stock cover + declining trend (${trendPct.toFixed(0)}%). Reduce orders.`;
    } else if (margin < 20 && velocity30 > 4) {
      action = 'replace';
      reason = `High demand (${velocity30.toFixed(1)} u/day) but low margin (${margin.toFixed(0)}%). Source better supplier.`;
    } else if (stockoutRisk && margin > 25 && trendPct > -5) {
      action = 'increase';
      reason = `Stockout in ~${stockoutDays.toFixed(0)}d. Strong margin (${margin.toFixed(0)}%). Demand growing.`;
    } else if (trendPct > 15 && margin > 22) {
      action = 'increase';
      reason = `+${trendPct.toFixed(0)}% sales growth trend. Good margin. Capitalise with higher stock.`;
    } else if (stockMonthsCover > 60 && trendPct < 0) {
      action = 'reduce';
      reason = `Overstocked (${stockMonthsCover.toFixed(0)}d cover) with flat/declining demand. Free up cash.`;
    } else if (trendPct < -20 && velocity30 < 3) {
      action = 'replace';
      reason = `Demand falling (${trendPct.toFixed(0)}%). Consider switching variant/brand.`;
    }

    return {
      id, name: p.name, category: p.category,
      cost, sell, stock, minStock,
      velocity30, velocity7, trendPct,
      margin, stockoutDays, stockMonthsCover,
      wasteRisk, stockoutRisk,
      revenue30, profit30, projectedRevenue,
      peakSeason, action, reason,
      forecast: fc,
    };
  }).filter(Boolean);
}

// ══════════════════════════════════════════
//  CHART INSTANCES
// ══════════════════════════════════════════
let charts = {};
function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

// ── Trend Chart ──────────────────────────
function renderTrendChart(history, scored, periodDays, forecastDays) {
  destroyChart('trend');
  const today = new Date(); today.setHours(0,0,0,0);
  const labels = [];
  const historicalRevenue = [];

  for (let d = periodDays - 1; d >= 0; d--) {
    const dt = new Date(today); dt.setDate(today.getDate() - d);
    const ds = dt.toISOString().split('T')[0];
    labels.push(ds);
    const rev = scored.reduce((s, p) => {
      const id = p.id;
      const found = (history[id] || []).find(h => h.date === ds);
      return s + (found ? found.revenue : 0);
    }, 0);
    historicalRevenue.push(rev);
  }

  const ma = movingAverage(historicalRevenue, 7);
  const forecastLabels = [], forecastRevenue = [], forecastUpper = [], forecastLower = [];
  for (let i = 1; i <= forecastDays; i++) {
    const dt = new Date(today); dt.setDate(today.getDate() + i);
    forecastLabels.push(dt.toISOString().split('T')[0]);
    const rev = scored.reduce((s, p) => { const fc = (p.forecast || [])[i-1]; return s + (fc ? fc.revenue : 0); }, 0);
    forecastRevenue.push(rev);
    forecastUpper.push(rev * 1.18);
    forecastLower.push(rev * 0.82);
  }

  const allLabels = [...labels, ...forecastLabels];
  const shortLabels = allLabels.map(d => { const dt = new Date(d); return `${dt.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dt.getMonth()]}`; });

  const ctx = document.getElementById('trendChart').getContext('2d');
  charts.trend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: shortLabels,
      datasets: [
        { label: 'Daily Revenue', data: [...historicalRevenue, ...Array(forecastDays).fill(null)], borderColor: 'rgba(0,102,255,0.4)', backgroundColor: 'rgba(0,102,255,0.05)', borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.3, order: 3 },
        { label: '7-Day Moving Avg', data: [...ma.map(v => v !== null ? Math.round(v) : null), ...Array(forecastDays).fill(null)], borderColor: '#0066FF', borderWidth: 2.5, pointRadius: 0, fill: false, tension: 0.4, order: 2 },
        { label: 'Forecast (Upper)', data: [...Array(periodDays).fill(null), ...forecastUpper], borderColor: 'rgba(34,197,94,0.3)', borderWidth: 1, borderDash: [4,4], pointRadius: 0, fill: false, tension: 0.4, order: 1 },
        { label: 'Forecast', data: [...Array(periodDays).fill(null), ...forecastRevenue], borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.08)', borderWidth: 2.5, borderDash: [6,3], pointRadius: 0, fill: '+1', tension: 0.4, order: 0 },
        { label: 'Forecast (Lower)', data: [...Array(periodDays).fill(null), ...forecastLower], borderColor: 'rgba(34,197,94,0.3)', borderWidth: 1, borderDash: [4,4], pointRadius: 0, fill: false, tension: 0.4, order: 1 },
      ]
    },
    options: {
      responsive: true, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ₹${Math.round(ctx.raw || 0).toLocaleString('en-IN')}`, title: ctx => `📅 ${ctx[0].label}` } } },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12, font: { size: 11 }, color: '#94a3b8' } },
        y: { beginAtZero: false, grid: { color: 'rgba(0,102,255,0.06)' }, ticks: { callback: v => '₹' + (v >= 1000 ? (v/1000).toFixed(0)+'K' : v), font: { size: 11 }, color: '#94a3b8' } }
      }
    }
  });
}

// ── Seasonal Chart ────────────────────────
function renderSeasonalChart(history, products) {
  destroyChart('seasonal');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthTotals = Array(12).fill(0), monthCounts = Array(12).fill(0);
  products.forEach(p => {
    const id = p._id || p.id;
    (history[id] || []).forEach(d => { const m = new Date(d.date).getMonth(); monthTotals[m] += d.units; monthCounts[m]++; });
  });
  const monthAvgs = monthTotals.map((t, i) => monthCounts[i] > 0 ? +(t / monthCounts[i]).toFixed(2) : 0);
  const overall = monthAvgs.reduce((s, v) => s + v, 0) / 12 || 1;
  const indices = monthAvgs.map(v => +(v / overall).toFixed(3));
  const colors = indices.map(v => v > 1.1 ? '#0066FF' : v > 0.95 ? '#22c55e' : '#f59e0b');

  const ctx = document.getElementById('seasonalChart').getContext('2d');
  charts.seasonal = new Chart(ctx, {
    type: 'bar',
    data: { labels: months, datasets: [{ label: 'Seasonal Index', data: indices, backgroundColor: colors, borderRadius: 6, borderSkipped: false }] },
    options: {
      responsive: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `Index: ${c.raw} (${((c.raw-1)*100).toFixed(0)}% vs avg)` } } },
      scales: { x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#94a3b8' } }, y: { min: 0.7, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, color: '#94a3b8', stepSize: 0.1 } } }
    }
  });
}

// ── Category Chart ───────────────────────
function renderCategoryChart(scored) {
  destroyChart('category');
  const catRevenue = {};
  scored.forEach(p => { catRevenue[p.category] = (catRevenue[p.category] || 0) + p.revenue30; });
  const cats = Object.keys(catRevenue).sort((a, b) => catRevenue[b] - catRevenue[a]);
  const blueShades = ['#0066FF','#2282FF','#339EFF','#55BEFF','#0059E6','#004DCC','#3388FF','#66AAFF','#0040B3'];
  const ctx = document.getElementById('iaCategoryChart').getContext('2d');
  charts.category = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: cats, datasets: [{ data: cats.map(c => catRevenue[c]), backgroundColor: blueShades.slice(0, cats.length), borderWidth: 2, borderColor: '#fff', hoverOffset: 8 }] },
    options: { responsive: true, cutout: '62%', plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } }, tooltip: { callbacks: { label: c => `${c.label}: ₹${c.raw.toLocaleString('en-IN')}` } } } }
  });
}

// ── Velocity Chart ───────────────────────
function renderVelocityChart(scored) {
  destroyChart('velocity');
  const sorted = [...scored].sort((a, b) => b.velocity30 - a.velocity30).slice(0, 10);
  const colors = sorted.map(p => p.action==='increase'?'#22c55e':p.action==='reduce'?'#f59e0b':p.action==='remove'?'#ef4444':p.action==='replace'?'#a855f7':'#0066FF');
  const ctx = document.getElementById('velocityChart').getContext('2d');
  charts.velocity = new Chart(ctx, {
    type: 'bar',
    data: { labels: sorted.map(p => p.name.length > 16 ? p.name.slice(0,14)+'…' : p.name), datasets: [{ label: 'Units/day', data: sorted.map(p => +p.velocity30.toFixed(1)), backgroundColor: colors, borderRadius: 5, borderSkipped: false }] },
    options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.raw} units/day` } } }, scales: { x: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, color: '#94a3b8' } }, y: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#374151' } } } }
  });
}

// ── Bubble Chart ─────────────────────────
function renderBubbleChart(scored) {
  destroyChart('bubble');
  const colorMap = { increase:'#22c55e', reduce:'#f59e0b', replace:'#a855f7', remove:'#ef4444', keep:'#0066FF' };
  const ctx = document.getElementById('bubbleChart').getContext('2d');
  charts.bubble = new Chart(ctx, {
    type: 'bubble',
    data: { datasets: [{ label: 'Products', data: scored.map(p => ({ x: +p.velocity30.toFixed(1), y: +p.margin.toFixed(1), r: Math.max(4, Math.min(20, p.stock / 20)), name: p.name, action: p.action })), backgroundColor: scored.map(p => (colorMap[p.action]||'#0066FF') + '88'), borderColor: scored.map(p => colorMap[p.action]||'#0066FF'), borderWidth: 1.5 }] },
    options: {
      responsive: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => { const d = c.raw; return [`Product: ${d.name}`, `Demand: ${d.x} u/day`, `Margin: ${d.y}%`, `Action: ${d.action.toUpperCase()}`]; } } } },
      scales: { x: { title: { display: true, text: 'Sales Velocity (units/day)', font: { size: 11 }, color: '#64748b' }, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, color: '#94a3b8' } }, y: { title: { display: true, text: 'Profit Margin (%)', font: { size: 11 }, color: '#64748b' }, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, color: '#94a3b8', callback: v => v+'%' } } }
    }
  });
}

// ══════════════════════════════════════════
//  RENDER PRODUCT TABLE
// ══════════════════════════════════════════
function renderProductTable(scored) {
  const tbody = document.getElementById('productTableBody');
  const actionIcons = { increase:'fa-arrow-up', reduce:'fa-arrow-down', replace:'fa-sync-alt', remove:'fa-times', keep:'fa-minus' };
  tbody.innerHTML = scored.sort((a,b) => { const o = {remove:0,replace:1,reduce:2,increase:3,keep:4}; return (o[a.action]||5) - (o[b.action]||5); }).map(p => {
    const trendClass = p.trendPct > 5 ? 'up' : p.trendPct < -5 ? 'down' : 'flat';
    const trendIcon  = trendClass==='up' ? 'fa-arrow-up' : trendClass==='down' ? 'fa-arrow-down' : 'fa-minus';
    const marginClass = p.margin > 35 ? 'margin-high' : p.margin > 22 ? 'margin-medium' : 'margin-low';
    const stockRatio = Math.min(100, (p.stock / p.minStock / 4) * 100);
    const stockColor = p.stockoutRisk ? '#ef4444' : p.wasteRisk ? '#f59e0b' : '#22c55e';
    const stockoutClass = p.stockoutDays < 7 ? 'critical' : p.stockoutDays < 21 ? 'warning' : 'safe';
    const stockoutText = p.stockoutDays > 300 ? '300+ d' : `~${Math.round(p.stockoutDays)}d`;
    return `<tr data-action="${p.action}">
      <td>${p.name}</td>
      <td><span style="font-size:0.75rem;color:#64748b;">${p.category}</span></td>
      <td><span class="action-badge ${p.action}"><i class="fas ${actionIcons[p.action]}"></i> ${p.action.toUpperCase()}</span></td>
      <td><strong>${p.velocity30.toFixed(1)}</strong></td>
      <td><span class="trend-indicator ${trendClass}"><i class="fas ${trendIcon}"></i> ${Math.abs(p.trendPct).toFixed(0)}%</span></td>
      <td class="${marginClass}">${p.margin.toFixed(0)}%</td>
      <td><div class="stock-bar-wrap"><span style="font-size:0.75rem;min-width:30px;">${p.stock}</span><div class="stock-bar"><div class="stock-bar__fill" style="width:${stockRatio}%;background:${stockColor};"></div></div></div></td>
      <td><span class="stockout-badge ${stockoutClass}"><i class="fas fa-clock"></i> ${stockoutText}</span></td>
      <td><span class="season-chip">⭐ ${p.peakSeason}</span></td>
      <td style="max-width:220px;font-size:0.75rem;color:#475569;">${p.reason || '—'}</td>
    </tr>`;
  }).join('');
}

// ══════════════════════════════════════════
//  RENDER KPI CARDS
// ══════════════════════════════════════════
function renderKPIs(scored, forecastDays) {
  const projectedRev = scored.reduce((s, p) => s + p.projectedRevenue, 0);
  const stockoutItems = scored.filter(p => p.stockoutRisk).length;
  const wasteItems = scored.filter(p => p.wasteRisk).length;
  const opportunityItems = scored.filter(p => p.action === 'increase').length;
  const avgMargin = scored.length > 0 ? scored.reduce((s, p) => s + p.margin, 0) / scored.length : 0;

  document.getElementById('kpiRevenue').textContent = '₹' + (projectedRev/1000).toFixed(0) + 'K';
  document.getElementById('kpiRevenueDelta').textContent = `₹${(projectedRev/forecastDays).toFixed(0)}/day avg`;
  document.getElementById('kpiRevenueDelta').className = 'kpi-delta up';

  document.getElementById('kpiStockout').textContent = stockoutItems;
  const soEl = document.getElementById('kpiStockoutDelta');
  soEl.textContent = stockoutItems > 0 ? `⚠️ ${scored.filter(p=>p.stockoutDays<7).length} critical (<7d)` : '✅ All safe';
  soEl.className = 'kpi-delta ' + (stockoutItems > 3 ? 'down' : stockoutItems > 0 ? 'warn' : 'up');

  document.getElementById('kpiWaste').textContent = wasteItems;
  const waEl = document.getElementById('kpiWasteDelta');
  waEl.textContent = wasteItems > 0 ? `Cash tied up in ${wasteItems} SKUs` : '✅ Stock balanced';
  waEl.className = 'kpi-delta ' + (wasteItems > 3 ? 'down' : wasteItems > 0 ? 'warn' : 'up');

  document.getElementById('kpiOpportunity').textContent = opportunityItems;
  const opEl = document.getElementById('kpiOpportunityDelta');
  opEl.textContent = `${scored.filter(p=>p.action==='remove').length} to remove`;
  opEl.className = 'kpi-delta up';

  document.getElementById('kpiMargin').textContent = avgMargin.toFixed(1) + '%';
  const mEl = document.getElementById('kpiMarginDelta');
  mEl.textContent = avgMargin > 35 ? '↑ Strong' : avgMargin > 25 ? '→ Healthy' : '↓ Review needed';
  mEl.className = 'kpi-delta ' + (avgMargin > 35 ? 'up' : avgMargin > 25 ? 'warn' : 'down');
}

// ══════════════════════════════════════════
//  RENDER INSIGHT CARDS
// ══════════════════════════════════════════
function renderInsightCards(scored) {
  const container = document.getElementById('insightCards');
  const topIncrease = scored.filter(p => p.action === 'increase');
  const opportunityRev = topIncrease.reduce((s, p) => s + p.projectedRevenue, 0);
  const critical = scored.filter(p => p.stockoutDays < 7);
  const warning  = scored.filter(p => p.stockoutDays >= 7 && p.stockoutDays < 21);
  const today = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const nextMonths = [months[today.getMonth()], months[(today.getMonth()+1)%12]];
  const seasonal = scored.filter(p => nextMonths.includes(p.peakSeason));
  const leakers = scored.filter(p => p.action === 'replace').sort((a,b) => a.margin - b.margin);

  container.innerHTML = `
    <div class="insight-card type-growth">
      <div class="insight-card__label">💰 Revenue Opportunity</div>
      <div class="insight-card__headline">Boost ${topIncrease.length} products to unlock ₹${(opportunityRev/1000).toFixed(0)}K</div>
      <div class="insight-card__body">These products have strong margins and growing demand. Increasing stock and reorder frequency can capture this missed revenue.</div>
      <div class="insight-card__products">${topIncrease.map(p => `<span class="product-chip">📈 ${p.name}</span>`).join('')}</div>
    </div>
    <div class="insight-card type-risk">
      <div class="insight-card__label">🚨 Stockout Alert</div>
      <div class="insight-card__headline">${critical.length} critical + ${warning.length} warning stockout risks</div>
      <div class="insight-card__body">${critical.length > 0 ? `<strong>Critical (&lt;7d):</strong> ${critical.map(p=>p.name).join(', ')}. ` : ''}${warning.length > 0 ? `<strong>Warning (&lt;21d):</strong> ${warning.map(p=>p.name).join(', ')}.` : ''}${critical.length===0 && warning.length===0 ? '✅ All products have healthy stock. No immediate action needed.' : ' Place emergency reorders immediately.'}</div>
    </div>
    <div class="insight-card type-seasonal">
      <div class="insight-card__label">🌤️ Seasonal Intelligence</div>
      <div class="insight-card__headline">${seasonal.length} products entering peak season in ${nextMonths.join('/')}</div>
      <div class="insight-card__body">Stock up before the seasonal surge. Historical data shows up to 35% demand increase during peak months.</div>
      <div class="insight-card__products">${seasonal.slice(0,6).map(p => `<span class="product-chip">🌟 ${p.name}</span>`).join('')}</div>
    </div>
    <div class="insight-card type-revenue">
      <div class="insight-card__label">🔄 Margin Optimisation</div>
      <div class="insight-card__headline">${leakers.length} products need supplier renegotiation</div>
      <div class="insight-card__body">High-demand products with margins below 20%. Either renegotiate pricing, switch suppliers, or replace with premium variants.</div>
      <div class="insight-card__products">${leakers.slice(0,5).map(p => `<span class="product-chip">${p.name} (${p.margin.toFixed(0)}%)</span>`).join('')}</div>
    </div>`;
}

// ══════════════════════════════════════════
//  FILTER TABLE
// ══════════════════════════════════════════
function setupFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      document.querySelectorAll('#productTableBody tr').forEach(row => {
        row.classList.toggle('filtered-out', filter !== 'all' && row.dataset.action !== filter);
      });
    });
  });
}

// ══════════════════════════════════════════
//  POPULATE CATEGORY DROPDOWN FROM API
// ══════════════════════════════════════════
async function populateCategoryDropdown(products) {
  const cats = [...new Set(products.map(p => p.category))].sort();
  const select = document.getElementById('categorySelect');
  select.innerHTML = '<option value="all">All Categories</option>';
  cats.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    select.appendChild(opt);
  });
}

// ══════════════════════════════════════════
//  MAIN RUN ANALYSIS
// ══════════════════════════════════════════
let cachedProducts = null;
let cachedHistory = null;
let dataMode = 'loading';  // 'api' or 'demo'

async function runAnalysis() {
  const loading = document.getElementById('loadingOverlay');
  const loadingStep = document.getElementById('loadingStep');
  loading.classList.remove('hidden');

  const periodDays = parseInt(document.getElementById('periodSelect').value);
  const forecastDays = parseInt(document.getElementById('forecastSelect').value);
  const categoryFilter = document.getElementById('categorySelect').value;

  const steps = ['Fetching products from database…','Loading sales history…','Computing moving averages…','Running seasonal decomposition…','Forecasting demand…','Scoring products…','Building visualisations…'];
  let stepIdx = 0;
  const stepInterval = setInterval(() => { if (stepIdx < steps.length) loadingStep.textContent = steps[stepIdx++]; }, 250);

  try {
    // 1️⃣ Fetch products
    if (!cachedProducts) {
      cachedProducts = await fetchProducts();
      populateCategoryDropdown(cachedProducts);
    }

    // 2️⃣ Fetch sales and build history
    if (!cachedHistory) {
      const sales = await fetchSales(180);
      // Always use real data — no demo fallback when products exist
      cachedHistory = buildHistory(cachedProducts, sales, 180);
      dataMode = sales.length > 0 ? 'api' : 'api-empty';
    }

    // 3️⃣ Filter by category
    const products = categoryFilter === 'all' ? cachedProducts : cachedProducts.filter(p => p.category === categoryFilter);

    // 4️⃣ Score products
    const scored = scoreProducts(products, cachedHistory, forecastDays);

    // 5️⃣ Render everything
    renderKPIs(scored, forecastDays);
    renderTrendChart(cachedHistory, scored, periodDays, forecastDays);
    renderSeasonalChart(cachedHistory, products);
    renderCategoryChart(scored);
    renderVelocityChart(scored);
    renderBubbleChart(scored);
    renderProductTable(scored);
    renderInsightCards(scored);
    setupFilters();

    // 6️⃣ Update UI status
    document.getElementById('lastUpdated').textContent = dataMode === 'api' ? '✅ Live data — Just now' : '⚠️ Demo data — Record sales to see real insights';

  } catch (err) {
    console.error('Analysis error:', err);
    // Fallback to demo data if API fails
    if (!cachedProducts || cachedProducts.length === 0) {
      loadingStep.textContent = 'API unavailable — loading demo data…';
      cachedProducts = [
        { _id:'d1', name:'Sample Product 1', category:'Dairy', costPrice:30, sellingPrice:50, currentStock:100, minimumStock:20, salesVelocity:8, supplier:'Demo' },
        { _id:'d2', name:'Sample Product 2', category:'Produce', costPrice:20, sellingPrice:40, currentStock:50, minimumStock:15, salesVelocity:5, supplier:'Demo' }
      ];
      cachedHistory = generateDemoHistory(cachedProducts, 180);
      dataMode = 'demo';
      const scored = scoreProducts(cachedProducts, cachedHistory, parseInt(document.getElementById('forecastSelect').value));
      renderKPIs(scored, parseInt(document.getElementById('forecastSelect').value));
      renderTrendChart(cachedHistory, scored, parseInt(document.getElementById('periodSelect').value), parseInt(document.getElementById('forecastSelect').value));
      renderSeasonalChart(cachedHistory, cachedProducts);
      renderCategoryChart(scored);
      renderVelocityChart(scored);
      renderBubbleChart(scored);
      renderProductTable(scored);
      renderInsightCards(scored);
      setupFilters();
      document.getElementById('lastUpdated').textContent = '⚠️ Demo data — Server connection failed';
    }
  }

  clearInterval(stepInterval);
  setTimeout(() => loading.classList.add('hidden'), 400);
}

// ══════════════════════════════════════════
//  INIT — Lazy-loaded when section becomes visible
// ══════════════════════════════════════════
let iaInitialized = false;
// Expose globally so app.js can reset it when tab is switched
Object.defineProperty(window, 'iaInitialized', {
  get() { return iaInitialized; },
  set(v) { iaInitialized = v; }
});
function initIntelligence() {
  if (iaInitialized) return;
  iaInitialized = true;
  document.getElementById('runAnalysisBtn').addEventListener('click', () => { cachedProducts = null; cachedHistory = null; runAnalysis(); });
  document.getElementById('periodSelect').addEventListener('change', () => { cachedHistory = null; runAnalysis(); });
  document.getElementById('forecastSelect').addEventListener('change', () => { cachedHistory = null; runAnalysis(); });
  document.getElementById('categorySelect').addEventListener('change', () => runAnalysis());
  // Always fetch fresh data on init
  cachedProducts = null;
  cachedHistory = null;
  runAnalysis();
}
// Make accessible globally for app.js
window.initIntelligence = initIntelligence;
