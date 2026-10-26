import { esc, toast } from '../ui.js';

// Local vector ornaments; the scene and feature artwork live in public/assets.
function icon(name) {
  const shapes = {
    home: '<path d="M18 8h27v7h-5v34H18v-6h5V15h-5z M29 17v23h5V17z M34 31l9 18h-7l-7-15"/>',
    play: '<path d="m15 9 34 34-6 6L9 15z M49 9 15 43l-6 6 6-1 34-33z M10 37l11 11 M37 10l11 11"/><path d="m13 13 7-4 29 29-3 8-8 3L9 20z" opacity=".4"/>',
    collection: '<path d="m15 17 9-7 6 5 7-5 9 7-4 10 5 20-17 4-17-4 5-20z M18 27h24 M24 10l-2 17 M37 10l2 17 M26 40h9"/>',
    rewards: '<path d="m13 16 31-6-2 9 6 24-29 5-5-24z M13 16l-6 2 5 26 7 4 M21 22l14-3 M24 29l12-2 M25 36l12-3"/><path d="m40 11 5-1 4 9-7 1"/>',
    pass: '<path d="m30 5 8 6 10 2 1 12-5 13-14 16-14-16-5-13 1-12 10-2z M30 13l11 6-2 16-9 10-9-10-2-16z"/><path d="m30 20 6 7-6 9-6-9z"/>',
    store: '<path d="M20 12h21l-2 8 8 14-3 13-14 6-15-6-3-13 10-14z M22 20h17 M21 12l-3-6h25l-3 6 M17 34h26 M30 24v22 M25 29h9l-9 11h9"/>',
    cards: '<path d="M17 12h26v37H17z M11 19H7v34h25v-4 M22 20h16 M22 27h16 M22 34h10"/>',
    champion: '<path d="M20 10h20v17c0 15-20 15-20 0z M20 15H9c0 13 4 17 14 18 M40 15h11c0 13-4 17-14 18 M30 39v9 M20 50h20 M30 17l6 8-6 10-6-10z"/>',
    join: '<path d="M30 7v44 M7 30h44 M14 14l32 32 M46 14 14 46"/><path d="m30 12 17 18-17 18-17-18z"/>',
    forge: '<path d="m19 10 9-4 24 18-7 9-11-9-21 29-8-6 22-29z M10 48l5 4 M31 19l5-7"/>',
    settings: '<path d="m25 7 10 0 2 8 7 4 8-2 5 9-6 6v8l5 6-5 9-8-2-7 4-2 7H24l-2-8-7-4-8 2-5-9 6-6v-8l-6-6 5-9 8 2 7-4z" transform="translate(4 -3) scale(.87)"/><circle cx="30" cy="29" r="9"/>',
    fullscreen: '<path d="M22 9H9v13 M38 9h13v13 M9 38v13h13 M51 38v13H38"/>',
  };
  return `<svg viewBox="0 0 60 60" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${shapes[name] || shapes.home}</svg>`;
}

