/* Cross-channel dashboard. Real MCP wiring.
   Two honest ways to go live:
   1. Direct connect: add an MCP server URL + token. The /api/mcp serverless
      proxy runs the real handshake, lists the tools, and pulls your numbers.
   2. Sync via Claude: for OAuth-only MCPs, ask your connected Claude chat to
      emit the dashboard JSON and paste it back.
   With nothing connected, the view shows clearly-labelled sample data. */

// ---------------------------------------------------------------- sample data
const SAMPLE = {
  source: 'sample',
  account: 'Sample account',
  range: 'Last 30 days',
  totals: { spend: 179800, spendDelta: 12, pipeline: 853360, pipelineDelta: 21, pipelineMultiple: 4.7, blendedCPL: 131, cplDelta: -24, mqls: 1370, mqlsDelta: 18, closedWon: 412000, wonDelta: 31 },
  channels: [
    { key: 'linkedin', name: 'LinkedIn', spend: 78400, cpc: 14.20, cpl: 168, mqls: 467, pipeline: 360640, roas: 4.6, cplDelta: -18 },
    { key: 'google',   name: 'Google',   spend: 52800, cpc: 6.80,  cpl: 96,  mqls: 550, pipeline: 327360, roas: 6.2, cplDelta: -9 },
    { key: 'meta',     name: 'Meta',     spend: 28600, cpc: 2.40,  cpl: 128, mqls: 223, pipeline: 108680, roas: 3.8, cplDelta: 31 },
    { key: 'reddit',   name: 'Reddit',   spend: 12400, cpc: 1.90,  cpl: 142, mqls: 87,  pipeline: 38440,  roas: 3.1, cplDelta: -4 },
    { key: 'x',        name: 'X',        spend: 7600,  cpc: 2.10,  cpl: 176, mqls: 43,  pipeline: 18240,  roas: 2.4, cplDelta: 6 },
  ],
  agents: [
    { agent: 'Budget Agent', status: 'pending', time: 'now', text: 'Move <b>$4,200/day</b> from <b>Meta → LinkedIn</b>. LinkedIn returns <b>4.6x</b> pipeline per dollar vs Meta at 3.8x. Sent to <b>Slack</b> for your sign-off.' },
    { agent: 'Bid Agent', status: 'done', time: '6m ago', text: 'Rebid your top <b>Google</b> auctions as rivals raised bids. Held CPL at <b>$96</b>.' },
    { agent: 'Guard Agent', status: 'done', time: '23m ago', text: 'Paused <b>2 Meta ad sets</b> the moment CPL crossed target. Creative fatigue, caught intraday, not at month-end.' },
    { agent: 'Creative Agent', status: 'pending', time: '1h ago', text: 'Generated <b>3 new LinkedIn variants</b> from your brand kit for the AI Buyers segment.' },
    { agent: 'Audience Agent', status: 'done', time: '2h ago', text: 'Built an intent audience of <b>1,240 accounts</b> surging on agentic GTM.' },
    { agent: 'Match Agent', status: 'done', time: '3h ago', text: 'Matched <b>6,810</b> anonymous visitors to accounts. 38 went to retargeting.' },
  ],
};

