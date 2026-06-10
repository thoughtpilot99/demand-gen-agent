/* ──────────────────────────────────────────────────────────────────────────
   The Demand Gen Agent: interactive guide logic.
   Data is grounded in Metadata's own docs:
     help.metadata.io/portal/articles/metadata-mcp-supported-tools  (70 tools)
     help.metadata.io/portal/articles/metadata-mcp-how-to-connect   (setup)
     metadataone.com                                                (demo prompt)
   Nothing here phones home. The .env generator builds text in your browser only.
   ────────────────────────────────────────────────────────────────────────── */

const CATEGORIES = [
  "Campaign Management", "Budget & Financial", "Audience Building", "Target Groups",
  "Creative & Ads", "Offers & Lead Gen", "Keywords", "Experiments & Performance",
  "Account Insights", "Segments", "Funnel & Analytics", "Integrations",
  "ABM & Account Lists", "Intent Topics",
];

// c = category index, n = real tool name, w = mutates spend/state (write), d = one-liner
const TOOLS = [
  { c:0, n:"create_campaign", w:true,  d:"Stand up a new campaign." },
  { c:0, n:"launch_campaign", w:true,  d:"Take a drafted campaign live." },
  { c:0, n:"manage_campaign", w:true,  d:"Pause, resume, or edit a campaign. The agent's pause + rebid run through this." },
  { c:0, n:"search_campaigns_by_names", w:false, d:"Find campaigns by name." },
  { c:0, n:"add_elements_to_campaign", w:true, d:"Attach ads, audiences, or offers to a campaign." },
  { c:0, n:"add_exclusion_audiences_to_campaign", w:true, d:"Exclude audiences from a campaign." },

  { c:1, n:"create_budget_group", w:true,  d:"Create a budget group." },
  { c:1, n:"get_budget_group", w:false, d:"Read one budget group." },
  { c:1, n:"budget_group_performance", w:false, d:"Performance of a budget group." },
  { c:1, n:"list_budget_groups", w:false, d:"List budget groups." },
  { c:1, n:"update_experiments_daily_budgets", w:true, d:"Move daily budget. The agent's budget moves run through this." },

  { c:2, n:"create_firmographic_audience", w:true, d:"Audience by company attributes." },
  { c:2, n:"create_technographic_audience", w:true, d:"Audience by tech stack." },
  { c:2, n:"create_bombora_audience", w:true, d:"Intent audience from Bombora surge data." },
  { c:2, n:"create_g2_metadata_dynamic_audience", w:true, d:"Dynamic audience from G2 buyer intent." },
  { c:2, n:"create_retargeting_audience", w:true, d:"Audience from site visitors." },
  { c:2, n:"create_audience_from_segment", w:true, d:"Audience from an existing segment." },
  { c:2, n:"get_audience_details", w:false, d:"Read an audience." },
  { c:2, n:"get_deep_audience_details", w:false, d:"Full audience breakdown." },
  { c:2, n:"get_matched_audiences", w:false, d:"MetaMatch-resolved audiences." },
  { c:2, n:"get_retargeting_audiences", w:false, d:"List retargeting audiences." },

  { c:3, n:"create_target_group", w:true, d:"Create a target group." },
  { c:3, n:"estimate_target_group", w:false, d:"Estimate a target group's reach." },
  { c:3, n:"update_target_group", w:true, d:"Edit a target group." },
  { c:3, n:"list_target_groups", w:false, d:"List target groups." },
  { c:3, n:"retrieve_target_group_by_id", w:false, d:"Read one target group." },
  { c:3, n:"search_target_group_criteria", w:false, d:"Search targeting criteria." },

  { c:4, n:"create_update_ads", w:true, d:"Create or edit ads." },
  { c:4, n:"search_ads_by_names", w:false, d:"Find ads by name." },
  { c:4, n:"get_ad_details", w:false, d:"Read one ad." },
  { c:4, n:"generate_brand_creative", w:true, d:"Generate on-brand creative variants." },
  { c:4, n:"edit_brand_creative", w:true, d:"Edit generated creative." },
  { c:4, n:"generate_brand_kit", w:true, d:"Build a brand kit." },
  { c:4, n:"get_brand_kit", w:false, d:"Read your brand kit." },
  { c:4, n:"update_brand_kit", w:true, d:"Update your brand kit." },
  { c:4, n:"upload_image", w:true, d:"Upload an image asset." },
  { c:4, n:"search_library_images_by_name", w:false, d:"Find library images." },
  { c:4, n:"fetch_creative_details", w:false, d:"Read creative details." },

  { c:5, n:"create_update_offer", w:true, d:"Create or edit a lead-gen offer or landing page." },
  { c:5, n:"get_offer", w:false, d:"Read an offer." },

  { c:6, n:"create_keywords", w:true, d:"Add keywords." },
  { c:6, n:"create_negative_keywords_list", w:true, d:"Add a negative keyword list." },
  { c:6, n:"list_keywords", w:false, d:"List keywords." },
  { c:6, n:"list_negative_keywords_list", w:false, d:"List negative keyword lists." },

  { c:7, n:"experiment_performance_stats", w:false, d:"Per-experiment performance." },
  { c:7, n:"search_experiments", w:false, d:"Find experiments." },
  { c:7, n:"experiments_keywords_stats", w:false, d:"Keyword-level experiment stats." },
  { c:7, n:"performance_metrics", w:false, d:"Core performance read. The agent's pacing checks start here." },

  { c:8, n:"get_account_summary_insights", w:false, d:"Account summary insights." },
  { c:8, n:"get_account_timeline_insights", w:false, d:"Insights over time." },
  { c:8, n:"get_account_conversions_insights", w:false, d:"Conversion insights." },
  { c:8, n:"get_account_opportunities_insights", w:false, d:"Pipeline / opportunity insights." },
  { c:8, n:"get_insights_report", w:false, d:"Pull an insights report." },
  { c:8, n:"search_insights_criteria_fields", w:false, d:"Search insight fields." },

  { c:9, n:"create_segment", w:true, d:"Create a segment." },
  { c:9, n:"list_segments", w:false, d:"List segments." },
  { c:9, n:"get_segment_criteria", w:false, d:"Read segment criteria." },

  { c:10, n:"account_funnel_reports", w:false, d:"Full-funnel reporting." },
  { c:10, n:"account_level_stats", w:false, d:"Account-level stats." },
  { c:10, n:"account_list_performance", w:false, d:"Performance by account list." },
  { c:10, n:"deep_funnel_stats", w:false, d:"Deep funnel breakdown." },
  { c:10, n:"demographic_country_stats", w:false, d:"Stats by country." },
  { c:10, n:"website_engagement_stats", w:false, d:"Site engagement stats." },

  { c:11, n:"connect_channel", w:true, d:"Connect an ad channel." },
  { c:11, n:"disconnect_channel", w:true, d:"Disconnect an ad channel." },
  { c:11, n:"connect_crm", w:true, d:"Connect your CRM." },
  { c:11, n:"get_integrations_status", w:false, d:"Check what's connected." },

  { c:12, n:"get_abm_account_lists", w:false, d:"Read ABM account lists." },

  { c:13, n:"get_intent_topics", w:false, d:"List intent topics to target." },
];

