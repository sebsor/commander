// app.js — view rendering + navigation. No framework: small enough that
// plain DOM manipulation stays readable, and it keeps the single-file-per-
// concern structure (db / scryfall / table / stats / app) easy to follow.

const viewEl = document.getElementById('view');
const headerTitle = document.getElementById('header-title');
const modalRoot = document.getElementById('modal-root');
const navButtons = document.querySelectorAll('.bottom-nav button');

let logState = null; // holds in-progress game while logging

function setActiveNav(view) {
  navButtons.forEach((b) => b.classList.toggle('active', b.dataset.view === view));
}

function navigate(view) {
  setActiveNav(view);
  const titles = { home: 'Home', players: 'Players', decks: 'Decks', stats: 'Stats', log: 'Log a Game' };
  headerTitle.textContent = titles[view] || 'Round Table';
  closeModal();
  if (view === 'home') renderHome();
  else if (view === 'players') renderPlayers();
  else if (view === 'decks') renderDecks();
  else if (view === 'stats') renderStats();
  else if (view === 'log') startLog();
}

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => navigate(btn.dataset.view));
});

// ---------------- Modal helper ----------------
function openModal(innerHTML, onMount) {
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal-sheet">
        <button class="modal-close" id="modal-close" aria-label="Close">✕</button>
        <div style="clear:both"></div>
        ${innerHTML}
      </div>
    </div>
  `;
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });
  if (onMount) onMount();
}
function closeModal() {
  modalRoot.innerHTML = '';
}

// ---------------- Home ----------------
function renderHome() {
  const players = db.getPlayers();
  const games = db.getGames();

  if (players.length === 0) {
    viewEl.innerHTML = `
      <div class="empty-state">
        <span class="glyph">♜</span>
        <h2>Set the table</h2>
        <p>Add a player or two before logging your first game.</p>
        <button class="btn btn-primary" id="go-players">Add players</button>
      </div>
    `;
    document.getElementById('go-players').addEventListener('click', () => navigate('players'));
    return;
  }

  const recent = games.slice(0, 6);
  viewEl.innerHTML = `
    <button class="btn btn-primary btn-block" id="log-game-btn" style="padding:16px; font-size:1.05rem; margin-bottom:18px;">
      + Log a Game
    </button>
    <h2>Recent games</h2>
    ${recent.length === 0 ? `<p>No games logged yet.</p>` : ''}
    <div class="card" style="padding:0;">
      ${recent.map(gameRowHTML).join('')}
    </div>
  `;
  document.getElementById('log-game-btn').addEventListener('click', () => navigate('log'));
  recent.forEach((g) => {
    const el = document.getElementById('game-' + g.id);
    if (el) el.addEventListener('click', () => showGameDetail(g));
  });
}

function gameRowHTML(g) {
  const winnerSeat = g.seats.find((s) => s.playerId === g.winnerId);
  const dateStr = new Date(g.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const chips = colorIdentityHex(winnerSeat?.colorIdentity || []);
  return `
    <div class="list-row" id="game-${g.id}" style="cursor:pointer;">
      <div>
        <div style="font-weight:500;">${winnerSeat?.playerName || '—'} <span class="text-dim" style="color:var(--text-faint); font-weight:400;">won</span></div>
        <div style="font-size:0.8rem; color:var(--text-dim);">${winnerSeat?.commanderName || 'Unknown commander'} · ${g.podSize} players</div>
      </div>
      <div style="text-align:right;">
        <div class="color-chip-row" style="justify-content:flex-end; margin-bottom:4px;">
          ${chips.map((c) => `<span style="background:${c}"></span>`).join('')}
        </div>
        <div class="numeric" style="font-size:0.72rem; color:var(--text-faint);">${dateStr}</div>
      </div>
    </div>
  `;
}

function showGameDetail(g) {
  openModal(`
    <h2>Game — ${new Date(g.date).toLocaleDateString()}</h2>
    <p>${g.podSize} players</p>
    <div id="detail-wheel" class="table-wheel"></div>
    <button class="btn btn-danger btn-block" id="delete-game">Delete this game</button>
  `, () => {
    const wheel = document.getElementById('detail-wheel');
    const slots = renderTableSeats(wheel, g.podSize);
    g.seats.forEach((s) => {
      const slot = slots[s.seat - 1];
      fillSeat(slot, {
        playerName: s.playerName,
        colorHexes: colorIdentityHex(s.colorIdentity),
        isWinner: s.playerId === g.winnerId
      });
    });
    document.getElementById('delete-game').addEventListener('click', () => {
      db.deleteGame(g.id);
      closeModal();
      renderHome();
    });
  });
}

// ---------------- Players ----------------
function renderPlayers() {
  const players = db.getPlayers();
  const games = db.getGames();
  const winRows = stats.winsByPerson(players, games);

  viewEl.innerHTML = `
    <button class="btn btn-primary btn-block" id="add-player-btn" style="margin-bottom:16px;">+ Add Player</button>
    ${players.length === 0 ? `<p>No players yet.</p>` : `
      <div class="card" style="padding:0;">
        ${winRows.map((r) => `
          <div class="list-row">
            <div style="font-weight:500;">${r.name}</div>
            <div style="text-align:right;">
              <div class="numeric">${r.wins}/${r.played}</div>
              <div style="font-size:0.72rem; color:var(--text-faint);">${Math.round(r.winRate * 100)}% win rate</div>
            </div>
          </div>
        `).join('')}
      </div>
    `}
  `;
  document.getElementById('add-player-btn').addEventListener('click', () => {
    openModal(`
      <h2>Add Player</h2>
      <label for="player-name">Name</label>
      <input type="text" id="player-name" placeholder="e.g. Emelie" autofocus>
      <button class="btn btn-primary btn-block" id="save-player">Save</button>
    `, () => {
      document.getElementById('save-player').addEventListener('click', () => {
        const name = document.getElementById('player-name').value.trim();
        if (!name) return;
        db.addPlayer(name);
        closeModal();
        renderPlayers();
      });
    });
  });
}

// ---------------- Decks ----------------
function renderDecks() {
  const players = db.getPlayers();
  const decks = db.getDecks();

  if (players.length === 0) {
    viewEl.innerHTML = `<div class="empty-state"><p>Add a player first, then give them a deck.</p></div>`;
    return;
  }

  viewEl.innerHTML = `
    <button class="btn btn-primary btn-block" id="add-deck-btn" style="margin-bottom:16px;">+ Add Deck</button>
    ${players.map((p) => {
      const owned = decks.filter((d) => d.ownerId === p.id);
      if (owned.length === 0) return '';
      return `
        <h3 style="margin-top:14px;">${p.name}</h3>
        <div class="card" style="padding:0;">
          ${owned.map((d) => `
            <div class="list-row">
              <div style="display:flex; align-items:center; gap:10px;">
                <div class="color-chip-row">${colorIdentityHex(d.colorIdentity).map((c) => `<span style="background:${c}"></span>`).join('')}</div>
                <div>${d.commanderName}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }).join('') || '<p>No decks yet.</p>'}
  `;
  document.getElementById('add-deck-btn').addEventListener('click', () => openAddDeckModal());
}

function openAddDeckModal(ownerId, onSaved) {
  const players = db.getPlayers();
  openModal(`
    <h2>Add Deck</h2>
    <label for="deck-owner">Piloted by</label>
    <select id="deck-owner">
      ${players.map((p) => `<option value="${p.id}" ${p.id === ownerId ? 'selected' : ''}>${p.name}</option>`).join('')}
    </select>
    <label for="deck-commander">Commander</label>
    <input type="text" id="deck-commander" placeholder="e.g. Zur the Enchanter">
    <div id="deck-preview" style="margin:10px 0;"></div>
    <button class="btn btn-primary btn-block" id="save-deck">Save Deck</button>
  `, () => {
    let fetched = null;
    const nameInput = document.getElementById('deck-commander');
    const preview = document.getElementById('deck-preview');

    nameInput.addEventListener('blur', async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      preview.innerHTML = `<p style="color:var(--text-faint);">Looking up on Scryfall…</p>`;
      fetched = await scryfall.findCommander(name);
      if (fetched) {
        nameInput.value = fetched.name;
        preview.innerHTML = `
          <div class="color-chip-row">${colorIdentityHex(fetched.colorIdentity).map((c) => `<span style="background:${c}"></span>`).join('')}</div>
          <p style="margin-top:6px;">Found on Scryfall — colors filled in automatically.</p>
        `;
      } else {
        preview.innerHTML = `<p style="color:var(--text-faint);">Couldn't find that on Scryfall — it'll be saved without color identity. You can still log games with it.</p>`;
      }
    });

    document.getElementById('save-deck').addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) return;
      const owner = document.getElementById('deck-owner').value;
      const deck = db.addDeck({
        ownerId: owner,
        commanderName: fetched?.name || name,
        colorIdentity: fetched?.colorIdentity || [],
        imageUrl: fetched?.imageUrl || null,
        scryfallId: fetched?.scryfallId || null
      });
      closeModal();
      if (onSaved) onSaved(deck);
      else renderDecks();
    });
  });
}

// ---------------- Stats ----------------
function renderStats() {
  const players = db.getPlayers();
  const games = db.getGames();

  if (games.length === 0) {
    viewEl.innerHTML = `<div class="empty-state"><span class="glyph">▤</span><p>Log a few games and stats will show up here.</p></div>`;
    return;
  }

  const byPerson = stats.winsByPerson(players, games);
  const topCommanders = stats.winsByCommanderRanked(games, 5);
  const mostPlayed = stats.mostPlayedCommanders(games, 5);
  const seatRates = stats.seatPositionWinRates(games);
  const maxPersonWins = Math.max(1, ...byPerson.map((r) => r.wins));
  const maxCmdWins = Math.max(1, ...topCommanders.map((r) => r.wins));
  const maxPlayed = Math.max(1, ...mostPlayed.map((r) => r.played));

  viewEl.innerHTML = `
    <h2>Wins by person</h2>
    <div class="card">
      ${byPerson.map((r) => barRow(r.name, r.wins, maxPersonWins, `${r.wins} win${r.wins === 1 ? '' : 's'}`)).join('')}
    </div>

    <h2>Top commanders by wins</h2>
    <div class="card">
      ${topCommanders.length ? topCommanders.map((r) => barRow(r.commanderName, r.wins, maxCmdWins, `${r.wins} win${r.wins === 1 ? '' : 's'}`)).join('') : '<p>No wins logged yet.</p>'}
    </div>

    <h2>Most played commanders</h2>
    <div class="card">
      ${mostPlayed.map((r) => barRow(r.commanderName, r.played, maxPlayed, `${r.played} game${r.played === 1 ? '' : 's'}`)).join('')}
    </div>

    <h2>Win rate by table position</h2>
    <p style="font-size:0.82rem;">Normalized so "last seat" means the same thing whether it was a 3-player or 6-player pod.</p>
    <div class="card">
      ${seatRates.map((r) => barRow(seatLabel(r.label), r.wins, Math.max(1, ...seatRates.map(x => x.played)), `${Math.round(r.winRate * 100)}% (${r.wins}/${r.played})`)).join('')}
    </div>
  `;
}

function seatLabel(l) {
  return { first: 'Went first', middle: 'Middle seat', last: 'Went last' }[l] || l;
}

function barRow(label, value, max, rightText) {
  const pct = Math.round((value / max) * 100);
  return `
    <div class="stat-bar-row">
      <div class="stat-bar-label"><span>${label}</span><span class="numeric" style="color:var(--text-faint);">${rightText}</span></div>
      <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%"></div></div>
    </div>
  `;
}

// ---------------- Log a Game flow ----------------
function startLog() {
  logState = { podSize: null, seats: [], winnerSeat: null, date: new Date().toISOString().slice(0, 10) };
  renderLogPodSize();
}

function renderLogPodSize() {
  viewEl.innerHTML = `
    <label for="log-date">Date</label>
    <input type="date" id="log-date" value="${logState.date}">
    <h2 style="margin-top:10px;">How many players?</h2>
    <div class="pill-group" id="pod-size-group">
      ${[2, 3, 4, 5, 6].map((n) => `<button class="pill" data-n="${n}">${n}</button>`).join('')}
    </div>
  `;
  document.getElementById('log-date').addEventListener('change', (e) => { logState.date = e.target.value; });
  document.querySelectorAll('#pod-size-group .pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      logState.podSize = parseInt(btn.dataset.n, 10);
      logState.seats = Array.from({ length: logState.podSize }, (_, i) => ({ seat: i + 1 }));
      renderLogSeats();
    });
  });
}

function renderLogSeats() {
  const allFilled = logState.seats.every((s) => s.playerId);
  viewEl.innerHTML = `
    <h2>Tap each seat, in turn order</h2>
    <p>Seat 1 went first. Tap a seat to assign who sat there.</p>
    <div id="log-wheel" class="table-wheel"></div>
    <button class="btn btn-primary btn-block" id="to-winner-step" ${allFilled ? '' : 'disabled'} style="${allFilled ? '' : 'opacity:0.4;'}">
      Everyone seated — pick the winner
    </button>
    <button class="btn btn-ghost btn-block" id="cancel-log" style="margin-top:8px;">Cancel</button>
  `;
  const wheel = document.getElementById('log-wheel');
  const slots = renderTableSeats(wheel, logState.podSize);
  logState.seats.forEach((s, i) => {
    if (s.playerId) {
      fillSeat(slots[i], { playerName: s.playerName, colorHexes: colorIdentityHex(s.colorIdentity), isWinner: false });
    }
    slots[i].addEventListener('click', () => openAssignSeatModal(i));
  });
  if (allFilled) {
    document.getElementById('to-winner-step').addEventListener('click', renderLogWinner);
  }
  document.getElementById('cancel-log').addEventListener('click', () => navigate('home'));
}

function openAssignSeatModal(seatIndex) {
  const players = db.getPlayers();
  const takenIds = logState.seats.filter((s) => s.playerId).map((s) => s.playerId);

  openModal(`
    <h2>Seat ${seatIndex + 1}</h2>
    <label for="seat-player">Player</label>
    <select id="seat-player">
      <option value="">Choose…</option>
      ${players.map((p) => `<option value="${p.id}" ${takenIds.includes(p.id) ? 'disabled' : ''}>${p.name}${takenIds.includes(p.id) ? ' (already seated)' : ''}</option>`).join('')}
      <option value="__new__">+ New player</option>
    </select>
    <div id="deck-select-wrap"></div>
  `, () => {
    const playerSelect = document.getElementById('seat-player');
    playerSelect.addEventListener('change', () => handleSeatPlayerChange(playerSelect.value, seatIndex));
  });
}

function handleSeatPlayerChange(value, seatIndex) {
  if (value === '__new__') {
    openModal(`
      <h2>New Player</h2>
      <label for="new-player-name">Name</label>
      <input type="text" id="new-player-name" autofocus>
      <button class="btn btn-primary btn-block" id="save-new-player">Save & Continue</button>
    `, () => {
      document.getElementById('save-new-player').addEventListener('click', () => {
        const name = document.getElementById('new-player-name').value.trim();
        if (!name) return;
        const player = db.addPlayer(name);
        showDeckStepForPlayer(player, seatIndex);
      });
    });
    return;
  }
  if (!value) return;
  const player = db.getPlayers().find((p) => p.id === value);
  showDeckStepForPlayer(player, seatIndex);
}

function showDeckStepForPlayer(player, seatIndex) {
  const decks = db.getDecks().filter((d) => d.ownerId === player.id);
  openModal(`
    <h2>${player.name}'s deck</h2>
    <label for="seat-deck">Commander</label>
    <select id="seat-deck">
      <option value="">Choose…</option>
      ${decks.map((d) => `<option value="${d.id}">${d.commanderName}</option>`).join('')}
      <option value="__new__">+ New deck</option>
    </select>
  `, () => {
    document.getElementById('seat-deck').addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === '__new__') {
        openAddDeckModal(player.id, (deck) => assignSeat(seatIndex, player, deck));
      } else if (val) {
        const deck = decks.find((d) => d.id === val);
        assignSeat(seatIndex, player, deck);
      }
    });
  });
}

function assignSeat(seatIndex, player, deck) {
  logState.seats[seatIndex] = {
    seat: seatIndex + 1,
    playerId: player.id,
    playerName: player.name,
    deckId: deck.id,
    commanderName: deck.commanderName,
    colorIdentity: deck.colorIdentity
  };
  closeModal();
  renderLogSeats();
}

function renderLogWinner() {
  viewEl.innerHTML = `
    <h2>Who won?</h2>
    <p>Tap the winning seat.</p>
    <div id="winner-wheel" class="table-wheel"></div>
    <button class="btn btn-primary btn-block" id="save-game-btn" disabled style="opacity:0.4;">Save Game</button>
    <button class="btn btn-ghost btn-block" id="back-to-seats" style="margin-top:8px;">Back</button>
  `;
  const wheel = document.getElementById('winner-wheel');
  const slots = renderTableSeats(wheel, logState.podSize);
  logState.seats.forEach((s, i) => {
    fillSeat(slots[i], { playerName: s.playerName, colorHexes: colorIdentityHex(s.colorIdentity), isWinner: s.playerId === logState.winnerSeat });
    slots[i].addEventListener('click', () => {
      logState.winnerSeat = s.playerId;
      renderLogWinner();
    });
  });
  document.getElementById('back-to-seats').addEventListener('click', renderLogSeats);
  const saveBtn = document.getElementById('save-game-btn');
  if (logState.winnerSeat) {
    saveBtn.disabled = false;
    saveBtn.style.opacity = 1;
    saveBtn.addEventListener('click', saveGame);
  }
}

function saveGame() {
  const winnerSeatData = logState.seats.find((s) => s.playerId === logState.winnerSeat);
  db.addGame({
    date: new Date(logState.date).getTime(),
    podSize: logState.podSize,
    seats: logState.seats,
    winnerId: logState.winnerSeat,
    winningDeckId: winnerSeatData.deckId
  });
  logState = null;
  navigate('home');
}

// ---------------- Init ----------------
navigate('home');