// ------------------------------------------------------------- connector types
const TYPES = {
  metadataone: { label: 'MetadataONE', color: '#ea580c', url: 'https://mcp-server.metadata.io/mcp', firstClass: true,
    note: 'All five channels through one connector, plus pipeline, closed-won, and the agent layer. Generate an access token in Metadata under Settings, Access Token.' },
  'google-ads': { label: 'Google Ads', color: '#ea4335', url: '', note: 'Paste your Google Ads MCP server URL and its token.' },
  meta: { label: 'Meta Ads', color: '#0866ff', url: '', note: 'Paste your Meta Ads MCP server URL and its token.' },
  linkedin: { label: 'LinkedIn Ads', color: '#0a66c2', url: '', note: 'Paste your LinkedIn Ads MCP server URL and its token.' },
  reddit: { label: 'Reddit Ads', color: '#ff4500', url: '', note: 'Paste your Reddit Ads MCP server URL and its token.' },
  x: { label: 'X Ads', color: '#0f1729', url: '', note: 'Paste your X Ads MCP server URL and its token.' },
  bing: { label: 'Microsoft (Bing)', color: '#008373', url: '', note: 'Paste your Microsoft Ads MCP server URL and its token.' },
  custom: { label: 'Custom MCP', color: '#6b7280', url: '', note: 'Any MCP server that accepts a bearer token over HTTPS.' },
};
const CHANNEL_COLOR = { linkedin: '#0a66c2', google: '#ea4335', meta: '#0866ff', reddit: '#ff4500', x: '#0f1729', bing: '#008373' };
const CHANNEL_LOGO = { linkedin: ['lg-linkedin', '#0A66C2'], google: ['lg-google', '#4285F4'], meta: ['lg-meta', '#0866FF'], reddit: ['lg-reddit', '#FF4500'], x: ['lg-x', '#0f1729'], bing: ['lg-microsoft', ''] };
function channelLogo(key) {
  const m = CHANNEL_LOGO[key];
  if (!m) return `<span class="cdot" style="background:#6b7280"></span>`;
  return `<svg class="lg ch-logo"${m[1] ? ` fill="${m[1]}"` : ''}><use href="#${m[0]}"/></svg>`;
}

// MetadataONE tool map (verified tool names; outputs are normalised defensively).
const MO_TOOLS = ['account_level_stats', 'account_list_performance', 'account_funnel_reports', 'performance_metrics'];

// ----------------------------------------------------------------------- state
let DATA = clone(SAMPLE);
let connectors = load('mo_connectors', []);
const savedLive = load('mo_live', null);
if (savedLive && savedLive.channels) DATA = savedLive;

