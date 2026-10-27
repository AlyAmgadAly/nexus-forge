import {
  esc, cardHtml, toast, openModal, modalConfirm, copyText, regionLabel, regionColor,
} from '../ui.js';
import {
  apiGet, apiPost, apiPut, apiPatch, apiDelete, getAdminToken, setAdminToken,
} from '../api.js';

const ALL_REGIONS = ['Demacia', 'Freljord', 'Ionia', 'Noxus', 'PiltoverZaun', 'ShadowIsles', 'Bilgewater', 'Targon', 'Shurima', 'BandleCity'];
const STATUSES = ['', 'auto', 'curated', 'custom', 'manual', 'none', 'partial'];
const TYPES = ['', 'Unit', 'Spell', 'Landmark', 'Equipment'];
let tab = 'dashboard';
let auth = 'unknown';
let authPromise = null;
let tokenError = '';
let stats = null;
let statsLoading = false;
let adminError = '';
let cardsFilters = { q: '', status: '', type: '', set: '', page: 1 };
let cardsData = null;
let cardsLoading = false;
let cardsError = '';
let scriptTarget = null;
let scriptText = '';
let scriptStatus = 'custom';
let scriptValidation = null;
let scriptLoading = false;
let scriptError = '';
let picker = { q: '', status: 'manual', data: null, loading: false, error: '' };
let settingsData = null;
let settingsLoading = false;
let settingsError = '';
let mechanicsData = null;
let keywordsData = null;
let mechanicsLoading = false;

function isAuthed() { return auth === 'ok'; }

async function ensureAuth() {
  const token = getAdminToken();
  if (!token) { auth = 'none'; return false; }
  if (auth === 'ok') return true;
  if (auth === 'pending' && authPromise) return authPromise;
  auth = 'pending';
  authPromise = apiPost('/api/admin/login', { token }, { token })
    .then(() => { auth = 'ok'; tokenError = ''; return true; })
    .catch(() => { auth = 'none'; setAdminToken(''); tokenError = 'That token was rejected. Read the current token from data/settings.json.'; return false; })
    .finally(() => { authPromise = null; });
  return authPromise;
}

async function loadStats(root, ctx) {
  if (statsLoading) return;
  statsLoading = true;
  adminError = '';
  try { stats = await apiGet('/api/admin/stats', { admin: true }); }
  catch (err) { adminError = err.message || 'Could not load admin stats.'; }
  finally {
    statsLoading = false;
    if (root.isConnected) renderAdmin(root, ctx);
  }
}

async function loadCards(root, ctx) {
  if (cardsLoading) return;
  cardsLoading = true;
  cardsError = '';
  try {
    const params = new URLSearchParams({ page: cardsFilters.page, limit: 40 });
    if (cardsFilters.q) params.set('q', cardsFilters.q);
    if (cardsFilters.status) params.set('status', cardsFilters.status);
    if (cardsFilters.type) params.set('type', cardsFilters.type);
    if (cardsFilters.set) params.set('set', cardsFilters.set);
    cardsData = await apiGet(`/api/admin/cards?${params}`, { admin: true });
  } catch (err) { cardsError = err.message || 'Could not load cards.'; }
  finally {
    cardsLoading = false;
    if (root.isConnected) renderAdmin(root, ctx);
  }
}

async function loadScript(root, ctx, id) {
  scriptLoading = true;
  scriptError = '';
  scriptValidation = null;
  try {
    const data = await apiGet(`/api/admin/scripts/${encodeURIComponent(id)}`, { admin: true });
    scriptTarget = data.card;
    scriptText = data.entry?.script ? JSON.stringify(data.entry.script, null, 2)
      : data.card.script ? JSON.stringify(data.card.script, null, 2) : '';
    scriptStatus = data.entry?.status || data.card.scriptStatus || 'custom';
  } catch (err) {
    scriptError = err.message || 'Could not load that script.';
  } finally {
    scriptLoading = false;
    if (root.isConnected) renderAdmin(root, ctx);
  }
}

async function loadPicker(root, ctx) {
  picker.loading = true;
  picker.error = '';
  try {
    const params = new URLSearchParams({ limit: 24 });
    if (picker.q) params.set('q', picker.q);
    if (picker.status) params.set('status', picker.status);
    picker.data = await apiGet(`/api/admin/cards?${params}`, { admin: true });
  } catch (err) { picker.error = err.message || 'Could not load cards.'; }
  finally {
    picker.loading = false;
    if (root.isConnected) renderAdmin(root, ctx);
  }
}

async function loadSettings(root, ctx) {
  if (settingsLoading) return;
  settingsLoading = true;
  settingsError = '';
  try { settingsData = await apiGet('/api/admin/settings', { admin: true }); }
  catch (err) { settingsError = err.message || 'Could not load settings.'; }
  finally {
    settingsLoading = false;
    if (root.isConnected) renderAdmin(root, ctx);
  }
}

async function loadMechanics(root, ctx) {
  if (mechanicsLoading) return;
  mechanicsLoading = true;
  try {
    const [mech, keys] = await Promise.all([
      apiGet('/api/admin/mechanics', { admin: true }),
      apiGet('/api/admin/keywords', { admin: true }),
    ]);
    mechanicsData = mech.mechanics || [];
    keywordsData = keys.custom || [];
  } catch (err) { adminError = err.message || 'Could not load mechanics.'; }
  finally {
    mechanicsLoading = false;
    if (root.isConnected) renderAdmin(root, ctx);
  }
}

function loginView(root, ctx) {
  root.innerHTML = `<div class=\"admin-login-wrap\">
    <div class=\"panel admin-login\">
      <div class=\"brand\" style=\"margin-bottom:20px\"><span class=\"brand-mark\">✦</span><span><span class=\"brand-name\">CARD FORGE</span><br><span class=\"brand-sub\">Administrator access</span></span></div>
      <h2>Unlock the forge</h2>
      <p class=\"muted small\">The admin token lives in <code>data/settings.json</code> on this machine. The server also prints it in the console on startup.</p>
      ${tokenError ? `<div class=\"notice warn small mb\">${esc(tokenError)}</div>` : ''}
      <div class=\"field mb\"><label class=\"label\" for=\"admin-token\">Admin token</label><input class=\"input\" id=\"admin-token\" type=\"password\" placeholder=\"Paste the token\" autocomplete=\"off\"></div>
      <label class=\"check mb\"><input type=\"checkbox\" id=\"admin-remember\"> Remember on this device</label>
      <button class=\"btn btn-primary btn-block\" id=\"admin-login\">Enter the forge</button>
      <div class=\"row between mt\"><a href=\"#/\" class=\"small muted\">← Back to the table</a><span class=\"tag\">Local only</span></div>
    </div>
  </div>`;
  const input = root.querySelector('#admin-token');
  input?.focus();
  const submit = async () => {
    const token = input?.value.trim();
    if (!token) { input?.focus(); return; }
    try {
      await apiPost('/api/admin/login', { token }, { token });
      setAdminToken(token, root.querySelector('#admin-remember')?.checked);
      auth = 'ok';
      tokenError = '';
      stats = null;
      cardsData = null;
      renderAdmin(root, ctx);
    } catch (err) {
      tokenError = err.message || 'Invalid admin token.';
      renderAdmin(root, ctx);
    }
  };
  root.querySelector('#admin-login')?.addEventListener('click', submit);
  input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

function tabsHtml() {
  const defs = [
    ['dashboard', 'Overview', '◆'],
    ['cards', 'Cards', '▤'],
    ['scripts', 'Scripts', '⌘'],
    ['mechanics', 'Mechanics', '⚙'],
    ['settings', 'Settings', '☷'],
  ];
  return defs.map(([id, label, icon]) => `<button class=\"admin-tab ${tab === id ? 'active' : ''}\" data-admin-tab=\"${id}\"><span>${icon}</span>${label}</button>`).join('');
}

