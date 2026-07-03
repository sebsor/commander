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
  const titles = { home: '', players: 'Players', decks: 'Commanders', stats: 'Stats', log: 'Log a Game' };
  headerTitle.textContent = titles[view] ?? 'Round Table';
  closeModal();
  viewEl.classList.remove('has-action-bar'); // only renderPlayers/renderDecks opt back in
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
      <img src="icons/logo-full.png" alt="The Tavern Ledger" style="display:block; width:260px; max-width:78%; margin:8px auto 0;">
      <div class="empty-state" style="margin-top: 34px;">
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
    <img src="icons/logo-full.png" alt="The Tavern Ledger" style="display:block; width:260px; max-width:78%; margin:8px auto 22px;">
    <button class="btn btn-primary btn-block" id="log-game-btn" style="padding:17px; font-size:1.05rem; margin-bottom:20px;">
      + Log a Game
    </button>
    <h2>Recent games</h2>
    ${recent.length === 0 ? `<p>No games logged yet.</p>` : recent.map(gameRowHTML).join('')}
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
    <div class="card list-row" id="game-${g.id}" style="cursor:pointer;">
      <div style="display:flex; align-items:center; gap:12px;">
        ${avatarHTML(winnerSeat?.playerName || '?', 42)}
        <div>
          <div style="font-weight:700;">${winnerSeat?.playerName || '—'} <span style="color:var(--ink-faint); font-weight:500;">won</span></div>
          <div style="font-size:0.8rem; color:var(--ink-dim);">${winnerSeat?.commanderName || 'Unknown commander'} · ${g.podSize} players</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div class="color-chip-row" style="justify-content:flex-end; margin-bottom:4px;">
          ${chips.map((c) => `<span style="background:${c}"></span>`).join('')}
        </div>
        <div class="numeric" style="font-size:0.72rem; color:var(--ink-faint);">${dateStr}</div>
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

  viewEl.classList.add('has-action-bar');
  viewEl.innerHTML = `
    ${players.length === 0 ? `<p>No players yet — use the button below to add one.</p>` : winRows.map((r) => `
      <div class="card list-row">
        <div style="display:flex; align-items:center; gap:12px; flex:1;">
          ${avatarHTML(r.name, 44)}
          <div style="flex:1;">
            <div style="font-weight:700;">${r.name}</div>
            <div class="stat-bar-track" style="margin-top:6px;">
              <div class="stat-bar-fill" style="width:${Math.round(r.winRate * 100)}%; background:${rateColor(r.winRate)};"></div>
            </div>
          </div>
        </div>
        <div style="text-align:right; margin-left:10px;">
          <div class="numeric">${Math.round(r.winRate * 100)}%</div>
          <div style="font-size:0.68rem; color:var(--ink-faint);">${r.wins}/${r.played}</div>
        </div>
      </div>
    `).join('')}
    <div class="action-bar">
      <button class="btn btn-primary" id="add-player-btn">+ Add Player</button>
    </div>
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

// ---------------- Commanders ----------------
// Internally these stay "decks" throughout the code (db.getDecks, addDeck,
// the deck data model) since that's still an accurate name for the data
// itself — a deck record. Only the user-facing label changed to "Commander",
// since that's the more accurate word for what a person actually picks when
// using this screen. Renaming every internal reference too would just be
// churn/risk for a label-only change.
function renderDecks() {
  const players = db.getPlayers();
  const decks = db.getDecks();

  if (players.length === 0) {
    viewEl.classList.remove('has-action-bar');
    viewEl.innerHTML = `<div class="empty-state"><p>Add a player first, then give them a commander.</p></div>`;
    return;
  }

  viewEl.classList.add('has-action-bar');
  viewEl.innerHTML = `
    ${players.map((p) => {
      const owned = decks.filter((d) => d.ownerId === p.id);
      if (owned.length === 0) return '';
      return `
        <h3 style="margin-top:16px;">${p.name}</h3>
        ${owned.map((d) => `
          <div class="card list-row">
            <div style="display:flex; align-items:center; gap:12px;">
              <div class="color-chip-row">${colorIdentityHex(d.colorIdentity).map((c) => `<span style="background:${c}"></span>`).join('')}</div>
              <div style="font-weight:600;">${d.commanderName}</div>
            </div>
          </div>
        `).join('')}
      `;
    }).join('') || '<p>No commanders yet — use the button below to add one.</p>'}
    <div class="action-bar">
      <button class="btn btn-primary" id="add-deck-btn">+ Add Commander</button>
    </div>
  `;
  document.getElementById('add-deck-btn').addEventListener('click', () => openAddDeckModal());
}

function openAddDeckModal(ownerId, onSaved, preselected) {
  const players = db.getPlayers();
  const chosenCommander = preselected || null;

  openModal(`
    <h2>Add Commander</h2>
    <label for="deck-owner">Piloted by</label>
    <select id="deck-owner">
      ${players.map((p) => `<option value="${p.id}" ${p.id === ownerId ? 'selected' : ''}>${p.name}</option>`).join('')}
    </select>
    <label>Commander</label>
    <div id="deck-commander-slot"></div>
    <button class="btn btn-primary btn-block" id="save-deck" style="margin-top:10px;">Save Commander</button>
  `, () => {
    const slot = document.getElementById('deck-commander-slot');
    const saveBtn = document.getElementById('save-deck');

    function renderSlot() {
      if (!chosenCommander) {
        slot.innerHTML = `<button class="btn btn-block" id="choose-commander-btn">Choose Commander…</button>`;
        document.getElementById('choose-commander-btn').addEventListener('click', launchPicker);
        saveBtn.disabled = true;
        saveBtn.style.opacity = 0.4;
      } else {
        slot.innerHTML = `
          <div class="card" style="display:flex; align-items:center; gap:12px; margin-top:4px;">
            ${chosenCommander.imageUrl ? `<img src="${chosenCommander.imageUrl}" alt="" style="width:56px; height:56px; object-fit:cover; border-radius:6px; flex-shrink:0;">` : ''}
            <div style="flex:1; min-width:0;">
              <div style="font-weight:500;">${chosenCommander.name}</div>
              <div class="color-chip-row" style="margin-top:4px;">${colorIdentityHex(chosenCommander.colorIdentity).map((c) => `<span style="background:${c}"></span>`).join('')}</div>
            </div>
            <button class="btn btn-ghost" id="change-commander-btn">Change</button>
          </div>
        `;
        document.getElementById('change-commander-btn').addEventListener('click', launchPicker);
        saveBtn.disabled = false;
        saveBtn.style.opacity = 1;
      }
    }

    // The picker opens its own modal, which replaces this one in modal-root
    // (there's only ever one modal on screen). So instead of trying to keep
    // this Add Deck modal alive underneath it, we close over the current
    // owner selection and simply re-open Add Deck fresh once a commander
    // comes back — same pattern as the seat-assignment flow uses.
    function launchPicker() {
      const currentOwner = document.getElementById('deck-owner').value;
      openCommanderPicker((commander) => {
        openAddDeckModal(currentOwner, onSaved, commander);
      });
    }

    renderSlot();

    saveBtn.addEventListener('click', () => {
      if (!chosenCommander) return;
      const owner = document.getElementById('deck-owner').value;
      const deck = db.addDeck({
        ownerId: owner,
        commanderName: chosenCommander.name,
        colorIdentity: chosenCommander.colorIdentity || [],
        imageUrl: chosenCommander.imageUrl || null,
        scryfallId: chosenCommander.scryfallId || null
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
  const colorAll = stats.colorBreakdown(games);
  const comboAll = stats.colorComboBreakdown(games);
  const maxPersonWins = Math.max(1, ...byPerson.map((r) => r.wins));
  const maxCmdWins = Math.max(1, ...topCommanders.map((r) => r.wins));
  const maxPlayed = Math.max(1, ...mostPlayed.map((r) => r.played));
  const maxColorPlayed = Math.max(1, ...colorAll.map((r) => r.played));
  const maxComboPlayed = Math.max(1, ...comboAll.map((r) => r.played));

  viewEl.innerHTML = `
    <h2>Wins by person</h2>
    <div class="card">
      ${byPerson.map((r) => barRow(r.name, r.wins, maxPersonWins, `${r.wins} win${r.wins === 1 ? '' : 's'}`, rateColor(r.winRate))).join('')}
    </div>

    <h2>Top commanders by wins</h2>
    <div class="card card-dark">
      ${topCommanders.length ? topCommanders.map((r) => barRow(r.commanderName, r.wins, maxCmdWins, `${r.wins} win${r.wins === 1 ? '' : 's'}`, 'var(--accent)', true)).join('') : '<p style="color:rgba(243,237,227,0.6);">No wins logged yet.</p>'}
    </div>

    <h2>Most played commanders</h2>
    <div class="card">
      ${mostPlayed.map((r) => barRow(r.commanderName, r.played, maxPlayed, `${r.played} game${r.played === 1 ? '' : 's'}`)).join('')}
    </div>

    <h2>Win rate by table position</h2>
    <div class="card">
      <div class="gauge-row">
        ${seatRates.map((r) => `
          <div>
            ${arcGaugeHTML({ percent: r.winRate * 100, size: 96, strokeWidth: 9, color: rateColor(r.winRate), valueText: `${Math.round(r.winRate * 100)}%`, labelText: `${r.wins}/${r.played}` })}
            <div class="gauge-caption">${seatLabel(r.label)}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <h2>Color combinations — everyone</h2>
    <div class="card">
      ${comboAll.length ? comboAll.map((r) => comboBarRow(r, maxComboPlayed)).join('') : '<p>No color data yet.</p>'}
    </div>

    <h2>Color combinations by player</h2>
    <label for="combo-player-select">Player</label>
    <select id="combo-player-select">
      ${players.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}
    </select>
    <div class="card" id="combo-by-player-card"></div>

    <h2>Individual colors</h2>
    <div class="card">
      ${colorAll.length ? colorAll.map((r) => colorBarRow(r, maxColorPlayed)).join('') : '<p>No color data yet.</p>'}
    </div>

    <h2>Colors by player</h2>
    <label for="color-player-select">Player</label>
    <select id="color-player-select">
      ${players.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}
    </select>
    <div class="card" id="color-by-player-card"></div>
  `;

  const colorPlayerSelect = document.getElementById('color-player-select');
  function renderColorByPlayer() {
    const rows = stats.colorBreakdown(games, colorPlayerSelect.value);
    const max = Math.max(1, ...rows.map((r) => r.played));
    document.getElementById('color-by-player-card').innerHTML = rows.length
      ? rows.map((r) => colorBarRow(r, max)).join('')
      : '<p>No games logged for this player yet.</p>';
  }
  colorPlayerSelect.addEventListener('change', renderColorByPlayer);
  renderColorByPlayer();

  const comboPlayerSelect = document.getElementById('combo-player-select');
  function renderComboByPlayer() {
    const rows = stats.colorComboBreakdown(games, comboPlayerSelect.value);
    const max = Math.max(1, ...rows.map((r) => r.played));
    document.getElementById('combo-by-player-card').innerHTML = rows.length
      ? rows.map((r) => comboBarRow(r, max)).join('')
      : '<p>No games logged for this player yet.</p>';
  }
  comboPlayerSelect.addEventListener('change', renderComboByPlayer);
  renderComboByPlayer();
}

function seatLabel(l) {
  return { first: 'Went first', middle: 'Middle seat', last: 'Went last' }[l] || l;
}

function barRow(label, value, max, rightText, fillColor = 'var(--accent)', onDark = false) {
  const pct = Math.round((value / max) * 100);
  const textColor = onDark ? 'rgba(243,237,227,0.55)' : 'var(--ink-faint)';
  const labelColor = onDark ? 'var(--dark-card-text)' : 'var(--ink)';
  return `
    <div class="stat-bar-row">
      <div class="stat-bar-label"><span style="color:${labelColor};">${label}</span><span class="numeric" style="color:${textColor};">${rightText}</span></div>
      <div class="stat-bar-track" style="background:${onDark ? 'rgba(255,255,255,0.12)' : 'var(--surface-alt)'};"><div class="stat-bar-fill" style="width:${pct}%; background:${fillColor};"></div></div>
    </div>
  `;
}

function colorBarRow(row, max) {
  const pct = Math.round((row.played / max) * 100);
  const fill = MANA_COLORS[row.color]?.hex || 'var(--ink-faint)';
  return `
    <div class="stat-bar-row">
      <div class="stat-bar-label">
        <span style="display:flex; align-items:center; gap:6px;"><img src="${manaSymbolUrl(row.color)}" alt="" style="width:15px; height:15px;">${row.label}</span>
        <span class="numeric" style="color:var(--ink-faint);">${row.played} played · ${row.wins} won (${Math.round(row.winRate * 100)}%)</span>
      </div>
      <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%; background:${fill};"></div></div>
    </div>
  `;
}

function comboBarRow(row, max) {
  const pct = Math.round((row.played / max) * 100);
  const chips = colorIdentityHex(row.colors);
  return `
    <div class="stat-bar-row">
      <div class="stat-bar-label">
        <span style="display:flex; align-items:center; gap:8px;">
          <span class="color-chip-row">${chips.map((c) => `<span style="background:${c}"></span>`).join('')}</span>
          ${row.label}
        </span>
        <span class="numeric" style="color:var(--ink-faint);">${row.played} played · ${row.wins} won (${Math.round(row.winRate * 100)}%)</span>
      </div>
      <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%;"></div></div>
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
    <h2>${player.name}'s commander</h2>
    <label for="seat-deck">Commander</label>
    <select id="seat-deck">
      <option value="">Choose…</option>
      ${decks.map((d) => `<option value="${d.id}">${d.commanderName}</option>`).join('')}
      <option value="__new__">+ New commander</option>
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