// ----------------------------------------------------------------- formatting
const usd0 = (n) => '$' + Math.round(n).toLocaleString();
const usdK = (n) => n >= 1e6 ? '$' + (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : '$' + Math.round(n / 1000) + 'K';
const num = (n) => Math.round(n).toLocaleString();
const $ = (id) => document.getElementById(id);
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function load(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

function spark(vals, w = 84, h = 28, color = '#0f9d6b') {
  const min = Math.min(...vals), max = Math.max(...vals), pad = 3;
  const x = (i) => pad + i * (w - 2 * pad) / (vals.length - 1);
  const y = (v) => h - pad - (max === min ? 0.5 : (v - min) / (max - min)) * (h - 2 * pad);
  const d = vals.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}"><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
const ARROW_UP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 15l6-6 6 6"/></svg>`;
const ARROW_DN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6"/></svg>`;
function deltaPill(pct, goodWhenDown = false) {
  if (pct == null || isNaN(pct)) return '';
  const isDown = pct < 0;
  const good = goodWhenDown ? isDown : !isDown;
  return `<span class="delta ${good ? 'up' : 'down'}">${isDown ? ARROW_DN : ARROW_UP}${Math.abs(pct)}%</span>`;
}
function seededSeries(seed, n, base, amp, trend) {
  const a = [];
  for (let i = 0; i < n; i++) a.push(base * (1 + trend * i / n) + amp * Math.sin(i * 1.3 + seed) + amp * 0.5 * Math.sin(i * 0.55 + seed * 2));
  return a;
}

// -------------------------------------------------------------------- renderers
function renderKPIs() {
  const t = DATA.totals || {};
  const cards = [
    { label: 'Ad spend', val: usdK(t.spend || 0), d: t.spendDelta, gdn: false, spk: seededSeries(1, 12, (t.spend || 0) / 30, 1400, 0.5), col: '#64748b' },
    { label: 'Influenced pipeline', val: usdK(t.pipeline || 0), d: t.pipelineDelta, gdn: false, hero: true, mult: t.pipelineMultiple ? t.pipelineMultiple + 'x' : null, spk: seededSeries(2, 12, (t.pipeline || 0) / 30, 8000, 0.7), col: '#ea580c' },
    { label: 'Blended CPL', val: usd0(t.blendedCPL || 0), d: t.cplDelta, gdn: true, spk: seededSeries(3, 12, 150, 12, -0.3), col: '#0f9d6b' },
    { label: 'MQLs', val: num(t.mqls || 0), d: t.mqlsDelta, gdn: false, spk: seededSeries(4, 12, (t.mqls || 0) / 30, 4, 0.6), col: '#0f9d6b' },
    { label: 'Closed-won', val: usdK(t.closedWon || 0), d: t.wonDelta, gdn: false, spk: seededSeries(5, 12, (t.closedWon || 0) / 30, 1200, 0.8), col: '#0f9d6b' },
  ];
  $('kpis').innerHTML = cards.map((k) => `
    <div class="kpi ${k.hero ? 'hero' : ''}">
      <div class="klabel">${k.label}</div>
      <div class="kval">${k.val}</div>
      <div class="krow">
        <span style="display:flex;gap:8px;align-items:center">${deltaPill(k.d, k.gdn)}${k.mult ? `<span class="mult">${k.mult}</span>` : ''}</span>
        ${DATA.source === 'sample' ? spark(k.spk, 84, 28, k.col) : ''}
      </div>
    </div>`).join('');
}

function renderChannels() {
  const chans = DATA.channels || [];
  const maxRoas = Math.max(1, ...chans.map((c) => c.roas || 0));
  $('chanBody').innerHTML = chans.map((c) => `
    <tr>
      <td><div class="ch">${channelLogo(c.key)}<span class="cname">${c.name}</span></div></td>
      <td class="mono">${usd0(c.spend || 0)}</td>
      <td class="mono">$${(c.cpc || 0).toFixed(2)}</td>
      <td class="mono">$${c.cpl || 0}${c.cplDelta != null ? `<span class="chgd ${c.cplDelta < 0 ? 'dn' : 'up'}">${c.cplDelta < 0 ? '▼' : '▲'}${Math.abs(c.cplDelta)}%</span>` : ''}</td>
      <td class="mono">${c.mqls || 0}</td>
      <td class="mono">${usd0(c.pipeline || 0)}</td>
      <td><div class="roascell"><span class="roasbar"><i style="width:${((c.roas || 0) / maxRoas * 100).toFixed(0)}%"></i></span><span class="roasval mono">${(c.roas || 0).toFixed(1)}x</span></div></td>
    </tr>`).join('');
  const sum = (f) => chans.reduce((a, c) => a + (f(c) || 0), 0);
  const t = DATA.totals || {};
  $('chanFoot').innerHTML = `
    <tr>
      <td>Total · ${chans.length} channels</td>
      <td class="mono">${usd0(sum((c) => c.spend))}</td>
      <td class="mono">n/a</td>
      <td class="mono">$${t.blendedCPL || 0}</td>
      <td class="mono">${num(sum((c) => c.mqls))}</td>
      <td class="mono">${usd0(sum((c) => c.pipeline))}</td>
      <td><div class="roascell"><span class="roasval mono" style="color:var(--orange-deep)">${t.pipelineMultiple || 0}x</span></div></td>
    </tr>`;
}

function renderChart() {
  const N = 30, W = 760, H = 210, pl = 46, pr = 8, pt = 12, pb = 24;
  const iw = W - pl - pr, ih = H - pt - pb;
  const t = DATA.totals || {};
  let spend = [], pipe = [];
  if (Array.isArray(DATA.trend) && DATA.trend.length > 1) {
    spend = DATA.trend.map((d) => d.spend || 0);
    pipe = DATA.trend.map((d) => d.pipeline || 0);
  } else {
    for (let i = 0; i < N; i++) {
      const s = ((t.spend || 184200) / N) * (0.74 + 0.5 * i / (N - 1)) * (1 + 0.10 * Math.sin(i * 0.9));
      const mult = 4.0 + 1.4 * i / (N - 1) + 0.25 * Math.sin(i * 1.25 + 1);
      spend.push(s); pipe.push(s * mult);
    }
  }
  const n = spend.length;
  const sMax = Math.max(...spend) * 1.15 || 1, pMax = Math.max(...pipe) * 1.12 || 1;
  const x = (i) => pl + i * iw / (n - 1);
  const yP = (v) => pt + ih - v / pMax * ih;
  const yS = (v) => pt + ih - v / sMax * ih;
  let g = '', ax = '';
  for (let k = 0; k <= 3; k++) { const v = pMax * k / 3, y = yP(v); g += `<line class="gl" x1="${pl}" y1="${y.toFixed(1)}" x2="${W - pr}" y2="${y.toFixed(1)}"/>`; ax += `<text class="axl" x="${pl - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end">${k === 0 ? '$0' : '$' + Math.round(v / 1000) + 'K'}</text>`; }
  ['Day 1', 'Day 15', 'Day 30'].forEach((lb, i) => { const xx = [pl, pl + iw / 2, W - pr][i]; ax += `<text class="axl" x="${xx}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}">${lb}</text>`; });
  $('cgrid').innerHTML = g; $('cax').innerHTML = ax;
  const dP = pipe.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + yP(v).toFixed(1)).join(' ');
  const dS = spend.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + yS(v).toFixed(1)).join(' ');
  $('cPipe').setAttribute('d', dP);
  $('cArea').setAttribute('d', `${dP} L ${x(n - 1).toFixed(1)},${yP(0)} L ${x(0).toFixed(1)},${yP(0)} Z`);
  $('cSpend').setAttribute('d', dS);
}

const GEAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3.2"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 1h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 23h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6A7 7 0 0 0 19 12Z"/></svg>`;
function renderAgents() {
  const feed = $('agentFeed');
  const agents = DATA.agents || [];
  const isLiveNonMeta = DATA.source !== 'sample' && DATA.source && !/metadata/i.test(DATA.source);
  if (!agents.length || isLiveNonMeta) {
    feed.innerHTML = `<div class="empty">The agent layer (rebid, pause, reallocate) runs on <b>MetadataONE</b>. A read-only ad-platform MCP reports numbers but does not act.<br><br><b>${DATA.source === 'sample' ? '' : 'Connected source has no agent activity.'}</b></div>`;
    return;
  }
  feed.innerHTML = agents.map((a) => `
    <div class="agent ${a.status}">
      <div class="aico">${GEAR}</div>
      <div class="abody">
        <div class="aname">${a.agent}
          <span class="${a.status === 'done' ? 'badge-done' : 'badge-pending'}">${a.status === 'done' ? 'Applied' : 'Needs approval'}</span>
          <span class="t">${a.time || ''}</span>
        </div>
        <div class="atext">${a.text || ''}</div>
        ${a.status === 'pending' ? `<div class="aact"><button class="approve">Approve</button><button class="dismiss">Dismiss</button></div>` : ''}
      </div>
    </div>`).join('');
}

function renderState() {
  const live = DATA.source && DATA.source !== 'sample';
  const chip = $('stateChip');
  chip.className = 'chip ' + (live ? 'live' : 'sample');
  $('stateText').textContent = live ? `Live · ${DATA.source}` : 'Sample data';
  $('sourceTag').innerHTML = live
    ? `Live. <b>Pulled from ${DATA.source}${DATA.account && DATA.account !== 'Sample account' ? ' · ' + DATA.account : ''}.</b>`
    : `Sample data. <b>Connect a source to see your own numbers.</b>`;
  const srcMarkup = (label) => `<span class="ld"></span><span>${label}</span>`;
  $('chanSrc').className = 'src' + (live ? '' : ' sample');
  $('chanSrc').innerHTML = srcMarkup(live ? 'Live' : 'Sample');
  $('agentSrc').className = 'src' + (live ? '' : ' sample');
  $('agentSrc').innerHTML = srcMarkup(live ? 'Live' : 'Sample');
  $('footState').textContent = live ? `Live · ${DATA.source}` : 'Showing sample data';
  $('connCount').textContent = connectors.length;
}

function renderAll() { renderKPIs(); renderChannels(); renderChart(); renderAgents(); renderState(); }

// --------------------------------------------------------------- apply live data
function applyLiveData(obj, sourceLabel) {
  if (!obj || !Array.isArray(obj.channels) || !obj.totals) throw new Error('JSON needs a "totals" object and a "channels" array.');
  DATA = Object.assign({ source: sourceLabel || obj.source || 'Live' }, obj);
  if (!DATA.source || DATA.source === 'sample') DATA.source = sourceLabel || 'Live';
  save('mo_live', DATA);
  renderAll();
}
function resetToSample() { DATA = clone(SAMPLE); localStorage.removeItem('mo_live'); renderAll(); toast('Back to sample data.'); }

// ---------------------------------------------------------------- MCP proxy call
async function mcpCall(payload) {
  const r = await fetch('/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  return r.json();
}

// Defensive: pull text/json out of an MCP tools/call result.
function readToolResult(result) {
  if (!result) return null;
  if (result.structuredContent) return result.structuredContent;
  const block = (result.content || []).find((c) => c.type === 'text');
  if (block && block.text) { try { return JSON.parse(block.text); } catch { return block.text; } }
  return result;
}

// ------------------------------------------------------------------ drawer / UI
let view = 'list';
let editingType = 'metadataone';

function openDrawer() { $('scrim').classList.add('show'); $('drawer').classList.add('show'); $('drawer').setAttribute('aria-hidden', 'false'); renderDrawer(); }
function closeDrawer() { $('scrim').classList.remove('show'); $('drawer').classList.remove('show'); $('drawer').setAttribute('aria-hidden', 'true'); view = 'list'; }

function renderDrawer() {
  const body = $('drawerBody');
  if (view === 'add') return renderAddView(body);
  if (view === 'sync') return renderSyncView(body);
  renderListView(body);
}

function renderListView(body) {
  const list = connectors.length ? `<div class="conn-list">${connectors.map(connCard).join('')}</div>`
    : `<div class="empty" style="padding:30px 8px 22px">No sources connected yet.<br><br><b>Add an ad-platform MCP or MetadataONE</b> to replace the sample numbers with your own.</div>`;
  body.innerHTML = `
    ${list}
    <div class="btn-row">
      <button class="bigbtn primary" id="addBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>Add a connection</button>
    </div>
    <div class="btn-row">
      <button class="bigbtn" id="syncBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>Sync via Claude (OAuth MCPs)</button>
    </div>
    ${DATA.source !== 'sample' ? `<div class="btn-row"><button class="bigbtn" id="resetBtn">Reset to sample data</button></div>` : ''}
    <p class="privacy">Direct connect sends your token to this app's serverless proxy only to reach the MCP server for that one request. It is never stored on the server. Tokens you save are kept in this browser only. Tip: for OAuth-only servers like MetadataONE's authorize flow, use Sync via Claude.</p>`;
  $('addBtn').onclick = () => { view = 'add'; editingType = 'metadataone'; renderDrawer(); };
  $('syncBtn').onclick = () => { view = 'sync'; renderDrawer(); };
  if ($('resetBtn')) $('resetBtn').onclick = resetToSample;
  connectors.forEach((c) => wireCard(c));
}

function connCard(c) {
  const tp = TYPES[c.type] || TYPES.custom;
  const stClass = c.status || 'idle';
  const stLabel = { connected: 'Connected', error: 'Error', testing: 'Testing', idle: 'Not tested' }[stClass] || 'Idle';
  return `
    <div class="conn" data-id="${c.id}">
      <div class="top">
        <span class="pdot" style="background:${tp.color}"></span>
        <span class="nm">${c.label || tp.label}</span>
        <span class="st ${stClass}">${stLabel}</span>
      </div>
      <div class="meta">
        <code>${c.serverUrl || 'no URL'}</code>
        ${c.toolCount != null ? `<br>${c.toolCount} tools discovered` : ''}
        ${c.lastError ? `<br><span style="color:var(--bad)">${c.lastError}</span>` : ''}
      </div>
      <div class="row">
        <button class="primary" data-act="test">Test</button>
        <button data-act="pull">Pull data</button>
        <button class="ghost" data-act="remove">Remove</button>
      </div>
    </div>`;
}

function wireCard(c) {
  const el = document.querySelector(`.conn[data-id="${c.id}"]`);
  if (!el) return;
  el.querySelector('[data-act="test"]').onclick = () => testConnector(c.id);
  el.querySelector('[data-act="pull"]').onclick = () => pullConnector(c.id);
  el.querySelector('[data-act="remove"]').onclick = () => { connectors = connectors.filter((x) => x.id !== c.id); save('mo_connectors', connectors); renderDrawer(); renderState(); toast('Connection removed.'); };
}

function renderAddView(body) {
  const opts = Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${k === editingType ? 'selected' : ''}>${v.label}</option>`).join('');
  const tp = TYPES[editingType];
  body.innerHTML = `
    <button class="bigbtn" id="backBtn" style="margin-bottom:16px;justify-content:flex-start;gap:6px">← Back</button>
    <div class="field">
      <label>Source type</label>
      <select id="typeSel">${opts}</select>
      <div class="hint" id="typeNote">${tp.note}</div>
    </div>
    <div class="field">
      <label>MCP server URL</label>
      <input id="urlIn" placeholder="https://..." value="${tp.url || ''}" />
      <div class="hint">The HTTPS endpoint of the MCP server. MetadataONE is pre-filled.</div>
    </div>
    <div class="field">
      <label>Access token</label>
      <input id="tokIn" type="password" placeholder="Bearer token from the platform" />
      <div class="hint">For MetadataONE: Settings, Access Token, Generate Access Token for MCP Server.</div>
    </div>
    <div class="testline" id="testLine"></div>
    <div class="btn-row">
      <button class="bigbtn primary" id="testSave"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l5 5 9-9"/></svg>Test and save</button>
    </div>
    <p class="privacy">If the server uses an OAuth authorize screen rather than a pasteable token (MetadataONE's Add Custom Connector flow does), the direct test will return an auth error. Use <b>Sync via Claude</b> instead, which works with any MCP your Claude is already connected to.</p>`;
  $('backBtn').onclick = () => { view = 'list'; renderDrawer(); };
  $('typeSel').onchange = (e) => { editingType = e.target.value; const t = TYPES[editingType]; $('typeNote').textContent = t.note; $('urlIn').value = t.url || ''; };
  $('testSave').onclick = testAndSave;
}