function dashboardHtml(state) {
  if (statsLoading && !stats) return '<div class=\"admin-loading\"><div class=\"loader\"></div><div class=\"small muted\">Reading the forge…</div></div>';
  if (!stats) return `<div class=\"notice warn\">${esc(adminError || 'No stats available.')}</div><button class=\"btn btn-ghost\" id=\"admin-retry-stats\">Retry</button>`;
  const s = stats.stats || {};
  const bySet = s.bySet || {};
  const statusCounts = stats.statusCounts || {};
  const totalSets = Object.keys(bySet).length;
  const custom = (stats.customCards || 0);
  return `
    <div class=\"admin-hero\">
      <div><div class=\"eyebrow\">Card forge</div><h1>${esc(state.meta?.name || 'Nexus Forge')} control room</h1><p class=\"muted\">Every card, script, and rule in one place. Changes rebuild the card pool immediately.</p></div>
      <div class=\"row wrap\"><button class=\"btn btn-primary\" id=\"admin-new-card\">＋ Create a card</button><a class=\"btn btn-ghost\" href=\"#/\" target=\"_blank\">Open the table ↗</a></div>
    </div>
    ${adminError ? `<div class=\"notice warn mb\">${esc(adminError)}</div>` : ''}
    <div class=\"admin-stats\">
      <div class=\"stat-card\"><span>Collectible cards</span><strong>${esc(s.total ?? 0)}</strong><small>${esc(s.enabled ?? 0)} enabled in the pool</small></div>
      <div class=\"stat-card\"><span>Scripts present</span><strong>${esc(stats.coverage ?? 0)}%</strong><small>${esc(stats.scriptedWithText ?? 0)} of ${esc(stats.textCards ?? 0)} text cards have a script</small></div>
      <div class=\"stat-card\"><span>Verified effects</span><strong>${esc(stats.verifiedCoverage ?? 0)}%</strong><small>${esc(stats.verified ?? 0)} of ${esc(stats.textCards ?? 0)} text cards verified</small></div>
      <div class=\"stat-card\"><span>Custom cards</span><strong>${esc(custom)}</strong><small>forged on this server</small></div>
      <div class=\"stat-card\"><span>Starter + user decks</span><strong>${esc(stats.decks ?? 0)}</strong><small>${esc(totalSets)} sets imported</small></div>
    </div>
    <div class=\"admin-grid\">
      <div class=\"panel\">
        <div class=\"panel-head\"><h3>Script status</h3><span class=\"tag\">collectible</span></div>
        <div class=\"panel-body\">
          ${Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).map(([status, count]) => `<div class=\"status-bar-row\"><span class=\"status-name\">${esc(status)}</span><div class=\"status-track\"><span style=\"width:${s.total ? Math.max(2, (count / s.total) * 100) : 0}%\"></span></div><strong>${esc(count)}</strong></div>`).join('') || '<div class=\"muted small\">No script statuses.</div>'}
          <div class=\"notice small mt\">Scripts present are not necessarily verified. Generated scripts are unverified; manual cards use the tabletop tools. You can review any card from the <strong>Scripts</strong> tab.</div>
        </div>
      </div>
      <div class=\"panel\">
        <div class=\"panel-head\"><h3>Sets</h3><span class=\"tag\">${esc(totalSets)}</span></div>
        <div class=\"panel-body scroll-thin\" style=\"max-height:330px\">
          ${Object.entries(bySet).sort((a, b) => a[0].localeCompare(b[0])).map(([set, info]) => `<div class=\"row between small\" style=\"padding:5px 0;border-bottom:1px solid var(--line)\"><span>${esc(set)}</span><span class=\"muted2\">${info.enabled}/${info.total} enabled · ${info.scripted} scripted</span></div>`).join('')}
        </div>
      </div>
      <div class=\"panel\">
        <div class=\"panel-head\"><h3>Recent custom cards</h3><a href=\"#\" data-admin-tab=\"cards\" class=\"small gold\">See all →</a></div>
        <div class=\"panel-body\">
          ${stats.recentCustomCards?.length ? stats.recentCustomCards.map((c) => `<div class=\"row between small\"><span>${esc(c.name)}</span><span class=\"tag\">${esc(c.type || 'card')}</span></div>`).join('') : '<div class=\"muted small\">No custom cards yet. Forge one and it appears in every deck builder immediately.</div>'}
          <div class=\"row mt\"><button class=\"btn btn-sm btn-teal\" id=\"admin-new-card-2\">Forge a new card</button></div>
        </div>
      </div>
      <div class=\"panel\">
        <div class=\"panel-head\"><h3>Quick actions</h3></div>
        <div class=\"panel-body stack\">
          <button class=\"btn btn-ghost\" data-admin-tab=\"cards\">Search and enable / disable cards</button>
          <button class=\"btn btn-ghost\" data-admin-tab=\"scripts\">Attach a script to a card</button>
          <button class=\"btn btn-ghost\" data-admin-tab=\"mechanics\">Create a reusable mechanic</button>
          <button class=\"btn btn-ghost\" data-admin-tab=\"settings\">Change rules and pool</button>
        </div>
      </div>
    </div>
    <div class=\"notice mt small\">Admin token: <code>${esc(stats.settings?.adminToken || '')}</code> · keep this private. It is stored in <code>data/settings.json</code>.</div>
  `;
}

function cardsHtml(state) {
  if (cardsLoading && !cardsData) return '<div class=\"admin-loading\"><div class=\"loader\"></div><div class=\"small muted\">Searching the archive…</div></div>';
  const data = cardsData;
  const sets = state.meta?.sets || [];
  const setCodes = Array.isArray(sets) ? sets.map((s) => typeof s === 'string' ? s : s?.code || s?.set || s?.nameRef || s?.name).filter(Boolean) : [];
  return `
    <div class=\"row between wrap mb\"><div><div class=\"eyebrow\">Archive</div><h1>Card pool</h1><div class=\"muted small\">Enable, disable, inspect, and forge cards. ${data ? `${esc(data.total)} matching` : ''}</div></div><button class=\"btn btn-primary\" id=\"admin-new-card\">＋ Create card</button></div>
    <div class=\"panel mb\">
      <div class=\"panel-body\">
        <form class=\"admin-filters\" id=\"admin-card-filters\">
          <div class=\"field\"><label class=\"label\">Search</label><input class=\"input input-sm\" id=\"ac-q\" value=\"${esc(cardsFilters.q)}\" placeholder=\"Name, text, or card ID…\"></div>
          <div class=\"field\"><label class=\"label\">Script status</label><select class=\"select input-sm\" id=\"ac-status\">${STATUSES.map((s) => `<option value=\"${s}\" ${cardsFilters.status === s ? 'selected' : ''}>${s || 'Any status'}</option>`).join('')}</select></div>
          <div class=\"field\"><label class=\"label\">Type</label><select class=\"select input-sm\" id=\"ac-type\">${TYPES.map((t) => `<option value=\"${t}\" ${cardsFilters.type === t ? 'selected' : ''}>${t || 'Any type'}</option>`).join('')}</select></div>
          <div class=\"field\"><label class=\"label\">Set</label><select class=\"select input-sm\" id=\"ac-set\"><option value=\"\">Any set</option>${[...new Set(setCodes)].sort().map((s) => `<option value=\"${esc(s)}\" ${cardsFilters.set === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
          <div class=\"field\" style=\"justify-content:flex-end\"><button class=\"btn btn-primary btn-sm\" type=\"submit\">Apply filters</button></div>
        </form>
      </div>
    </div>
    ${cardsError ? `<div class=\"notice warn mb\">${esc(cardsError)}</div>` : ''}
    <div class=\"panel\">
      <div class=\"admin-table-wrap\">
        <table class=\"admin-table\">
          <thead><tr><th>Card</th><th>Type</th><th>Regions</th><th>Script</th><th>Pool</th><th></th></tr></thead>
          <tbody>
            ${data?.cards?.length ? data.cards.map((card) => `<tr data-card-row=\"${esc(card.id)}\">
              <td><div class=\"admin-card-cell\"><div class=\"mini-art\" style=\"background-image:url('/art/${encodeURIComponent(card.id)}')\"></div><div><strong>${esc(card.name)}</strong><br><span class=\"tiny muted2\">${esc(card.id)} · ${esc(card.cost)} mana${card.source === 'custom' ? ' · <span class=\"gold\">custom</span>' : ''}</span></div></div></td>
              <td class=\"small\">${esc(card.type || '')}${card.supertype ? `<br><span class=\"tiny muted2\">${esc(card.supertype)}</span>` : ''}</td>
              <td>${(card.regions || []).map((r) => `<span class=\"region-chip mini\"><span class=\"region-dot\" style=\"background:${regionColor(r)}\"></span>${esc(regionLabel(r))}</span>`).join(' ')}</td>
              <td><span class=\"status-pill status-${esc(card.scriptStatus || 'none')}\">${esc(card.scriptStatus || 'none')}</span></td>
              <td><label class=\"switch\" title=\"${card.enabled ? 'Enabled' : 'Disabled'}\"><input type=\"checkbox\" data-toggle-card=\"${esc(card.id)}\" ${card.enabled ? 'checked' : ''}><span></span></label></td>
              <td><div class=\"row\" style=\"justify-content:flex-end;gap:4px\"><button class=\"btn btn-xs btn-ghost\" data-edit-script=\"${esc(card.id)}\">Script</button>${card.source === 'custom' ? `<button class=\"btn btn-xs btn-ghost\" data-edit-card=\"${esc(card.id)}\">Edit</button><button class=\"btn btn-xs btn-danger\" data-delete-card=\"${esc(card.id)}\">Delete</button>` : ''}</div></td>
            </tr>`).join('') : `<tr><td colspan=\"6\"><div class=\"empty-state\"><div class=\"icon\">▤</div><div><strong>No cards match.</strong></div></div></td></tr>`}
          </tbody>
        </table>
      </div>
      <div class=\"panel-body row between\">
        <div class=\"small muted\">Page ${esc(data?.page || 1)} of ${esc(data?.pages || 1)} · ${esc(data?.total || 0)} cards</div>
        <div class=\"row\"><button class=\"btn btn-sm btn-ghost\" id=\"admin-prev\" ${!data || data.page <= 1 ? 'disabled' : ''}>← Previous</button><button class=\"btn btn-sm btn-ghost\" id=\"admin-next\" ${!data || data.page >= data.pages ? 'disabled' : ''}>Next →</button></div>
      </div>
    </div>`;
}

function pickerHtml() {
  return `
    <div class=\"row between wrap mb\"><div><div class=\"eyebrow\">Automation</div><h1>Script workshop</h1><div class=\"muted small\">Attach a data-driven script to any card. Cards without a script stay playable through tabletop tools. <a class=\"gold\" href=\"https://github.com/AlyAmgadAly/nexus-forge/blob/main/docs/effect-dsl.md\" target=\"_blank\" rel=\"noopener\">DSL reference ↗</a></div></div></div>
    <div class=\"panel mb\"><div class=\"panel-body\"><form class=\"admin-filters\" id=\"script-picker-form\">
      <div class=\"field grow\"><label class=\"label\">Find a card</label><input class=\"input input-sm\" id=\"script-picker-q\" value=\"${esc(picker.q)}\" placeholder=\"Card name or ID…\"></div>
      <div class=\"field\"><label class=\"label\">Status</label><select class=\"select input-sm\" id=\"script-picker-status\"><option value=\"\">Any</option>${STATUSES.filter(Boolean).map((s) => `<option value=\"${s}\" ${picker.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class=\"field\" style=\"justify-content:flex-end\"><button class=\"btn btn-primary btn-sm\" type=\"submit\">Search</button></div>
    </form></div></div>
    ${picker.loading ? '<div class=\"admin-loading\"><div class=\"loader\"></div></div>' : ''}
    ${picker.error ? `<div class=\"notice warn\">${esc(picker.error)}</div>` : ''}
    ${picker.data?.cards?.length ? `<div class=\"panel\"><div class=\"panel-body\"><div class=\"admin-card-picker\">${picker.data.cards.map((c) => `<button class=\"picker-tile\" data-pick-script=\"${esc(c.id)}\"><div class=\"picker-art\" style=\"background-image:url('/art/${encodeURIComponent(c.id)}')\"></div><div class=\"picker-meta\"><strong>${esc(c.name)}</strong><span class=\"status-pill status-${esc(c.scriptStatus || 'none')}\">${esc(c.scriptStatus || 'none')}</span></div></button>`).join('')}</div></div></div>` : (!picker.loading ? '<div class=\"empty-state\"><div class=\"icon\">⌘</div><div><strong>No cards found.</strong></div><div class=\"small muted\">Try a different search or status.</div></div>' : '')}
    <div class=\"notice mt small\">The script language is the same one documented in the DSL guide: triggers such as <code>play</code>, <code>summon</code>, <code>strike</code>, <code>roundStart</code>, and actions such as <code>damage</code>, <code>buff</code>, <code>draw</code>, <code>summon</code>, <code>grantKeyword</code>.</div>`;
}

function scriptHtml() {
  if (scriptLoading && !scriptTarget) return '<div class=\"admin-loading\"><div class=\"loader\"></div><div class=\"small muted\">Opening the script…</div></div>';
  if (!scriptTarget) return pickerHtml();
  const card = scriptTarget;
  return `
    <div class=\"row between wrap mb\"><div><button class=\"btn btn-sm btn-ghost\" id=\"script-back\">← All scripts</button><h1>${esc(card.name)}</h1><div class=\"muted small\">${esc(card.id)} · ${esc(card.type)} · ${esc(card.cost)} mana · <span class=\"status-pill status-${esc(scriptStatus)}\">${esc(scriptStatus)}</span></div></div><div class=\"row\"><button class=\"btn btn-ghost btn-sm\" id=\"script-example\">Load example</button><button class=\"btn btn-danger btn-sm\" id=\"script-delete\">Remove script</button></div></div>
    ${scriptError ? `<div class=\"notice warn mb\">${esc(scriptError)}</div>` : ''}
    <div class=\"script-layout\">
      <div class=\"panel\">
        <div class=\"panel-head\"><h3>Effect script</h3><span class=\"tag\">JSON DSL</span></div>
        <div class=\"panel-body\">
          <textarea class=\"code-editor\" id=\"script-editor\" spellcheck=\"false\" placeholder=\"{\\n  \\\"triggers\\\": []\\n}\">${esc(scriptText)}</textarea>
          <div class=\"row between mt\"><div class=\"small muted\">Trigger on play, summon, strike, death, roundStart, aura…</div><div class=\"row\"><button class=\"btn btn-sm btn-ghost\" id=\"script-validate\">Validate</button><button class=\"btn btn-sm btn-primary\" id=\"script-save\">Save script</button></div></div>
          <div class=\"mt\" id=\"script-validation\">${scriptValidation ? renderValidation(scriptValidation) : ''}</div>
        </div>
      </div>
      <aside class=\"stack\">
        <div class=\"panel\"><div class=\"panel-body\"><div class=\"card-admin-preview\" style=\"grid-template-columns:120px 1fr\">${cardHtml(card, { compact: true, noTooltip: true })}<div><strong>${esc(card.name)}</strong><div class=\"small muted\" style=\"white-space:pre-wrap;margin-top:5px\">${esc(card.text || 'No text.')}</div></div></div></div></div>
        <div class=\"panel\"><div class=\"panel-head\"><h3>Trigger reference</h3></div><div class=\"panel-body small muted\" style=\"line-height:1.8\"><code>play</code> · <code>summon</code> · <code>attack</code> · <code>strike</code> · <code>nexusStrike</code> · <code>death</code> · <code>allyDeath</code> · <code>enemyDeath</code> · <code>roundStart</code> · <code>roundEnd</code> · <code>surviveDamage</code> · <code>castSpell</code> · <code>enemySpell</code> · <code>levelUp</code> · <code>transform</code> · <code>aura</code></div></div>
        <div class=\"panel\"><div class=\"panel-head\"><h3>Example</h3></div><div class=\"panel-body\"><pre class=\"code-hint\">{\n  \"triggers\": [{\n    \"on\": \"play\",\n    \"actions\": [{\n      \"type\": \"damage\",\n      \"target\": { \"type\": \"enemyUnit\" },\n      \"amount\": 2\n    }]\n  }]\n}</pre></div></div>
      </aside>
    </div>`;
}

function renderValidation(v) {
  return `<div class=\"stack\">${(v.errors || []).length ? `<div class=\"notice warn small\"><strong>Errors</strong><br>${v.errors.map(esc).join('<br>')}</div>` : ''}${(v.warnings || []).length ? `<div class=\"notice gold small\"><strong>Warnings</strong><br>${v.warnings.map(esc).join('<br>')}</div>` : ''}${v.ok ? '<div class=\"notice small\" style=\"border-color:rgba(116,214,147,.3);color:#bff7cd\">Script shape is valid.</div>' : ''}</div>`;
}

function mechanicsHtml(state) {
  if (mechanicsLoading && !mechanicsData) return '<div class=\"admin-loading\"><div class=\"loader\"></div><div class=\"small muted\">Loading mechanics…</div></div>';
  const builtinKeywords = state.meta?.keywords || [];
  return `
    <div class=\"row between wrap mb\"><div><div class=\"eyebrow\">Extensions</div><h1>Mechanics & keywords</h1><div class=\"muted small\">Reusable trigger templates and custom keyword labels for your forged cards.</div></div><button class=\"btn btn-primary\" id=\"new-mechanic\">＋ New mechanic</button></div>
    <div class=\"notice gold small mb\">Custom mechanics are stored as reusable JSON trigger templates. Copy their triggers into a card script, or select one while forging a custom card. The engine only executes built-in action types — use Tabletop tools for anything outside the DSL.</div>
    <div class=\"admin-grid\">
      <div class=\"panel\">
        <div class=\"panel-head\"><h3>Custom mechanics</h3><span class=\"tag\">${mechanicsData?.length || 0}</span></div>
        <div class=\"panel-body\">
          ${mechanicsData?.length ? mechanicsData.map((m) => `<div class=\"mechanic-row\"><div><strong>${esc(m.name)}</strong><div class=\"small muted\">${esc(m.description || '')}</div><div class=\"tiny muted2\">${esc(m.id || '')}</div></div><div class=\"row\"><button class=\"btn btn-xs btn-ghost\" data-edit-mechanic=\"${esc(m.id)}\">Edit</button><button class=\"btn btn-xs btn-danger\" data-delete-mechanic=\"${esc(m.id)}\">Delete</button></div></div>`).join('') : '<div class=\"empty-state\" style=\"padding:24px\"><div class=\"icon\">⚙</div><div><strong>No custom mechanics yet.</strong></div><div class=\"small muted\">Make a reusable trigger template for cards.</div></div>'}
          <div class=\"row mt\"><button class=\"btn btn-teal btn-sm\" id=\"new-mechanic-2\">Create mechanic</button></div>
        </div>
      </div>
      <div class=\"panel\">
        <div class=\"panel-head\"><h3>Custom keywords</h3><span class=\"tag\">${keywordsData?.length || 0}</span></div>
        <div class=\"panel-body\">
          ${keywordsData?.length ? keywordsData.map((k) => `<div class=\"row between\" style=\"padding:6px 0;border-bottom:1px solid var(--line)\"><div><strong class=\"small\">${esc(k.name)}</strong><div class=\"tiny muted\">${esc(k.description || '')}</div></div><button class=\"btn btn-xs btn-danger\" data-delete-keyword=\"${esc(k.name)}\">Remove</button></div>`).join('') : '<div class=\"muted small\">No custom keywords. Built-in keywords below come from the card data.</div>'}
          <button class=\"btn btn-sm btn-ghost mt\" id=\"new-keyword\">＋ New keyword</button>
        </div>
      </div>
    </div>
    <div class=\"panel mt\"><div class=\"panel-head\"><h3>Built-in keywords</h3><span class=\"tag\">${builtinKeywords.length}</span></div><div class=\"panel-body row wrap\">${builtinKeywords.slice(0, 80).map((k) => `<span class=\"keyword\" title=\"${esc(k.description || '')}\">${esc(k.name || k)}</span>`).join('')}</div></div>
  `;
}

function settingsHtml(state) {
  if (settingsLoading && !settingsData) return '<div class=\"admin-loading\"><div class=\"loader\"></div><div class=\"small muted\">Reading settings…</div></div>';
  const s = settingsData?.settings || {};
  const rules = settingsData?.rules || state.meta?.rules || {};
  const ruleLabels = {
    deckSize: 'Deck size', maxCopies: 'Max copies per card', maxRegions: 'Max regions',
    handStart: 'Opening hand', handMax: 'Hand limit', boardMax: 'Board limit',
    nexus1v1: '1v1 Nexus health', nexus2v2: '2v2 Nexus health', spellManaCap: 'Spell mana cap', maxMana: 'Max mana',
  };
  const sets = Object.keys(stats?.stats?.bySet || {}).sort();
  return `
    <div class=\"row between wrap mb\"><div><div class=\"eyebrow\">Configuration</div><h1>Rules & data</h1><div class=\"muted small\">These settings apply to new games and new deck validation. Existing games keep their starting rules.</div></div><button class=\"btn btn-ghost\" id=\"admin-export\">Export data</button></div>
    ${settingsError ? `<div class=\"notice warn mb\">${esc(settingsError)}</div>` : ''}
    <div class=\"admin-grid\">
      <div class=\"panel\">
        <div class=\"panel-head\"><h3>Game</h3></div>
        <div class=\"panel-body\">
          <div class=\"field mb\"><label class=\"label\">Table name</label><input class=\"input\" id=\"set-game-name\" maxlength=\"40\" value=\"${esc(s.gameName || 'Nexus Forge')}\"></div>
          <div class=\"form-grid\">${Object.entries(ruleLabels).map(([key, label]) => `<div class=\"field\"><label class=\"label\">${esc(label)}</label><input class=\"input\" type=\"number\" min=\"0\" id=\"rule-${key}\" value=\"${esc(rules[key] ?? '')}\"></div>`).join('')}</div>
          <div class=\"row mt\"><button class=\"btn btn-primary\" id=\"save-settings\">Save game settings</button></div>
        </div>
      </div>
      <div class=\"panel\">
        <div class=\"panel-head\"><h3>Admin token</h3><span class=\"tag gold\">secret</span></div>
        <div class=\"panel-body\">
          <div class=\"field mb\"><label class=\"label\">Current token</label><div class=\"row\"><input class=\"input input-sm\" readonly value=\"${esc(s.adminToken || '')}\" id=\"current-admin-token\"><button class=\"btn btn-sm btn-ghost\" id=\"copy-admin-token\">Copy</button></div></div>
          <div class=\"field mb\"><label class=\"label\">Replace token</label><input class=\"input\" id=\"new-admin-token\" placeholder=\"Leave blank to keep the current token\" autocomplete=\"off\"></div>
          <div class=\"notice small\">Changing the token signs out other admin tabs. The token is also stored in <code>data/settings.json</code>.</div>
          <button class=\"btn btn-ghost btn-sm mt\" id=\"logout-admin\">Sign out of this tab</button>
        </div>
      </div>
      <div class=\"panel\">
        <div class=\"panel-head\"><h3>Pool controls</h3><span class=\"tag\">bulk</span></div>
        <div class=\"panel-body\">
          <p class=\"small muted\">Enable or disable whole groups of cards. Deck builder and public card pool update instantly. Disabling a card already in a deck does not delete the deck, but it stops validating.</p>
          <div class=\"form-grid\">
            <div class=\"field\"><label class=\"label\">Group by</label><select class=\"select\" id=\"bulk-kind\"><option value=\"set\">Set</option><option value=\"region\">Region</option><option value=\"rarity\">Rarity</option></select></div>
            <div class=\"field\"><label class=\"label\">Values</label><input class=\"input\" id=\"bulk-values\" placeholder=\"set1, set2 or Demacia\"></div>
          </div>
          <div class=\"row mt\"><button class=\"btn btn-sm btn-teal\" id=\"bulk-enable\">Enable matching</button><button class=\"btn btn-sm btn-danger\" id=\"bulk-disable\">Disable matching</button></div>
          <div class=\"tiny muted2 mt\">Known sets: ${sets.slice(0, 12).map(esc).join(', ')}${sets.length > 12 ? '…' : ''}. Regions: ${ALL_REGIONS.map(regionLabel).join(', ')}.</div>
        </div>
      </div>
      <div class=\"panel\">
        <div class=\"panel-head\"><h3>Backup</h3></div>
        <div class=\"panel-body\"><p class=\"small muted\">Download custom cards, scripts, mechanics, keywords, non-starter decks, and settings as JSON. Keep a copy before large edits.</p><button class=\"btn btn-primary btn-sm\" id=\"admin-export-2\">Download export</button><div class=\"notice small mt\">The admin token is omitted from exports.</div></div>
      </div>
    </div>`;
}

export function renderAdmin(root, ctx) {
  const { state } = ctx;
  if (auth === 'unknown') {
    if (root.isConnected) root.innerHTML = '<div class=\"admin-loading\"><div class=\"loader\"></div><div class=\"small muted\">Checking the forge key…</div></div>';
    ensureAuth().then(() => { if (root.isConnected) renderAdmin(root, ctx); });
    return;
  }
  if (auth === 'pending') {
    root.innerHTML = '<div class=\"admin-loading\"><div class=\"loader\"></div><div class=\"small muted\">Checking the forge key…</div></div>';
    return;
  }
  if (auth !== 'ok') { loginView(root, ctx); return; }

  if (tab === 'dashboard' && !stats && !statsLoading) loadStats(root, ctx);
  if (tab === 'cards' && !cardsData && !cardsLoading) loadCards(root, ctx);
  if (tab === 'cards' && !mechanicsData && !mechanicsLoading) loadMechanics(root, ctx);
  if (tab === 'scripts' && !scriptTarget && !picker.data && !picker.loading) loadPicker(root, ctx);
  if (tab === 'settings' && !settingsData && !settingsLoading) loadSettings(root, ctx);
  if (tab === 'mechanics' && !mechanicsData && !mechanicsLoading) loadMechanics(root, ctx);

  let body = '';
  if (tab === 'dashboard') body = dashboardHtml(state);
  else if (tab === 'cards') body = cardsHtml(state);
  else if (tab === 'scripts') body = scriptHtml();
  else if (tab === 'mechanics') body = mechanicsHtml(state);
  else if (tab === 'settings') body = settingsHtml(state);

  root.innerHTML = `<div class=\"admin-shell\">
    <div class=\"admin-top\">
      <div><div class=\"eyebrow\">Forge access</div><h1 class=\"admin-title\">Card Forge</h1></div>
      <div class=\"row wrap\"><a class=\"btn btn-sm btn-ghost\" href=\"#/\">Table ↗</a><button class=\"btn btn-sm btn-ghost\" id=\"admin-logout-top\">Sign out</button></div>
    </div>
    <div class=\"admin-tabs\">${tabsHtml()}</div>
    <div class=\"admin-content\" id=\"admin-content\">${body}</div>
  </div>`;

  root.querySelectorAll('[data-admin-tab]').forEach((el) => el.addEventListener('click', (e) => {
    e.preventDefault();
    const next = el.dataset.adminTab;
    if (!next) return;
    tab = next;
    if (tab === 'scripts') { scriptTarget = null; picker.data = null; }
    renderAdmin(root, ctx);
  }));
  const logout = () => {
    setAdminToken('');
    auth = 'none';
    stats = null;
    cardsData = null;
    settingsData = null;
    mechanicsData = null;
    keywordsData = null;
    scriptTarget = null;
    picker.data = null;
    tab = 'dashboard';
    renderAdmin(root, ctx);
  };
  root.querySelector('#admin-logout-top')?.addEventListener('click', logout);
  root.querySelector('#logout-admin')?.addEventListener('click', logout);
  root.querySelector('#admin-retry-stats')?.addEventListener('click', () => { stats = null; loadStats(root, ctx); });
  root.querySelector('#admin-new-card')?.addEventListener('click', () => openCustomCard(root, ctx));
  root.querySelector('#admin-new-card-2')?.addEventListener('click', () => openCustomCard(root, ctx));

  // Cards
  root.querySelector('#admin-card-filters')?.addEventListener('submit', (e) => {
    e.preventDefault();
    cardsFilters = {
      q: root.querySelector('#ac-q')?.value || '',
      status: root.querySelector('#ac-status')?.value || '',
      type: root.querySelector('#ac-type')?.value || '',
      set: root.querySelector('#ac-set')?.value || '',
      page: 1,
    };
    cardsData = null;
    loadCards(root, ctx);
  });
  root.querySelector('#admin-prev')?.addEventListener('click', () => { cardsFilters.page = Math.max(1, (cardsData?.page || 1) - 1); cardsData = null; loadCards(root, ctx); });
  root.querySelector('#admin-next')?.addEventListener('click', () => { cardsFilters.page = (cardsData?.page || 1) + 1; cardsData = null; loadCards(root, ctx); });
  root.querySelectorAll('[data-toggle-card]').forEach((el) => el.addEventListener('change', async () => {
    const id = el.dataset.toggleCard;
    try {
      await apiPatch(`/api/admin/cards/${encodeURIComponent(id)}`, { enabled: el.checked });
      const card = (cardsData?.cards || []).find((c) => c.id === id);
      if (card) card.enabled = el.checked;
      await ctx.refreshPool();
      toast(`${id} ${el.checked ? 'enabled' : 'disabled'}.`, 'success');
      stats = null;
    } catch (err) { toast(err.message || 'Could not update the card.', 'error'); el.checked = !el.checked; }
  }));
  root.querySelectorAll('[data-edit-script]').forEach((el) => el.addEventListener('click', () => {
    tab = 'scripts'; scriptTarget = null; scriptLoading = true; renderAdmin(root, ctx);
    loadScript(root, ctx, el.dataset.editScript);
  }));
  root.querySelectorAll('[data-edit-card]').forEach((el) => el.addEventListener('click', () => {
    const card = (cardsData?.cards || []).find((c) => c.id === el.dataset.editCard);
    if (card) openCustomCard(root, ctx, card);
  }));
  root.querySelectorAll('[data-delete-card]').forEach((el) => el.addEventListener('click', async () => {
    const card = (cardsData?.cards || []).find((c) => c.id === el.dataset.deleteCard);
    const ok = await modalConfirm('Delete custom card?', `Delete “${card?.name || el.dataset.deleteCard}”? Existing decks that use it will stop validating.`, { danger: true, confirmLabel: 'Delete card' });
    if (!ok) return;
    try {
      await apiDelete(`/api/admin/cards/${encodeURIComponent(el.dataset.deleteCard)}`);
      cardsData = null; stats = null;
      await ctx.refreshPool();
      toast('Custom card deleted.', 'success');
      loadCards(root, ctx);
    } catch (err) { toast(err.message || 'Could not delete the card.', 'error'); }
  }));

  // Script picker
  root.querySelector('#script-picker-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    picker.q = root.querySelector('#script-picker-q')?.value || '';
    picker.status = root.querySelector('#script-picker-status')?.value || '';
    picker.data = null;
    loadPicker(root, ctx);
  });
  root.querySelectorAll('[data-pick-script]').forEach((el) => el.addEventListener('click', () => {
    scriptTarget = null; scriptLoading = true; scriptText = ''; scriptValidation = null; renderAdmin(root, ctx);
    loadScript(root, ctx, el.dataset.pickScript);
  }));
  root.querySelector('#script-back')?.addEventListener('click', () => { tab = 'scripts'; scriptTarget = null; picker.data = null; renderAdmin(root, ctx); });
  root.querySelector('#script-editor')?.addEventListener('input', (e) => { scriptText = e.target.value; });
  root.querySelector('#script-example')?.addEventListener('click', () => {
    scriptText = JSON.stringify({
      triggers: [{
        on: 'play',
        actions: [{ type: 'damage', target: { type: 'enemyUnit' }, amount: 2 }],
      }],
    }, null, 2);
    scriptValidation = null;
    renderAdmin(root, ctx);
  });
  root.querySelector('#script-validate')?.addEventListener('click', async () => {
    try {
      const result = await apiPost('/api/admin/scripts/validate', { script: scriptText }, { admin: true });
      scriptValidation = result;
      renderAdmin(root, ctx);
    } catch (err) { toast(err.message || 'Could not validate the script.', 'error'); }
  });
  root.querySelector('#script-save')?.addEventListener('click', async () => {
    try {
      const data = await apiPut(`/api/admin/scripts/${encodeURIComponent(scriptTarget.id)}`, { script: scriptText, status: 'custom' }, { admin: true });
      scriptText = data.entry?.script ? JSON.stringify(data.entry.script, null, 2) : scriptText;
      scriptStatus = data.entry?.status || 'custom';
      scriptTarget = data.card;
      scriptValidation = null;
      stats = null; cardsData = null;
      await ctx.refreshPool();
      toast('Script saved and card pool rebuilt.', 'success');
      renderAdmin(root, ctx);
    } catch (err) {
      toast(err.message || 'Could not save the script.', 'error');
      if (err.data?.validation) scriptValidation = err.data.validation;
      renderAdmin(root, ctx);
    }
  });
  root.querySelector('#script-delete')?.addEventListener('click', async () => {
    const ok = await modalConfirm('Remove script?', 'The card will fall back to manual resolution. Other custom scripts are untouched.', { danger: true, confirmLabel: 'Remove script' });
    if (!ok) return;
    try {
      await apiDelete(`/api/admin/scripts/${encodeURIComponent(scriptTarget.id)}`, { admin: true });
      scriptText = ''; scriptStatus = 'manual'; scriptTarget = { ...scriptTarget, scriptStatus: 'manual', script: null };
      stats = null; cardsData = null;
      await ctx.refreshPool();
      toast('Script removed.', 'success');
      renderAdmin(root, ctx);
    } catch (err) { toast(err.message || 'Could not remove the script.', 'error'); }
  });

  // Settings
  root.querySelector('#save-settings')?.addEventListener('click', async () => {
    const rules = {};
    for (const key of ['deckSize', 'maxCopies', 'maxRegions', 'handStart', 'handMax', 'boardMax', 'nexus1v1', 'nexus2v2', 'spellManaCap', 'maxMana']) {
      const v = root.querySelector(`#rule-${key}`)?.value;
      if (v !== undefined && v !== '') rules[key] = Number(v);
    }
    const body = { gameName: root.querySelector('#set-game-name')?.value || 'Nexus Forge', rules };
    const token = root.querySelector('#new-admin-token')?.value.trim();
    if (token) body.adminToken = token;
    try {
      const data = await apiPut('/api/admin/settings', body, { admin: true });
      settingsData = data;
      if (token) setAdminToken(token, true);
      stats = null;
      await ctx.refreshMeta();
      await ctx.refreshPool();
      toast('Settings saved. New games use the new rules.', 'success');
      renderAdmin(root, ctx);
    } catch (err) { toast(err.message || 'Could not save settings.', 'error'); }
  });
  root.querySelector('#copy-admin-token')?.addEventListener('click', async () => {
    await copyText(root.querySelector('#current-admin-token')?.value || '');
    toast('Admin token copied.', 'success');
  });
  root.querySelector('#bulk-enable')?.addEventListener('click', () => bulkPool(root, ctx, true));
  root.querySelector('#bulk-disable')?.addEventListener('click', () => bulkPool(root, ctx, false));
  root.querySelector('#admin-export')?.addEventListener('click', () => exportAdminData(root, ctx));
  root.querySelector('#admin-export-2')?.addEventListener('click', () => exportAdminData(root, ctx));

  // Mechanics
  root.querySelector('#new-mechanic')?.addEventListener('click', () => openMechanicModal(root, ctx));
  root.querySelector('#new-mechanic-2')?.addEventListener('click', () => openMechanicModal(root, ctx));
  root.querySelectorAll('[data-edit-mechanic]').forEach((el) => el.addEventListener('click', () => {
    const m = (mechanicsData || []).find((x) => x.id === el.dataset.editMechanic);
    openMechanicModal(root, ctx, m);
  }));
  root.querySelectorAll('[data-delete-mechanic]').forEach((el) => el.addEventListener('click', async () => {
    const ok = await modalConfirm('Delete mechanic?', 'This removes the reusable template. Existing card scripts are not changed.', { danger: true, confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await apiDelete(`/api/admin/mechanics/${encodeURIComponent(el.dataset.deleteMechanic)}`, { admin: true });
      mechanicsData = null;
      loadMechanics(root, ctx);
      toast('Mechanic removed.', 'success');
    } catch (err) { toast(err.message || 'Could not remove the mechanic.', 'error'); }
  }));
  root.querySelector('#new-keyword')?.addEventListener('click', () => openKeywordModal(root, ctx));
  root.querySelectorAll('[data-delete-keyword]').forEach((el) => el.addEventListener('click', async () => {
    try {
      await apiDelete(`/api/admin/keywords/${encodeURIComponent(el.dataset.deleteKeyword)}`, { admin: true });
      keywordsData = null;
      loadMechanics(root, ctx);
      toast('Keyword removed.', 'success');
    } catch (err) { toast(err.message || 'Could not remove the keyword.', 'error'); }
  }));
}