export function renderHome(root, ctx) {
  const { state } = ctx;
  const pool = state.pool || [];
  const champions = pool.filter((card) => card.supertype === 'Champion').length;
  const online = state.connected ? '' : 'disabled';
  const name = () => state.playerName || 'Set your name';
  const saveName = (value) => {
    state.playerName = String(value).replace(/\s+/g, ' ').trim().slice(0, 22);
    if (state.playerName) localStorage.setItem('nf.playerName', state.playerName);
    const label = root.querySelector('.home-player-name');
    if (label) label.textContent = name();
  };
  root.classList.add('home-view');
  root.innerHTML = `
    <section class="home-lobby" aria-label="Nexus Forge home">
      <h1 class="home-sr-only">Nexus Forge</h1>
      <nav class="home-rail" aria-label="Main navigation">
        <div class="home-rail-menu">
          <a class="home-nav active" href="#/" aria-current="page">${icon('home')}<span>Home</span></a>
          <button class="home-nav home-nav-play home-online-action" data-home-play ${online}>${icon('play')}<span>Play</span></button>
          <a class="home-nav" href="#/decks">${icon('collection')}<span>Collection</span></a>
          <button class="home-nav unavailable" disabled title="Rewards are unavailable in Nexus Forge">${icon('rewards')}<span>Rewards</span><small>Unavailable</small></button>
          <button class="home-nav unavailable" disabled title="Battle Pass is unavailable in Nexus Forge">${icon('pass')}<span>Battle Pass</span><small>Unavailable</small></button>
          <button class="home-nav unavailable" disabled title="Store is unavailable in Nexus Forge">${icon('store')}<span>Store</span><small>Unavailable</small></button>
        </div>
        <span class="home-rail-brand" aria-hidden="true">Nexus Forge</span>
      </nav>

      <header class="home-hud" aria-label="Player and collection">
        <button class="home-profile" id="home-profile" aria-label="Edit player name">
          <span class="home-crest">${icon('champion')}</span>
          <span class="home-player-name">${esc(name())}</span>
        </button>
        <dl class="home-resources" aria-label="Your collection">
          <div class="home-resource cards" title="Cards available in the card pool"><dt>${icon('cards')}<span>Cards</span></dt><dd>${pool.length.toLocaleString('en-US')}</dd></div>
          <div class="home-resource champions" title="Champions available in the card pool"><dt>${icon('champion')}<span>Champions</span></dt><dd>${champions.toLocaleString('en-US')}</dd></div>
          <div class="home-resource decks" title="Saved decks, including starter decks"><dt>${icon('collection')}<span>Decks</span></dt><dd>${state.decks.length}</dd></div>
        </dl>
        <span class="home-connection conn ${state.connected ? 'on' : 'off'}" role="status"><span class="conn-dot"></span>${state.connected ? 'Connected' : 'Reconnecting…'}</span>
      </header>

      ${state.roomCode ? `<a class="home-resume" href="#/${state.game ? 'game' : 'lobby'}">Return to room <strong>${esc(state.roomCode)}</strong> <span aria-hidden="true">›</span></a>` : ''}
      <button class="home-settings" id="home-settings" aria-label="Settings" title="Settings">${icon('settings')}</button>

      <button class="home-feature home-online-action" data-home-play ${online}>
        <span class="home-feature-art" aria-hidden="true"></span>
        <span class="home-feature-copy"><small>1v1 &nbsp; · &nbsp; 2v2 team clash</small><strong>Play with friends</strong><span>Enter the battlefield <b aria-hidden="true">›</b></span></span>
      </button>

      <nav class="home-shortcuts" aria-label="Quick actions">
        <button class="home-shortcut home-online-action" id="home-open-join" ${online}><span>Join a room</span>${icon('join')}</button>
        <a class="home-shortcut" href="#/decks"><span>My decks</span>${icon('cards')}<small>${state.decks.length}</small></a>
        <a class="home-shortcut" href="#/admin"><span>Card Forge</span>${icon('forge')}</a>
      </nav>
    </section>`;

  function openPlay(mode = 'create') {
    ctx.openModal({
      title: 'Enter the battlefield',
      subtitle: 'A private table. Your friends. Your rules.',
      className: 'home-dialog',
      body: `
        <div class="home-room-tabs" role="group" aria-label="Room action">
          <button type="button" data-room-mode="create">Create a room</button>
          <button type="button" data-room-mode="join">Join a room</button>
        </div>
        <form id="home-room-form">
          <label class="home-field" for="home-name">Your display name<input class="input" id="home-name" name="playerName" maxlength="22" autocomplete="nickname" required value="${esc(state.playerName)}" placeholder="Summoner name"></label>
          <p class="home-room-help" id="home-create-help">Open a table for a duel or 2v2 Team Clash. Choose your mode and deck in the room, then share the code with your friends.</p>
          <div id="home-join-fields" hidden>
            <label class="home-field" for="home-code">Room code<input class="input home-code" id="home-code" name="roomCode" minlength="5" maxlength="8" pattern="[A-Za-z0-9]{5,8}" autocomplete="off" spellcheck="false" value="${esc(state.pendingJoin || '')}" placeholder="ABC12"></label>
            <p class="home-room-help">Enter the code from your host. You can take a seat or watch as a spectator.</p>
          </div>
          <div class="home-room-actions">
            <button class="home-gold-button home-online-action" id="home-room-submit" type="submit" ${state.connected ? '' : 'disabled'}>Create room</button>
            <button class="home-secondary-button home-online-action" id="home-spectate" type="submit" ${state.connected ? '' : 'disabled'}>Spectate</button>
          </div>
        </form>`,
      onOpen(modal, close) {
        prepareDialog(modal);
        const form = modal.querySelector('form');
        const nameInput = modal.querySelector('#home-name');
        const codeInput = modal.querySelector('#home-code');
        const selectMode = (value) => {
          mode = value;
          modal.querySelectorAll('[data-room-mode]').forEach((tab) => {
            tab.setAttribute('aria-pressed', String(tab.dataset.roomMode === mode));
          });
          modal.querySelector('#home-create-help').hidden = mode !== 'create';
          modal.querySelector('#home-join-fields').hidden = mode !== 'join';
          modal.querySelector('#home-spectate').hidden = mode !== 'join';
          codeInput.required = mode === 'join';
          codeInput.disabled = mode !== 'join';
          modal.querySelector('#home-room-submit').textContent = mode === 'join' ? 'Join room' : 'Create room';
        };
        modal.querySelectorAll('[data-room-mode]').forEach((tab) => tab.addEventListener('click', () => selectMode(tab.dataset.roomMode)));
        codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.toUpperCase(); });
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          if (!state.connected) { toast('Reconnecting to the server. Try again in a moment.', 'error'); return; }
          if (!nameInput.value.trim()) { nameInput.setCustomValidity('Enter your display name.'); nameInput.reportValidity(); return; }
          saveName(nameInput.value);
          const code = codeInput.value.trim().toUpperCase();
          const spectate = event.submitter?.id === 'home-spectate';
          state.pendingJoin = '';
          close();
          if (mode === 'create') await ctx.createRoom();
          else if (spectate) await ctx.spectateRoom(code);
          else await ctx.joinRoom(code);
        });
        nameInput.addEventListener('input', () => nameInput.setCustomValidity(''));
        selectMode(mode);
        (state.playerName && mode === 'join' ? codeInput : nameInput).focus();
      },
      onClose: () => root.querySelector('[data-home-play]')?.focus(),
    });
  }

  root.querySelectorAll('[data-home-play]').forEach((button) => button.addEventListener('click', () => openPlay()));
  root.querySelector('#home-open-join').addEventListener('click', () => openPlay('join'));
  root.querySelector('#home-profile').addEventListener('click', async () => {
    const prompt = ctx.modalPrompt('Your player name', { label: 'Display name', value: state.playerName, placeholder: 'Summoner name', confirmLabel: 'Save name' });
    const modal = document.querySelector('#modal-root .modal');
    if (modal) {
      modal.classList.add('home-dialog');
      modal.querySelector('#prompt-input').maxLength = 22;
      prepareDialog(modal);
    }
    const value = await prompt;
    if (value != null && value.trim()) saveName(value);
    root.querySelector('#home-profile')?.focus();
  });
  root.querySelector('#home-settings').addEventListener('click', () => {
    ctx.openModal({
      title: 'Nexus Forge',
      subtitle: 'Your Runeterra card table',
      className: 'home-dialog home-settings-dialog',
      body: `<p class="home-room-help">Build a deck from the complete card pool, create a private room, and invite friends connected to your server.</p>
        <button class="home-secondary-button" id="home-fullscreen">${icon('fullscreen')}<span>${document.fullscreenElement ? 'Exit full screen' : 'Enter full screen'}</span></button>
        <a class="home-secondary-button" href="#/admin" id="home-open-forge">${icon('forge')}<span>Open Card Forge</span></a>
        <p class="home-settings-note">Rewards, Battle Pass, and Store are unavailable in Nexus Forge.</p>`,
      onOpen(modal, close) {
        prepareDialog(modal);
        const fullscreen = modal.querySelector('#home-fullscreen');
        fullscreen.disabled = !document.fullscreenEnabled;
        fullscreen.addEventListener('click', async () => {
          try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await document.documentElement.requestFullscreen();
            close();
          } catch { toast('Full screen is unavailable in this browser.', 'error'); }
        });
        modal.querySelector('#home-open-forge').addEventListener('click', close);
        modal.querySelector('.modal-close').focus();
      },
      onClose: () => root.querySelector('#home-settings')?.focus(),
    });
  });
  if (state.pendingJoin) openPlay('join');
}

function prepareDialog(modal) {
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.querySelector('h2').id = 'home-dialog-title';
  modal.setAttribute('aria-labelledby', 'home-dialog-title');
  modal.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const controls = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href]')].filter((el) => el.getClientRects().length);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
}