// Prompts. "official" = quoted verbatim from Metadata. "example" = grounded in real
// tools, written for this agent. Each tags the tools/agents it triggers.
const PROMPTS = [
  // Connect & verify — official
  { job:"connect", official:true, text:"Which account am I currently connected with?", triggers:"Confirms the connection, returns your account" },
  { job:"connect", official:true, text:"Which tools do I have available?", triggers:"Lists every tool your tenant exposes" },
  { job:"connect", official:true, text:"What are some questions I can ask?", triggers:"Metadata's own suggested starting points" },
  // Plan a campaign — official
  { job:"plan", official:true, text:"You are the CMO of ServiceNow. Generate assets in parallel: 5 audiences, 5 brand ad creatives, 5 landing page offers. Setup the entire campaign in draft to spend $1M this quarter. DON'T LAUNCH.", triggers:"create_firmographic_audience · generate_brand_creative · create_update_offer · create_campaign" },
  { job:"plan", official:true, text:"Spin up a multi-channel campaign across LinkedIn and Meta for the Q2 Security Webinar offer. Daily budget $500, audience the SIEM Bombora intent group I built yesterday.", triggers:"create_campaign · add_elements_to_campaign" },
  { job:"plan", official:true, text:"Launch the Q2 Security Webinar campaign. Cap is $30K for the month.", triggers:"launch_campaign" },
  // Read & diagnose — official
  { job:"read", official:true, text:"Show me granular performance for every ad in the Q2 webinar campaign.", triggers:"experiment_performance_stats · performance_metrics" },
  { job:"read", official:true, text:"Summarize the engagement and pipeline for Acme Corp.", triggers:"get_account_summary_insights" },
  { job:"read", official:false, text:"How are we pacing today? Pull performance and show me spend, CPL, and pipeline by channel.", triggers:"performance_metrics · account_level_stats · agent example" },
  // Manage spend — official
  { job:"act", official:true, text:"Pause every campaign with zero conversions in the last 14 days.", triggers:"search_campaigns_by_names → manage_campaign" },
  { job:"act", official:true, text:"Set up a budget group for the Q2 security campaigns. $50K monthly cap. Optimize for pipeline.", triggers:"create_budget_group" },
  { job:"act", official:true, text:"How is the Q2 security budget group performing this month?", triggers:"budget_group_performance" },
  { job:"act", official:false, text:"Move $3k/day from the worst pipeline-per-dollar channel to the best.", triggers:"update_experiments_daily_budgets · gated, agent example" },
  // Build audiences & creative — official
  { job:"build", official:true, text:"Build an audience of US-based SaaS companies, 200 to 2,000 employees, $50M+ in revenue.", triggers:"create_firmographic_audience" },
  { job:"build", official:true, text:"Build an audience of companies using Salesforce CRM and Snowflake.", triggers:"create_technographic_audience" },
  { job:"build", official:true, text:"Build an audience of mid-market security buyers showing Bombora intent on SIEM in the last 30 days.", triggers:"create_bombora_audience" },
  { job:"build", official:true, text:"Build a G2 Decision-stage audience for the CRM software category.", triggers:"create_g2_metadata_dynamic_audience" },
  { job:"build", official:true, text:"Generate a LinkedIn single-image creative for our security webinar. Brand kit colors. Hero text: 'See your account graph in 15 minutes.'", triggers:"generate_brand_creative · get_brand_kit" },
];

