import { esc, toast, openModal, modalConfirm, copyText } from '../ui.js';

let chatDraft = '';

export function renderLobby(root, ctx) {
  const { state } = ctx;
  const room = state.lobby;
  if (!room) {
    root.innerHTML = '<div class="empty-state"><div class="icon">⌛</div><div><strong>Loading the table…</strong></div></div>';
    return;
  }
  const you = room.players.find((p) => p.isYou);
  const isHost = room.hostId === room.you;
  const modeLabel = room.mode === '2v2' ? '2v2 Team Clash' : '1v1 Duel';
  const teamA = room.players.filter((p) => p.team === 'A');
  const teamB = room.players.filter((p) => p.team === 'B');
  const seats = room.mode === '2v2' ? 2 : 1;
  const deckOptions = [
    `<option value="auto" ${you?.deckId === 'auto' ? 'selected' : ''}>Auto deck — legal random 40</option>`,
    ...(state.decks || []).map((d) => `<option value="${esc(d.id)}" ${you?.deckId === d.id ? 'selected' : ''}>${esc(d.name)}${d.starter ? ' · starter' : ''} — ${(d.summary?.regions || d.regions || []).join(' / ') || 'Neutral'}</option>`),
  ].join('');
  const emptySeat = '<div class="empty-seat">Open seat</div>';
  const playerCard = (p) => `
    <div class="player-card ${p.isYou ? 'you' : ''}">
      <div class="player-avatar">${esc((p.name || '?').slice(0, 1).toUpperCase())}</div>
      <div class="player-info">
        <strong>${esc(p.name)}${p.isYou ? ' <span class="tiny muted2">(you)</span>' : ''}${p.isHost ? ' <span class="tag gold" style="padding:1px 5px;font-size:.5rem">HOST</span>' : ''}</strong>
        <span>${esc(p.deckName || 'No deck')} · ${p.connected ? (p.ready ? 'ready' : 'not ready') : 'disconnected'}</span>
      </div>
      <div class="player-actions">
        ${p.ready ? '<span class="ready-badge">✓ Ready</span>' : '<span class="ready-badge no">○</span>'}
        ${isHost && !p.isYou && !room.started ? `
          <button class="btn btn-sm btn-ghost" data-move-player="${esc(p.id)}" data-team="${p.team === 'A' ? 'B' : 'A'}" title="Move to ${p.team === 'A' ? 'B' : 'A'}">⇄</button>
          <button class="btn btn-sm btn-ghost" data-kick-player="${esc(p.id)}" title="Remove player">✕</button>` : ''}
      </div>
    </div>`;
  const renderTeam = (id, players) => {
    const label = id === 'A' ? 'Team A' : 'Team B';
    const color = id === 'A' ? 'var(--blue)' : 'var(--red)';
    const needed = seats - players.length;
    return `<div class="team-col ${id}">
      <h4><span style="color:${color}">${label}</span><span class="tag">${players.length}/${seats}</span></h4>
      ${players.map(playerCard).join('')}
      ${Array.from({ length: Math.max(0, needed) }).map(() => emptySeat).join('')}
    </div>`;
  };
  const chat = (room.chat || []).slice(-60).map((line) => {
    if (line.kind === 'system') return `<div class="chat-line system">${esc(line.text)}</div>`;
    const mine = line.from === you?.name;
    return `<div class="chat-line"><strong>${esc(line.from)}</strong> ${esc(line.text)}</div>`;
  }).join('');
  const spectators = (room.spectators || []).filter((s) => s.connected);
  const canStart = isHost && room.canStart && !room.started;
  const startHint = !isHost ? 'Waiting for the host to start.'
    : room.started ? 'The table is in play.'
      : room.players.length < (room.mode === '2v2' ? 4 : 2) ? `Waiting for ${(room.mode === '2v2' ? 4 : 2) - room.players.length} more player${(room.mode === '2v2' ? 4 : 2) - room.players.length === 1 ? '' : 's'}.`
        : room.players.some((p) => !p.ready) ? 'Everyone must ready up.'
          : room.players.some((p) => !p.connected) ? 'A player is disconnected.' : 'Ready to begin.';

  root.innerHTML = `
    <div class="page-title">
      <div>
        <div class="eyebrow">The gathering</div>
        <h1>${room.started ? 'Battle in progress' : 'Table lobby'}</h1>
        <div class="muted small">${esc(modeLabel)} · ${room.players.length}/${room.mode === '2v2' ? 4 : 2} players${spectators.length ? ` · ${spectators.length} watching` : ''}</div>
      </div>
      <div class="row wrap">
        <button class="btn btn-ghost" id="lobby-invite">Invite friends</button>
        <button class="btn btn-ghost" id="lobby-leave">Leave</button>
      </div>
    </div>

    <div class="panel mb">
      <div class="panel-body room-banner">
        <div><div class="tiny muted2" style="letter-spacing:.18em;text-transform:uppercase">Room code</div><div class="room-code">${esc(room.code)}</div></div>
        <div class="grow small muted">${room.started ? 'A rematch can be started when the current game ends.' : 'Share this code with your friends on the same network.'}</div>
        <div class="row">
          <button class="btn btn-sm btn-ghost" id="lobby-copy-code">Copy code</button>
          <button class="btn btn-sm btn-ghost" id="lobby-copy-link">Copy invite link</button>
        </div>
      </div>
    </div>

    <div class="lobby-layout">
      <div>
        <div class="panel mb">
          <div class="panel-head">
            <h3>Seats</h3>
            ${isHost && !room.started ? `<div class="mode-toggle" style="width:220px" id="mode-toggle">
              <button data-mode="1v1" class="${room.mode === '1v1' ? 'active' : ''}">1v1 Duel</button>
              <button data-mode="2v2" class="${room.mode === '2v2' ? 'active' : ''}">2v2 Clash</button>
            </div>` : `<span class="tag">${esc(modeLabel)}</span>`}
          </div>
          <div class="panel-body">
            <div class="team-columns">${renderTeam('A', teamA)}${renderTeam('B', teamB)}</div>
            ${spectators.length ? `<div class="row wrap mt"><span class="tag">Spectators</span>${spectators.map((s) => `<span class="tag">${esc(s.name)}</span>`).join('')}</div>` : ''}
          </div>
        </div>

        <div class="panel">
          <div class="panel-head"><h3>Ready</h3><span class="tag ${room.canStart ? 'green' : ''}">${room.canStart ? 'All set' : 'Waiting'}</span></div>
          <div class="panel-body">
            <div class="row between wrap">
              <div class="small ${room.canStart ? 'green' : 'muted'}">${esc(startHint)}</div>
              <div class="row">
                ${you && !room.started ? `<button class="btn ${you.ready ? 'btn-ghost' : 'btn-teal'}" id="lobby-ready">${you.ready ? 'Unready' : 'Ready up'}</button>` : ''}
                ${isHost && !room.started ? `<button class="btn btn-primary" id="lobby-start" ${canStart ? '' : 'disabled'}>Start game</button>` : ''}
                ${room.started ? '<span class="tag gold">Game live — check the Battle tab</span>' : ''}
              </div>
            </div>
            ${room.started ? '<div class="notice mt">This lobby is locked while the game is running. The host can rematch once the Nexus falls.</div>' : ''}
          </div>
        </div>
      </div>

      <aside class="lobby-side">
        <div class="panel">
          <div class="panel-head"><h3>Your loadout</h3></div>
          <div class="panel-body">
            ${you ? `
              <div class="field mb">
                <label class="label" for="lobby-deck">Deck</label>
                <select class="select" id="lobby-deck" ${room.started ? 'disabled' : ''}>${deckOptions}</select>
              </div>
              <div class="deck-select-row mb">
                <div class="tiny muted2 grow">${you.deckName || 'Auto deck'}</div>
                <a class="btn btn-sm btn-ghost" href="#/decks">Edit decks</a>
              </div>
              <div class="notice gold small">Deck rules: 40 cards, max 3 copies, at most 2 regions. Runeterra champions are neutral.</div>
            ` : '<div class="muted small">You are watching this table.</div>'}
          </div>
        </div>

        <div class="panel">
          <div class="panel-head"><h3>Table talk</h3><span class="tag">Live</span></div>
          <div class="panel-body">
            <div class="chat-list scroll-thin" id="lobby-chat">${chat || '<div class="muted small">No messages yet. Say hello.</div>'}</div>
            <div class="chat-form">
              <input class="input input-sm" id="lobby-chat-input" maxlength="120" placeholder="Message the table…" value="${esc(chatDraft)}">
              <button class="btn btn-sm btn-primary" id="lobby-chat-send">Send</button>
            </div>
          </div>
        </div>

        <div class="panel soft">
          <div class="panel-body tiny muted">
            <strong class="gold">Good to know</strong><br>
            Either teammate can act on a shared 2v2 turn. The attack token alternates each round. Pass twice to end the round.
            <a href="#/decks" class="gold">Open the deck workshop →</a>
          </div>
        </div>
      </aside>
    </div>
  `;

  // Chat scroll and focus.
  const chatEl = root.querySelector('#lobby-chat');
  if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
  const chatInput = root.querySelector('#lobby-chat-input');
  chatInput?.addEventListener('input', () => { chatDraft = chatInput.value; });
  chatInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') root.querySelector('#lobby-chat-send')?.click(); });

  root.querySelector('#lobby-copy-code')?.addEventListener('click', async () => {
    await copyText(room.code);
    toast('Room code copied.', 'success');
  });
  root.querySelector('#lobby-copy-link')?.addEventListener('click', async () => {
    const url = `${location.origin}/#/join/${room.code}`;
    await copyText(url);
    toast('Invite link copied.', 'success');
  });
  root.querySelector('#lobby-invite')?.addEventListener('click', () => {
    const url = `${location.origin}/#/join/${room.code}`;
    openModal({
      title: 'Invite friends',
      subtitle: 'They need to be on the same network as this server.',
      body: `<div class="field mb"><label class="label">Room code</label><input class="input" readonly value="${esc(room.code)}" style="letter-spacing:.24em;text-align:center;font-weight:700"></div>
        <div class="field"><label class="label">Invite link</label><input class="input" readonly value="${esc(url)}"></div>
        <div class="notice mt small">If you opened the game at <code>localhost</code>, friends cannot use that address. Use the Network address printed in the server console, or your machine's LAN IP.</div>`,
      actions: [
        { label: 'Copy code', className: 'btn-ghost', close: false, onClick: async () => { await copyText(room.code); toast('Code copied.', 'success'); } },
        { label: 'Copy link', className: 'btn-primary', close: false, onClick: async () => { await copyText(url); toast('Invite link copied.', 'success'); } },
        { label: 'Done', className: 'btn-ghost' },
      ],
    });
  });
  root.querySelector('#lobby-leave')?.addEventListener('click', async () => {
    const ok = await modalConfirm('Leave the table?', room.started ? 'Leaving during a game will surrender your side. Your seat will be removed from the room.' : 'Your seat will be removed from the room.', { danger: true, confirmLabel: 'Leave table' });
    if (ok) ctx.leaveRoom();
  });
  root.querySelector('#lobby-ready')?.addEventListener('click', () => ctx.send('ready', { ready: !you?.ready }));
  root.querySelector('#lobby-start')?.addEventListener('click', () => ctx.send('start'));
  root.querySelectorAll('[data-mode]').forEach((btn) => btn.addEventListener('click', () => ctx.send('setMode', { mode: btn.dataset.mode })));
  root.querySelectorAll('[data-move-player]').forEach((btn) => btn.addEventListener('click', () => ctx.send('move', { playerId: btn.dataset.movePlayer, team: btn.dataset.team })));
  root.querySelectorAll('[data-kick-player]').forEach((btn) => btn.addEventListener('click', async () => {
    const pid = btn.dataset.kickPlayer;
    const p = room.players.find((x) => x.id === pid);
    const ok = await modalConfirm('Remove player?', `Remove ${p?.name || 'this player'} from the table?`, { danger: true, confirmLabel: 'Remove' });
    if (ok) ctx.send('kick', { playerId: pid });
  }));
  root.querySelector('#lobby-deck')?.addEventListener('change', (e) => ctx.send('setDeck', { deckId: e.target.value }));
  root.querySelector('#lobby-chat-send')?.addEventListener('click', () => {
    const input = root.querySelector('#lobby-chat-input');
    const text = String(input?.value || '').trim();
    if (!text) return;
    ctx.send('chat', { text });
    chatDraft = '';
    if (input) input.value = '';
  });
}
