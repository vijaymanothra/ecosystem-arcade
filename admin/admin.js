// ============================================================
//  ARCADE ADMIN — leaderboard scores only: view, download, remove one entry, wipe a game or
//  all games, hide / show leaderboards. The games themselves can't be changed from here.
//  The admin password is kept in memory only (never stored), and sent with each request in
//  the X-Admin-Token header. The API checks it; 5 wrong tries pause this address for 15 minutes.
// ============================================================
(function () {
  'use strict';

  const GAMES = [
    { id: 'master-the-map', name: 'Master the Map', icon: '🗺️' },
    { id: 'route-rush', name: 'Route Rush', icon: '🚦' },
    { id: 'health-journey', name: 'The Health Journey', icon: '🎲' },
    { id: 'evernorth-city', name: 'Evernorth City', icon: '🏙️' },
    { id: 'case-files', name: 'Case Files', icon: '🕵️' },
  ];
  const SHOW_ROWS = 50; // entries listed per game (CSV has them all)
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  let password = '';            // memory only
  let hiddenGames = [];
  const data = {};              // game id → scores (best first)

  // ---------------------------------------------------------------- talking to the API
  async function api(method, path, body) {
    const res = await fetch(`/api${path}`, {
      method,
      headers: { 'X-Admin-Token': password, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    let json = {};
    try { json = await res.json(); } catch { /* empty */ }
    if (!res.ok) throw Object.assign(new Error(json.error || `error ${res.status}`), { status: res.status });
    return json;
  }

  function say(text, kind) {
    const m = $('#status');
    m.textContent = text;
    m.className = `msg ${kind || ''}`;
  }

  // ---------------------------------------------------------------- unlock / lock
  $('#unlockForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    password = $('#pw').value;
    const msg = $('#unlockMsg');
    msg.textContent = 'Checking…';
    msg.className = 'msg';
    try {
      await loadAll();
      $('#pw').value = '';
      $('#locked').hidden = true;
      $('#unlocked').hidden = false;
      msg.textContent = '';
    } catch (err) {
      password = '';
      msg.textContent = err.status === 401 ? 'Wrong password.' : err.message;
      msg.className = 'msg bad';
    }
  });

  function lock() {
    password = '';
    for (const k of Object.keys(data)) delete data[k];
    $('#games').replaceChildren();
    $('#unlocked').hidden = true;
    $('#locked').hidden = false;
    $('#pw').focus();
  }
  $('#lockBtn').addEventListener('click', lock);

  // ---------------------------------------------------------------- data
  async function loadAll() {
    const summary = await api('GET', '/admin/scores');
    hiddenGames = summary.hiddenGames || [];
    await Promise.all(GAMES.map(async (g) => { data[g.id] = (await api('GET', `/admin/scores?game=${g.id}`)).scores; }));
    render();
  }

  async function act(label, fn) {
    say(`${label}…`);
    try {
      const result = await fn();
      await loadAll();
      say(result || 'Done.', 'good');
    } catch (err) {
      if (err.status === 401) { lock(); $('#unlockMsg').textContent = 'Password no longer accepted — unlock again.'; $('#unlockMsg').className = 'msg bad'; return; }
      say(err.message, 'bad');
    }
  }
  $('#refreshBtn').addEventListener('click', () => act('Refreshing', async () => 'Up to date.'));

  // ---------------------------------------------------------------- confirmation box
  function confirmBox({ title, text, typeToConfirm, yes = 'Confirm' }) {
    return new Promise((resolve) => {
      const box = $('#confirm');
      const input = $('#confirmType');
      const label = $('#confirmTypeLabel');
      const ok = $('#confirmYes');
      $('#confirmTitle').textContent = title;
      $('#confirmText').textContent = text;
      ok.textContent = yes;
      input.value = '';
      input.hidden = label.hidden = !typeToConfirm;
      label.textContent = typeToConfirm ? `Type ${typeToConfirm} to confirm` : '';
      ok.disabled = Boolean(typeToConfirm);
      input.oninput = () => { ok.disabled = input.value.trim() !== typeToConfirm; };
      const done = (answer) => { box.hidden = true; ok.onclick = null; $('#confirmNo').onclick = null; resolve(answer); };
      ok.onclick = () => done(true);
      $('#confirmNo').onclick = () => done(false);
      box.hidden = false;
      (typeToConfirm ? input : $('#confirmNo')).focus();
    });
  }

  // ---------------------------------------------------------------- actions (scores only)
  async function setHidden(next) {
    await act('Saving', async () => {
      const s = await api('PUT', '/admin/settings', { hiddenGames: next });
      return s.hiddenGames.length ? `Hidden: ${s.hiddenGames.map(nameOf).join(', ')}. Screens update within about 20 seconds.` : 'All leaderboards are visible. Screens update within about 20 seconds.';
    });
  }
  const nameOf = (id) => (GAMES.find((g) => g.id === id) || { name: id }).name;

  $('#hideAllBtn').addEventListener('click', () => setHidden(GAMES.map((g) => g.id)));
  $('#showAllBtn').addEventListener('click', () => setHidden([]));

  async function wipe(game) {
    const all = !game;
    const sure = await confirmBox({
      title: all ? 'Wipe ALL scores?' : `Wipe ${nameOf(game)} scores?`,
      text: all
        ? 'Every saved score in every game is removed. The games keep working. Download a CSV first if you need a copy.'
        : `All ${data[game].length} saved scores of ${nameOf(game)} are removed. The game keeps working. Download a CSV first if you need a copy.`,
      typeToConfirm: all ? 'WIPE ALL' : game,
      yes: 'Wipe scores',
    });
    if (!sure) return;
    await act('Wiping', async () => `Removed ${(await api('DELETE', `/scores${all ? '' : `?game=${game}`}`)).deleted} scores.`);
  }
  $('#wipeAllBtn').addEventListener('click', () => wipe(null));

  async function removeOne(game, s) {
    const sure = await confirmBox({ title: 'Remove this entry?', text: `"${s.name}" — ${s.score.toLocaleString()} points in ${nameOf(game)} (${when(s.at)}). Only this one score is removed.`, yes: 'Remove' });
    if (!sure) return;
    await act('Removing', async () => ((await api('DELETE', `/admin/scores?game=${game}&id=${encodeURIComponent(s.id)}`)).deleted ? `Removed "${s.name}".` : 'That entry was already gone.'));
  }

  // ---------------------------------------------------------------- CSV
  function csv(rows) {
    const cell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    return [['game', 'name', 'score', 'day', 'saved_at', 'id'], ...rows].map((r) => r.map(cell).join(',')).join('\n') + '\n';
  }
  function download(name, text) {
    const a = el('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = name;
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const rowsOf = (game) => data[game].map((s) => [game, s.name, s.score, s.day, new Date(s.at).toISOString(), s.id]);
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  $('#csvAllBtn').addEventListener('click', () => download(`arcade-scores-${stamp()}.csv`, csv(GAMES.flatMap((g) => rowsOf(g.id)))));

  // ---------------------------------------------------------------- screen
  const when = (at) => new Date(at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  function render() {
    const box = $('#games');
    box.replaceChildren();
    for (const g of GAMES) {
      const list = data[g.id] || [];
      const hidden = hiddenGames.includes(g.id);
      const card = el('section', 'card game');
      const head = el('div', 'game-head');
      const h = el('h2', null, `${g.icon} ${g.name}`);
      h.append(el('span', 'count', `${list.length} score${list.length === 1 ? '' : 's'}`));
      const pill = el('span', `pill${hidden ? ' off' : ''}`, hidden ? 'Hidden from players' : 'Visible');
      const toggle = el('button', 'btn small', hidden ? '👁 Show' : '🙈 Hide');
      toggle.addEventListener('click', () => setHidden(hidden ? hiddenGames.filter((x) => x !== g.id) : [...hiddenGames, g.id]));
      const dl = el('button', 'btn small', '⬇ CSV');
      dl.addEventListener('click', () => download(`${g.id}-${stamp()}.csv`, csv(rowsOf(g.id))));
      const wp = el('button', 'btn small danger', '🗑 Wipe scores');
      wp.disabled = !list.length;
      wp.addEventListener('click', () => wipe(g.id));
      head.append(h, pill, toggle, dl, wp);
      card.append(head);

      if (!list.length) card.append(el('p', 'empty', 'No scores saved.'));
      else {
        const table = el('table');
        const tr = el('tr');
        for (const [t, cls] of [['#', ''], ['Name', ''], ['Score', 'num'], ['Saved', 'hide-sm'], ['', '']]) tr.append(el('th', cls, t));
        const thead = el('thead');
        thead.append(tr);
        table.append(thead);
        const body = el('tbody');
        list.slice(0, SHOW_ROWS).forEach((s, i) => {
          const row = el('tr');
          const rm = el('button', 'btn small danger', 'Remove');
          rm.addEventListener('click', () => removeOne(g.id, s));
          const action = el('td'); action.append(rm);
          row.append(el('td', null, String(i + 1)), el('td', null, s.name), el('td', 'num', s.score.toLocaleString()), el('td', 'hide-sm', when(s.at)), action);
          body.append(row);
        });
        table.append(body);
        card.append(table);
        if (list.length > SHOW_ROWS) card.append(el('p', 'more', `Showing the top ${SHOW_ROWS} of ${list.length}. Download the CSV for all of them.`));
      }
      box.append(card);
    }
  }

  $('#pw').focus();
})();