const JOBS = [
  { k:"all", label:"All" },
  { k:"connect", label:"Connect & verify" },
  { k:"read", label:"Read & diagnose" },
  { k:"act", label:"Manage spend" },
  { k:"build", label:"Build audiences & creative" },
  { k:"plan", label:"Plan a campaign" },
];

// ── helpers ──────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const old = btn.textContent; btn.textContent = "Copied"; setTimeout(() => (btn.textContent = old), 1400);
  });
}

// ── tool browser ─────────────────────────────────────────────────────────────
let toolCat = -1; // -1 = all
function renderTools() {
  const grid = $("toolGrid"); if (!grid) return;
  const q = ($("toolSearch")?.value || "").trim().toLowerCase();
  const rows = TOOLS.filter((t) => (toolCat < 0 || t.c === toolCat) && (!q || t.n.includes(q) || t.d.toLowerCase().includes(q)));
  grid.innerHTML = rows
    .map(
      (t) => `<div class="tool ${t.w ? "w" : "r"}">
        <div class="tn mono">${esc(t.n)}</div>
        <div class="td">${esc(t.d)}</div>
        <span class="tag ${t.w ? "write" : "read"}">${t.w ? "write" : "read"}</span>
      </div>`,
    )
    .join("");
  const c = $("toolCount"); if (c) c.textContent = `${rows.length} of ${TOOLS.length} shown`;
}
function initTools() {
  const chips = $("toolCats");
  if (chips) {
    chips.innerHTML =
      `<button class="chip on" data-c="-1">All</button>` +
      CATEGORIES.map((name, i) => `<button class="chip" data-c="${i}">${name}</button>`).join("");
    chips.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      toolCat = +b.dataset.c;
      [...chips.children].forEach((x) => x.classList.toggle("on", x === b));
      renderTools();
    });
  }
  $("toolSearch")?.addEventListener("input", renderTools);
  renderTools();
}