async function bulkPool(root, ctx, enabled) {
  const kind = root.querySelector('#bulk-kind')?.value;
  const values = (root.querySelector('#bulk-values')?.value || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!values.length) { toast('Enter one or more values separated by commas.', 'error'); return; }
  const ok = await modalConfirm(enabled ? 'Enable matching cards?' : 'Disable matching cards?', `${enabled ? 'Enable' : 'Disable'} every collectible card whose ${kind} matches: ${values.join(', ')}.`, { danger: !enabled, confirmLabel: enabled ? 'Enable' : 'Disable' });
  if (!ok) return;
  try {
    await apiPost('/api/admin/pool/bulk', { kind, values, enabled }, { admin: true });
    stats = null;
    await ctx.refreshPool();
    toast(`${enabled ? 'Enabled' : 'Disabled'} matching cards.`, 'success');
    loadStats(root, ctx);
  } catch (err) { toast(err.message || 'Could not update the pool.', 'error'); }
}

async function exportAdminData(root, ctx) {
  try {
    const data = await apiGet('/api/admin/export', { admin: true });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus-forge-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Export downloaded.', 'success');
  } catch (err) { toast(err.message || 'Could not export data.', 'error'); }
}

function openCustomCard(root, ctx, card = null) {
  const editing = !!card;
  const regionList = [...ALL_REGIONS];
  const selectedRegions = (card?.regions || []).filter((r) => ALL_REGIONS.includes(r));
  const body = `<div class=\"form-grid\">
    <div class=\"field full\"><label class=\"label\">Name</label><input class=\"input\" id=\"cc-name\" maxlength=\"60\" value=\"${esc(card?.name || '')}\" placeholder=\"Card name\"></div>
    <div class=\"field\"><label class=\"label\">Mana cost</label><input class=\"input\" type=\"number\" min=\"0\" max=\"20\" id=\"cc-cost\" value=\"${esc(card?.cost ?? 0)}\"></div>
    <div class=\"field\"><label class=\"label\">Type</label><select class=\"select\" id=\"cc-type\">${TYPES.filter(Boolean).map((t) => `<option ${card?.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class=\"field\"><label class=\"label\">Attack</label><input class=\"input\" type=\"number\" id=\"cc-attack\" value=\"${esc(card?.attack ?? 0)}\"></div>
    <div class=\"field\"><label class=\"label\">Health</label><input class=\"input\" type=\"number\" id=\"cc-health\" value=\"${esc(card?.health ?? 0)}\"></div>
    <div class=\"field\"><label class=\"label\">Supertype</label><select class=\"select\" id=\"cc-supertype\"><option value=\"\">None</option><option value=\"Champion\" ${card?.supertype === 'Champion' ? 'selected' : ''}>Champion</option></select></div>
    <div class=\"field\"><label class=\"label\">Spell speed</label><select class=\"select\" id=\"cc-speed\"><option value=\"\">—</option>${['Burst', 'Fast', 'Slow', 'Focus'].map((s) => `<option ${card?.spellSpeed === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    <div class=\"field full\"><label class=\"label\">Regions <span class=\"tiny muted2\">(choose up to 2; none = neutral)</span></label><div class=\"row wrap\" style=\"gap:8px 14px\">${regionList.map((r) => `<label class=\"check\"><input type=\"checkbox\" data-region=\"${esc(r)}\" ${selectedRegions.includes(r) ? 'checked' : ''}><span class=\"region-dot\" style=\"background:${regionColor(r)}\"></span>${esc(regionLabel(r))}</label>`).join('')}</div></div>
    <div class=\"field full\"><label class=\"label\">Subtypes</label><input class=\"input\" id=\"cc-subtypes\" value=\"${esc((card?.subtypes || []).join(', '))}\" placeholder=\"e.g. Elnuk, Yordle\"></div>
    <div class=\"field full\"><label class=\"label\">Keywords</label><input class=\"input\" id=\"cc-keywords\" value=\"${esc((card?.keywords || []).join(', '))}\" placeholder=\"Barrier, Quick Attack, Overwhelm\"></div>
    <div class=\"field full\"><label class=\"label\">Card text</label><textarea class=\"textarea\" id=\"cc-text\" placeholder=\"What does the card do?\">${esc(card?.text || '')}</textarea></div>
    <div class=\"field full\"><label class=\"label\">Level-up condition</label><textarea class=\"textarea\" id=\"cc-levelup\" placeholder=\"Optional\">${esc(card?.levelup || '')}</textarea></div>
    <div class=\"field full\"><label class=\"label\">Flavor</label><input class=\"input\" id=\"cc-flavor\" value=\"${esc(card?.flavor || '')}\"></div>
    <div class=\"field full\"><label class=\"label\">Card art</label><div class=\"row\" style=\"align-items:center;gap:10px\"><div class=\"cc-art-preview\" id=\"cc-art-preview\" style=\"background-image:url('${esc(`/art/${card?.id || ''}`)}')\"></div><input type=\"file\" id=\"cc-art-file\" accept=\"image/png,image/jpeg,image/webp\" class=\"input\" style=\"padding:7px\"><input type=\"hidden\" id=\"cc-art\" value=\"${esc(card?.art || '')}\"></div><div class=\"tiny muted2 mt\">Upload a PNG/JPEG/WebP up to 8 MB. Without art, a generated rune placeholder is used.</div></div>
    <div class=\"field\"><label class=\"check\"><input type=\"checkbox\" id=\"cc-enabled\" ${card?.enabled !== false ? 'checked' : ''}> Enabled in the pool</label></div>
    ${!editing ? `<div class=\"field full\"><label class=\"label\">Start from a mechanic template</label><select class=\"select\" id=\"cc-mechanic\"><option value=\"\">None — write the script later</option>${(mechanicsData || []).map((m) => `<option value=\"${esc(m.id)}\">${esc(m.name)}</option>`).join('')}</select><div class=\"tiny muted2 mt\">A script will be attached after the card is created.</div></div>` : ''}
  </div>`;
  openModal({
    title: editing ? 'Edit custom card' : 'Forge a new card',
    subtitle: editing ? 'Only custom cards can be edited. Riot cards can be enabled/disabled and scripted.' : 'The card appears in the pool immediately. Attach a script from the Scripts tab.',
    wide: true,
    body,
    actions: [
      { label: 'Cancel', className: 'btn-ghost' },
      {
        label: editing ? 'Save changes' : 'Create card', className: 'btn-primary', close: false, onClick: async (modal, close) => {
          const get = (id) => modal.querySelector(id)?.value;
          const chosenRegions = [...modal.querySelectorAll('[data-region]:checked')].map((x) => x.dataset.region);
          const payload = {
            name: get('#cc-name')?.trim(),
            cost: Number(get('#cc-cost') || 0),
            attack: Number(get('#cc-attack') || 0),
            health: Number(get('#cc-health') || 0),
            type: get('#cc-type'),
            supertype: get('#cc-supertype'),
            spellSpeed: get('#cc-speed'),
            regions: chosenRegions.length ? chosenRegions : ['Runeterra'],
            subtypes: String(get('#cc-subtypes') || '').split(',').map((s) => s.trim()).filter(Boolean),
            keywords: String(get('#cc-keywords') || '').split(',').map((s) => s.trim()).filter(Boolean),
            text: get('#cc-text') || '',
            levelup: get('#cc-levelup') || '',
            flavor: get('#cc-flavor') || '',
            art: get('#cc-art') || null,
            enabled: modal.querySelector('#cc-enabled')?.checked !== false,
          };
          if (!payload.name) { toast('Give the card a name.', 'error'); return; }
          try {
            let result;
            if (editing) result = await apiPut(`/api/admin/cards/${encodeURIComponent(card.id)}`, payload, { admin: true });
            else result = await apiPost('/api/admin/cards', payload, { admin: true });
            const newCard = result.card;
            const mechanicId = !editing ? modal.querySelector('#cc-mechanic')?.value : '';
            if (mechanicId) {
              const mech = (mechanicsData || []).find((m) => m.id === mechanicId);
              if (mech?.template) {
                await apiPut(`/api/admin/scripts/${encodeURIComponent(newCard.id)}`, { script: mech.template, status: 'custom' }, { admin: true });
              }
            }
            await ctx.refreshPool();
            stats = null; cardsData = null;
            close();
            toast(editing ? 'Card updated.' : 'Card forged.', 'success');
            if (!editing) { tab = 'cards'; cardsFilters = { ...cardsFilters, page: 1 }; cardsData = null; loadCards(root, ctx); }
            else { renderAdmin(root, ctx); }
          } catch (err) { toast(err.message || 'Could not save the card.', 'error'); }
        },
      },
    ],
    onOpen: (modal) => {
      modal.querySelector('#cc-art-file')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 8 * 1024 * 1024) { toast('Image is too large (max 8 MB).', 'error'); return; }
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const data = await apiPost('/api/admin/art', { dataUrl: reader.result }, { admin: true });
            modal.querySelector('#cc-art').value = data.url;
            const preview = modal.querySelector('#cc-art-preview');
            if (preview) preview.style.backgroundImage = `url('${data.url}')`;
            toast('Art uploaded.', 'success');
          } catch (err) { toast(err.message || 'Could not upload art.', 'error'); }
        };
        reader.readAsDataURL(file);
      });
    },
  });
}

function openMechanicModal(root, ctx, existing = null) {
  const template = existing?.template ? JSON.stringify(existing.template, null, 2) : JSON.stringify({
    triggers: [{ on: 'play', actions: [{ type: 'draw', amount: 1 }] }],
  }, null, 2);
  openModal({
    title: existing ? 'Edit mechanic' : 'New mechanic',
    subtitle: 'A reusable trigger template. Attach it when forging a card, or copy it into an existing script.',
    body: `<div class=\"form-grid\">
      <div class=\"field\"><label class=\"label\">ID</label><input class=\"input\" id=\"mech-id\" value=\"${esc(existing?.id || `mech-${Date.now().toString(36)}`)}\"></div>
      <div class=\"field\"><label class=\"label\">Name</label><input class=\"input\" id=\"mech-name\" value=\"${esc(existing?.name || '')}\" placeholder=\"e.g. Deep Echo\"></div>
      <div class=\"field full\"><label class=\"label\">Description</label><input class=\"input\" id=\"mech-desc\" value=\"${esc(existing?.description || '')}\" placeholder=\"What does this mechanic do?\"></div>
      <div class=\"field full\"><label class=\"label\">Template JSON</label><textarea class=\"textarea code-editor\" id=\"mech-template\" style=\"min-height:220px\">${esc(template)}</textarea></div>
    </div>`,
    wide: true,
    actions: [
      { label: 'Cancel', className: 'btn-ghost' },
      {
        label: existing ? 'Save mechanic' : 'Create mechanic', className: 'btn-primary', close: false, onClick: async (modal, close) => {
          const name = modal.querySelector('#mech-name')?.value.trim();
          let parsed;
          try { parsed = JSON.parse(modal.querySelector('#mech-template')?.value || '{}'); }
          catch (err) { toast(`Template JSON: ${err.message}`, 'error'); return; }
          if (!name) { toast('Give the mechanic a name.', 'error'); return; }
          const payload = { id: modal.querySelector('#mech-id')?.value.trim(), name, description: modal.querySelector('#mech-desc')?.value || '', template: parsed };
          try {
            if (existing) await apiPut(`/api/admin/mechanics/${encodeURIComponent(existing.id)}`, payload, { admin: true });
            else await apiPost('/api/admin/mechanics', payload, { admin: true });
            mechanicsData = null;
            close();
            loadMechanics(root, ctx);
            toast('Mechanic saved.', 'success');
          } catch (err) { toast(err.message || 'Could not save mechanic.', 'error'); }
        },
      },
    ],
  });
}

function openKeywordModal(root, ctx) {
  openModal({
    title: 'New keyword',
    subtitle: 'A label for custom cards. Built-in rules still come from the engine.',
    body: `<div class=\"field mb\"><label class=\"label\">Name</label><input class=\"input\" id=\"kw-name\" placeholder=\"e.g. Deep Echo\"></div><div class=\"field\"><label class=\"label\">Description</label><textarea class=\"textarea\" id=\"kw-desc\" placeholder=\"Reminder text\"></textarea></div><div class=\"notice small mt\">Custom keywords appear as labels on cards and in tooltips. The engine only automates keywords it knows; use Tabletop tools for new rules.</div>`,
    actions: [
      { label: 'Cancel', className: 'btn-ghost' },
      {
        label: 'Create keyword', className: 'btn-primary', close: false, onClick: async (modal, close) => {
          const name = modal.querySelector('#kw-name')?.value.trim();
          if (!name) { toast('Give the keyword a name.', 'error'); return; }
          try {
            await apiPost('/api/admin/keywords', { name, description: modal.querySelector('#kw-desc')?.value || '' }, { admin: true });
            keywordsData = null;
            close();
            loadMechanics(root, ctx);
            toast('Keyword created.', 'success');
          } catch (err) { toast(err.message || 'Could not create keyword.', 'error'); }
        },
      },
    ],
  });
}