async function testAndSave() {
  const serverUrl = $('urlIn').value.trim();
  const token = $('tokIn').value.trim();
  const line = $('testLine');
  if (!/^https:\/\//i.test(serverUrl)) { line.className = 'testline show err'; line.textContent = 'Enter a valid https:// server URL.'; return; }
  line.className = 'testline show run'; line.textContent = 'Running the MCP handshake (initialize, then tools/list)...';
  const res = await mcpCall({ serverUrl, token, action: 'connect' });
  const tp = TYPES[editingType];
  const conn = { id: 'c' + Date.now(), type: editingType, label: tp.label, serverUrl, token, status: res.ok ? 'connected' : 'error', toolCount: res.toolCount, tools: res.tools || [], lastError: res.ok ? '' : (res.error || `HTTP ${res.httpStatus || '?'}`), serverInfo: res.serverInfo || null };
  connectors = connectors.filter((x) => !(x.type === conn.type && x.serverUrl === conn.serverUrl));
  connectors.push(conn);
  save('mo_connectors', connectors);
  if (res.ok) {
    line.className = 'testline show ok';
    line.innerHTML = `Connected. ${res.toolCount} tools discovered${res.serverInfo?.name ? ` on ${res.serverInfo.name}` : ''}. Saved. Use <b>Pull data</b> to load your numbers.`;
    setTimeout(() => { view = 'list'; renderDrawer(); renderState(); }, 1400);
  } else {
    line.className = 'testline show err';
    line.innerHTML = `${res.error || 'Connection failed.'}${res.httpStatus ? ` (HTTP ${res.httpStatus})` : ''}<br>Saved as not-connected. If this server uses OAuth, try Sync via Claude.`;
    renderState();
  }
}

async function testConnector(id) {
  const c = connectors.find((x) => x.id === id); if (!c) return;
  c.status = 'testing'; renderDrawer(); connectors.forEach(wireCard);
  const res = await mcpCall({ serverUrl: c.serverUrl, token: c.token, action: 'connect' });
  c.status = res.ok ? 'connected' : 'error'; c.toolCount = res.toolCount; c.tools = res.tools || []; c.lastError = res.ok ? '' : (res.error || `HTTP ${res.httpStatus || '?'}`);
  save('mo_connectors', connectors); renderDrawer(); renderState();
  toast(res.ok ? `Connected. ${res.toolCount} tools.` : `Connection failed: ${res.error || 'auth error'}`);
}

async function pullConnector(id) {
  const c = connectors.find((x) => x.id === id); if (!c) return;
  toast('Pulling your last 30 days...');
  const isMeta = c.type === 'metadataone';
  const toolList = isMeta ? MO_TOOLS : (c.tools || []).map((t) => t.name).filter((n) => /perform|stat|metric|account|campaign|insight/i.test(n)).slice(0, 4);
  if (!toolList.length) { toast('No metrics-style tools found. Try Sync via Claude for a clean mapping.'); return; }
  const results = {};
  for (const name of toolList) {
    const res = await mcpCall({ serverUrl: c.serverUrl, token: c.token, action: 'call', toolName: name, toolArgs: { range: 'last_30_days' } });
    if (res.ok) results[name] = readToolResult(res.result);
  }
  const mapped = mapPull(results);
  if (mapped && mapped.channels && mapped.channels.length) {
    applyLiveData(mapped, c.label);
    closeDrawer();
    toast(`Live. Pulled from ${c.label}.`);
  } else {
    toast('Connected and called the tools, but could not auto-map the fields. Use Sync via Claude for a clean load.');
  }
}

// Best-effort normaliser. Real tool shapes vary, so we map what we recognise and
// fall back gracefully rather than invent numbers.
function mapPull(results) {
  let channels = [], totals = {};
  for (const val of Object.values(results)) {
    const arr = Array.isArray(val) ? val : (val && Array.isArray(val.rows) ? val.rows : (val && Array.isArray(val.channels) ? val.channels : null));
    if (arr && arr.length && (arr[0].spend != null || arr[0].cost != null)) {
      channels = arr.map((r) => ({
        key: (r.key || r.channel || r.platform || r.name || '').toString().toLowerCase().replace(/[^a-z]/g, ''),
        name: r.name || r.channel || r.platform || 'Channel',
        spend: +(r.spend ?? r.cost ?? 0), cpc: +(r.cpc ?? 0), cpl: +(r.cpl ?? r.cpa ?? 0),
        mqls: +(r.mqls ?? r.leads ?? r.conversions ?? 0), pipeline: +(r.pipeline ?? r.influenced_pipeline ?? 0),
        roas: +(r.roas ?? r.pipeline_per_dollar ?? 0), cplDelta: r.cplDelta != null ? +r.cplDelta : null,
      }));
    }
    const obj = val && !Array.isArray(val) ? (val.totals || val) : null;
    if (obj && (obj.spend != null || obj.total_spend != null)) {
      totals = {
        spend: +(obj.spend ?? obj.total_spend ?? 0), pipeline: +(obj.pipeline ?? obj.influenced_pipeline ?? 0),
        blendedCPL: +(obj.blendedCPL ?? obj.cpl ?? 0), mqls: +(obj.mqls ?? obj.leads ?? 0),
        closedWon: +(obj.closedWon ?? obj.closed_won ?? 0),
        pipelineMultiple: obj.pipelineMultiple != null ? +obj.pipelineMultiple : null,
      };
    }
  }
  if (channels.length && !totals.spend) totals.spend = channels.reduce((a, c) => a + c.spend, 0);
  if (channels.length && !totals.pipeline) totals.pipeline = channels.reduce((a, c) => a + c.pipeline, 0);
  if (totals.spend && totals.pipeline && !totals.pipelineMultiple) totals.pipelineMultiple = +(totals.pipeline / totals.spend).toFixed(1);
  return channels.length ? { totals, channels, agents: [] } : null;
}

// ------------------------------------------------------------- Sync via Claude
const SCHEMA_PROMPT = `Using the MCP connectors I already have linked in this chat (MetadataONE, or my ad-platform MCPs), pull my last 30 days and return ONLY this JSON, no prose:

{
  "source": "MetadataONE",
  "account": "<account name>",
  "totals": { "spend": 0, "spendDelta": 0, "pipeline": 0, "pipelineDelta": 0, "pipelineMultiple": 0, "blendedCPL": 0, "cplDelta": 0, "mqls": 0, "mqlsDelta": 0, "closedWon": 0, "wonDelta": 0 },
  "channels": [
    { "key": "linkedin", "name": "LinkedIn", "spend": 0, "cpc": 0, "cpl": 0, "mqls": 0, "pipeline": 0, "roas": 0, "cplDelta": 0 }
  ],
  "trend": [ { "spend": 0, "pipeline": 0 } ],
  "agents": [ { "agent": "Bid Agent", "status": "done", "time": "today", "text": "<what it did>" } ]
}

Rules: one channels row per platform I run. roas means pipeline per dollar. Deltas are percent vs the prior 30 days. Leave agents empty if the source is a read-only ad-platform MCP.`;

function renderSyncView(body) {
  body.innerHTML = `
    <button class="bigbtn" id="backBtn2" style="margin-bottom:16px;justify-content:flex-start;gap:6px">← Back</button>
    <p class="lede" style="margin-bottom:14px">Works with any MCP your Claude is already connected to, including OAuth-only servers. Copy the prompt, run it in that chat, paste the JSON back.</p>
    <div class="field">
      <label>1. Copy this into your connected Claude chat</label>
      <div class="codebox" id="promptBox">${SCHEMA_PROMPT.replace(/</g, '&lt;')}<button class="copybtn" id="copyPrompt">Copy</button></div>
    </div>
    <div class="field">
      <label>2. Paste the JSON Claude returns</label>
      <textarea id="jsonIn" placeholder='{ "source": "MetadataONE", "totals": { ... }, "channels": [ ... ] }'></textarea>
      <div class="testline" id="syncLine"></div>
    </div>
    <div class="btn-row"><button class="bigbtn primary" id="applyJson">Load into dashboard</button></div>`;
  $('backBtn2').onclick = () => { view = 'list'; renderDrawer(); };
  $('copyPrompt').onclick = () => { copy(SCHEMA_PROMPT); toast('Prompt copied. Paste it into your connected Claude chat.'); };
  $('applyJson').onclick = () => {
    const line = $('syncLine');
    try {
      const obj = JSON.parse($('jsonIn').value.trim());
      applyLiveData(obj, obj.source || 'Live');
      line.className = 'testline show ok'; line.textContent = 'Loaded. The dashboard is now live.';
      setTimeout(closeDrawer, 900);
    } catch (e) { line.className = 'testline show err'; line.textContent = 'That is not valid JSON: ' + e.message; }
  };
}

// ----------------------------------------------------------------------- ask bar
function buildPrompt(q) {
  return `Using my connected MCP data (MetadataONE or my ad-platform MCPs), answer this about my last 30 days of paid media, then give me the move:\n\n"${q}"\n\nIf it changes the numbers, also return the updated dashboard JSON.`;
}
function wireAsk() {
  const input = $('askInput');
  const fire = () => { const q = input.value.trim(); if (!q) return; copy(buildPrompt(q)); toast('Prompt copied. Paste it into your connected Claude chat.'); input.value = ''; };
  $('askSend').onclick = fire;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') fire(); });
  const chips = ['Why is ROAS down this week?', 'Pause anything losing money', 'Which channel returns the most pipeline per dollar?'];
  $('askchips').innerHTML = chips.map((c) => `<span>${c}</span>`).join('');
  $('askchips').querySelectorAll('span').forEach((s) => s.onclick = () => { input.value = s.textContent; fire(); });
}

// -------------------------------------------------------------------- utilities
function copy(text) { try { navigator.clipboard.writeText(text); } catch {} }
let toastT;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2600); }

// --------------------------------------------------------------------- segmented
function wireSeg() {
  $('seg').querySelectorAll('button').forEach((b) => b.onclick = () => {
    $('seg').querySelectorAll('button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    if (DATA.source === 'sample') toast('Sample data shows the 30-day view. Connect a source to switch ranges.');
    else toast('Re-pull from your source to change the range.');
  });
}

// -------------------------------------------------------------------------- init
$('connBtn').onclick = openDrawer;
$('drawerClose').onclick = closeDrawer;
$('scrim').onclick = closeDrawer;
wireAsk(); wireSeg(); renderAll();