// ── prompt library ───────────────────────────────────────────────────────────
let promptJob = "all";
function renderPrompts() {
  const list = $("promptList"); if (!list) return;
  const rows = PROMPTS.filter((p) => promptJob === "all" || p.job === promptJob);
  list.innerHTML = rows
    .map(
      (p) => `<div class="pcard">
        <div class="pmeta">
          <span class="ptag ${p.official ? "off" : "ex"}">${p.official ? "Official · Metadata" : "Day-1 example"}</span>
          <button class="copy sm">Copy</button>
        </div>
        <div class="ptext">${esc(p.text)}</div>
        <div class="ptrig"><span>Triggers</span> ${esc(p.triggers)}</div>
      </div>`,
    )
    .join("");
  list.querySelectorAll(".copy").forEach((btn, i) => btn.addEventListener("click", () => copyText(rows[i].text, btn)));
}
function initPrompts() {
  const f = $("promptFilters");
  if (f) {
    f.innerHTML = JOBS.map((j, i) => `<button class="chip ${i === 0 ? "on" : ""}" data-k="${j.k}">${j.label}</button>`).join("");
    f.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      promptJob = b.dataset.k;
      [...f.children].forEach((x) => x.classList.toggle("on", x === b));
      renderPrompts();
    });
  }
  renderPrompts();
}

// ── .env generator ───────────────────────────────────────────────────────────
function buildEnv() {
  const v = (id, fb) => ($(id)?.value || "").trim() || fb;
  const out = `# Generated in your browser. Nothing here was sent anywhere.
ANTHROPIC_API_KEY=${v("g_anthropic", "sk-ant-...")}
AGENT_MODEL=claude-opus-4-8
AGENT_EFFORT=high

METADATAONE_MCP_URL=https://mcp-server.metadata.io/mcp
METADATAONE_TOKEN=${v("g_metaToken", "")}
MCP_TOOL_PERFORMANCE=performance_metrics
MCP_TOOL_MANAGE_CAMPAIGN=manage_campaign
MCP_TOOL_UPDATE_BUDGETS=update_experiments_daily_budgets

SLACK_BOT_TOKEN=${v("g_slackBot", "xoxb-...")}
SLACK_APP_TOKEN=${v("g_slackApp", "xapp-...")}
SLACK_SIGNING_SECRET=${v("g_slackSecret", "")}
SLACK_CHANNEL=${v("g_channel", "#paid-media")}

AUTO_APPROVE_DAILY_USD=${v("g_autoApprove", "2000")}
MAX_DAILY_SHIFT_USD=20000
CPL_CEILING_USD=${v("g_cpl", "140")}

PACING_CRON=*/15 7-19 * * 1-5
WEEKLY_CRON=0 9 * * 1
TIMEZONE=America/New_York`;
  const o = $("envOut"); if (o) o.textContent = out;
}
function initEnv() {
  ["g_anthropic", "g_metaToken", "g_slackBot", "g_slackApp", "g_slackSecret", "g_channel", "g_autoApprove", "g_cpl"]
    .forEach((id) => $(id)?.addEventListener("input", buildEnv));
  $("envCopy")?.addEventListener("click", () => copyText($("envOut").textContent, $("envCopy")));
  buildEnv();
}

// ── setup wizard (progress persists locally) ─────────────────────────────────
function initWizard() {
  const steps = [...document.querySelectorAll(".wstep")];
  if (!steps.length) return;
  const KEY = "dga_wizard";
  let done = {};
  try { done = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
  const bar = $("wizBar"), pct = $("wizPct");
  function paint() {
    steps.forEach((s) => {
      const k = s.dataset.k;
      s.classList.toggle("done", !!done[k]);
      const cb = s.querySelector(".wcheck"); if (cb) cb.checked = !!done[k];
    });
    const n = steps.filter((s) => done[s.dataset.k]).length;
    const p = Math.round((n / steps.length) * 100);
    if (bar) bar.style.width = p + "%";
    if (pct) pct.textContent = `${n} of ${steps.length} done`;
  }
  steps.forEach((s) => {
    s.querySelector(".whead")?.addEventListener("click", (e) => {
      if (e.target.classList.contains("wcheck")) return;
      s.classList.toggle("open");
    });
    s.querySelector(".wcheck")?.addEventListener("change", (e) => {
      done[s.dataset.k] = e.target.checked;
      localStorage.setItem(KEY, JSON.stringify(done));
      paint();
    });
  });
  paint();
}

// ── generic copy buttons (prompt blocks etc.) ────────────────────────────────
function initCopies() {
  document.querySelectorAll(".prompt .copy").forEach((btn) => {
    btn.addEventListener("click", () => {
      const block = btn.closest(".prompt").cloneNode(true);
      block.querySelectorAll(".tagp,.copy").forEach((n) => n.remove());
      copyText(block.textContent.trim(), btn);
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initTools();
  initPrompts();
  initEnv();
  initWizard();
  initCopies();
});
