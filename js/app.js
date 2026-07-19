// app.js — view rendering + navigation. No framework: small enough that
// plain DOM manipulation stays readable, and it keeps the single-file-per-
// concern structure (db / scryfall / table / stats / app) easy to follow.

// Must be bumped alongside sw.js's CACHE_NAME on every change — they're two
// separate constants in two separate files for two different audiences (this
// one is for a human to glance at, that one is for the browser's cache), so
// nothing keeps them in sync automatically. Bumping this is now part of the
// same routine as bumping the cache version.
const APP_VERSION = 'v45';

const viewEl = document.getElementById('view');
const headerTitle = document.getElementById('header-title');
const headerVersion = document.getElementById('header-version');
const headerEl = document.getElementById('app-header');
const modalRoot = document.getElementById('modal-root');
const navButtons = document.querySelectorAll('.bottom-nav button');

let logState = null; // holds in-progress game while logging

function setActiveNav(view) {
  navButtons.forEach((b) => b.classList.toggle('active', b.dataset.view === view));
}

function navigate(view) {
  setActiveNav(view);
  const titles = { home: '', players: 'Players', decks: 'Commanders', stats: 'Stats', log: 'Log a Game', achievements: 'Achievements' };
  headerTitle.textContent = titles[view] ?? 'Round Table';
  headerVersion.textContent = view === 'home' ? APP_VERSION : '';
  headerEl.classList.toggle('compact', view === 'home');
  closeModal();
  viewEl.classList.remove('has-action-bar'); // only renderPlayers/renderDecks opt back in
  if (view === 'home') renderHome();
  else if (view === 'players') renderPlayers();
  else if (view === 'decks') renderDecks();
  else if (view === 'stats') renderStats();
  else if (view === 'log') startLog();
  else if (view === 'achievements') renderAchievements();
}

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => navigate(btn.dataset.view));
});

// ---------------- Modal helper ----------------
// Fixed-body scroll lock — locks the page behind any open modal.
// `overflow: hidden` on body is the obvious fix, but it's specifically
// unreliable on iOS Safari: touch scroll can bypass it entirely, since it
// only hides the scrollbar rather than making the page un-scrollable. Pinning
// body with position:fixed physically removes it from anything scrollable,
// which is why this is the technique that actually holds on iOS. We record
// the exact scroll position first and restore it on unlock, since a fixed
// body always visually resets to the top otherwise.
let savedScrollY = 0;
let scrollLocked = false;

function lockBodyScroll() {
  if (scrollLocked) return; // a chained modal (one replacing another) — already locked, don't re-capture
  savedScrollY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${savedScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  scrollLocked = true;
}

function unlockBodyScroll() {
  if (!scrollLocked) return;
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  window.scrollTo(0, savedScrollY);
  scrollLocked = false;
}

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
  lockBodyScroll();
  adjustModalForViewport();
  if (onMount) onMount();
}
function closeModal() {
  modalRoot.innerHTML = '';
  unlockBodyScroll();
}

// Mobile keyboards shrink the *visual* viewport (what's actually on screen)
// without shrinking the *layout* viewport that `position: fixed` elements
// are normally anchored to — so a fixed modal backdrop doesn't "know" the
// keyboard opened and stays sized to the full page, letting the keyboard
// cover whatever's near the bottom of the sheet (exactly where a text input
// usually sits). The VisualViewport API's resize/scroll events fire
// specifically when the keyboard opens, closes, or the page pans, so we use
// those to keep the backdrop's own height/position matched to what's
// genuinely visible. Since the sheet is bottom-aligned inside the backdrop
// (align-items: flex-end in CSS), shrinking the backdrop to the visible
// area naturally pulls the sheet up above the keyboard instead of letting
// it sit off-screen underneath it.
function adjustModalForViewport() {
  const backdrop = document.getElementById('modal-backdrop');
  if (!backdrop || !window.visualViewport) return;
  const vv = window.visualViewport;
  backdrop.style.height = vv.height + 'px';
  backdrop.style.top = vv.offsetTop + 'px';
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', adjustModalForViewport);
  window.visualViewport.addEventListener('scroll', adjustModalForViewport);
}

// ---------------- Home ----------------
function renderHome() {
  const players = db.getPlayers();
  const games = db.getGames();

  if (players.length === 0) {
    viewEl.innerHTML = `
      <img src="icons/logo-full.png" alt="The Tavern Ledger" id="home-logo" class="reset-trigger" style="display:block; width:200px; max-width:70%; margin:4px auto 0;">
      <div class="empty-state" style="margin-top: 34px;">
        <span class="glyph">♜</span>
        <h2>Set the table</h2>
        <p>Add a player or two before logging your first game.</p>
        <button class="btn btn-primary" id="go-players">Add players</button>
      </div>
    `;
    document.getElementById('go-players').addEventListener('click', () => navigate('players'));
    attachResetTrigger(document.getElementById('home-logo'));
    return;
  }

  const recent = games.slice(0, 6);
  viewEl.classList.add('has-action-bar');
  viewEl.innerHTML = `
    <img src="icons/logo-full.png" alt="The Tavern Ledger" id="home-logo" class="reset-trigger" style="display:block; width:200px; max-width:70%; margin:4px auto 18px;">
    <h2>Recent games</h2>
    ${recent.length === 0 ? `<p>No games logged yet.</p>` : recent.map(gameRowHTML).join('')}
    <div class="action-bar">
      <button class="btn btn-primary" id="log-game-btn">+ Log a Game</button>
    </div>
  `;
  document.getElementById('log-game-btn').addEventListener('click', () => navigate('log'));
  attachResetTrigger(document.getElementById('home-logo'));
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

// Hold the logo for 6s to reach the reset flow — deliberately hidden rather
// than a visible danger-zone button, since wiping every player/commander/game
// should be as close to impossible-by-accident as a UI action gets. Pointer
// events (not separate touch/mouse listeners) unify touch and mouse handling
// in one set of listeners, since a "press and hold" gesture means the same
// thing regardless of input type.
const RESET_HOLD_MS = 6000;
let resetHoldTimer = null;

function attachResetTrigger(logoEl) {
  if (!logoEl) return;
  const start = () => {
    logoEl.classList.add('holding');
    resetHoldTimer = setTimeout(() => {
      logoEl.classList.remove('holding');
      openResetConfirmModal();
    }, RESET_HOLD_MS);
  };
  const cancel = () => {
    clearTimeout(resetHoldTimer);
    logoEl.classList.remove('holding');
  };
  logoEl.addEventListener('pointerdown', start);
  logoEl.addEventListener('pointerup', cancel);
  logoEl.addEventListener('pointerleave', cancel);
  logoEl.addEventListener('pointercancel', cancel);
}

function openResetConfirmModal() {
  openModal(`
    <h2>Reset all data?</h2>
    <p>This permanently deletes every player, commander, and game. There's no undo.</p>
    <button class="btn btn-danger btn-block" id="confirm-reset">Reset Everything</button>
    <button class="btn btn-ghost btn-block" id="cancel-reset" style="margin-top:8px;">Cancel</button>
  `, () => {
    document.getElementById('confirm-reset').addEventListener('click', () => {
      db.resetAll();
      closeModal();
      navigate('home');
    });
    document.getElementById('cancel-reset').addEventListener('click', closeModal);
  });
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
      <div class="card list-row tappable-row" id="player-${r.playerId}">
        <div style="display:flex; align-items:center; gap:12px; flex:1;">
          ${avatarHTML(r.name, 44)}
          <div style="flex:1;">
            <div style="font-weight:700;">${r.name}</div>
            <div class="stat-bar-track" style="margin-top:6px;">
              <div class="stat-bar-fill" style="width:${Math.round(r.winRate * 100)}%; background:${rateColor(r.winRate)}; opacity:${sampleSizeOpacity(r.played)};"></div>
            </div>
          </div>
        </div>
        <div style="text-align:right; margin-left:10px;">
          <div class="numeric" style="opacity:${sampleSizeOpacity(r.played)};">${Math.round(r.winRate * 100)}%</div>
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
  winRows.forEach((r) => {
    const el = document.getElementById('player-' + r.playerId);
    if (el) el.addEventListener('click', () => openEditPlayerModal(r.playerId, r.name));
  });
}

// Only the name is editable here — id and createdAt are left untouched by
// db.updatePlayer's Object.assign merge, since we only ever pass {name: ...}.
// Stats aren't stored on the player at all (winsByPerson computes them fresh
// from games/seats every render, looked up by id), so renaming can't corrupt
// or orphan anything win/loss-related — there's no derived data to go stale.
function openEditPlayerModal(playerId, currentName) {
  openModal(`
    <h2>Edit Player</h2>
    <label for="edit-player-name">Name</label>
    <input type="text" id="edit-player-name" value="${currentName}" autofocus>
    <button class="btn btn-primary btn-block" id="save-edit-player">Save</button>
  `, () => {
    document.getElementById('save-edit-player').addEventListener('click', () => {
      const name = document.getElementById('edit-player-name').value.trim();
      if (!name) return;
      db.updatePlayer(playerId, { name });
      closeModal();
      renderPlayers();
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
  const games = db.getGames();

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
        ${owned.map((d) => {
          const s = stats.deckStats(games, d.id);
          return `
          <div class="card list-row tappable-row" id="deck-${d.id}">
            <div style="display:flex; align-items:center; gap:12px;">
              <div class="color-chip-row">${colorIdentityHex(d.colorIdentity).map((c) => `<span style="background:${c}"></span>`).join('')}</div>
              <div style="font-weight:600;">${d.commanderName}</div>
            </div>
            <div style="text-align:right;">
              <div class="numeric" style="color:${s.played ? rateColor(s.winRate) : 'var(--ink-faint)'}; opacity:${sampleSizeOpacity(s.played)};">${s.played ? Math.round(s.winRate * 100) + '%' : '—'}</div>
              <div style="font-size:0.68rem; color:var(--ink-faint);">${s.wins}/${s.played}</div>
            </div>
          </div>
        `;
        }).join('')}
      `;
    }).join('') || '<p>No commanders yet — use the button below to add one.</p>'}
    <div class="action-bar">
      <button class="btn btn-primary" id="add-deck-btn">+ Add Commander</button>
    </div>
  `;
  document.getElementById('add-deck-btn').addEventListener('click', () => openAddDeckModal());
  decks.forEach((d) => {
    const el = document.getElementById('deck-' + d.id);
    if (el) el.addEventListener('click', () => showCommanderPreview(d));
  });
}

// Scryfall's /cards/:id endpoint, given format=image, responds with an HTTP
// redirect straight to the image file — so this URL can go directly into an
// <img src> with no separate fetch/JSON step needed. "version=large" gets
// the full card face, not just the cropped artwork we store as imageUrl
// (that field only holds art_crop, meant for small accent use elsewhere —
// it was never meant to stand in for the whole card in a big preview).
function showCommanderPreview(d) {
  const chips = colorIdentityHex(d.colorIdentity);
  const chipRow = `<div class="color-chip-row" style="margin-bottom:10px;">${chips.map((c) => `<span style="background:${c}"></span>`).join('')}</div>`;
  const deleteBtnHtml = `<button class="btn btn-danger btn-block" id="delete-deck" style="margin-top:14px;">Delete this commander</button>`;
  const wireDeleteButton = () => {
    document.getElementById('delete-deck').addEventListener('click', () => {
      db.deleteDeck(d.id);
      closeModal();
      renderDecks();
    });
  };

  if (d.scryfallId) {
    openModal(`
      <h2>${d.commanderName}</h2>
      ${chipRow}
      <div class="img-loading-wrap">
        <span class="img-loading-text" id="card-preview-status">Loading image…</span>
        <img id="card-preview-img" src="https://api.scryfall.com/cards/${d.scryfallId}?format=image&version=large" alt="${d.commanderName}">
      </div>
      ${deleteBtnHtml}
    `, () => {
      const img = document.getElementById('card-preview-img');
      const status = document.getElementById('card-preview-status');
      img.addEventListener('load', () => {
        img.classList.add('loaded');
        status.style.display = 'none';
      });
      img.addEventListener('error', () => {
        status.textContent = "Couldn't load the image.";
      });
      wireDeleteButton();
    });
  } else if (d.imageUrl) {
    // Older decks (added back when manual entry existed, or a commander
    // Scryfall couldn't match) may only have the art crop stored, never a
    // scryfallId — so this is a genuinely different, lower-quality fallback,
    // not a silent substitute. Said so explicitly rather than passing a
    // cropped illustration off as the full card.
    openModal(`
      <h2>${d.commanderName}</h2>
      ${chipRow}
      <img src="${d.imageUrl}" alt="${d.commanderName}" style="width:100%; border-radius:16px; display:block; box-shadow:var(--shadow-lg);">
      <p style="font-size:0.8rem; margin-top:10px;">Only the artwork is available for this commander, not the full card — it was added before Scryfall matching was required.</p>
      ${deleteBtnHtml}
    `, wireDeleteButton);
  } else {
    openModal(`
      <h2>${d.commanderName}</h2>
      ${chipRow}
      <p>No image available for this commander.</p>
      ${deleteBtnHtml}
    `, wireDeleteButton);
  }
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

// ---------------- Achievements ----------------
function renderAchievements() {
  const games = db.getGames();
  const players = db.getPlayers();

  const milestonesHtml = MILESTONES.map((m) => achievementBadgeHTML(m.name, m.description, m.check(games))).join('');

  const playerSectionsHtml = players.map((p) => {
    const badges = PLAYER_ACHIEVEMENTS.map((a) => achievementBadgeHTML(a.name, a.description, a.check(p.id, games))).join('');
    return `<h3 style="margin-top:18px;">${p.name}</h3><div class="achievement-grid">${badges}</div>`;
  }).join('');

  viewEl.innerHTML = `
    <h2>Milestones</h2>
    <div class="achievement-grid">${milestonesHtml}</div>
    ${playerSectionsHtml || '<p>Add players to start unlocking achievements.</p>'}
  `;
}

function achievementBadgeHTML(name, description, unlocked) {
  return `
    <div class="achievement-badge ${unlocked ? 'unlocked' : 'locked'}">
      <div class="achievement-icon">${unlocked ? '🏆' : '🔒'}</div>
      <div class="achievement-name">${name}</div>
      <div class="achievement-desc">${description}</div>
    </div>
  `;
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
  // Passing Infinity as the limit is a clean way to get "everything" out of
  // these two functions without adding a second code path just for the
  // full-list case — .slice(0, Infinity) just returns the whole array.
  const topCommandersFull = stats.winsByCommanderRanked(games, Infinity);
  const mostPlayedFull = stats.mostPlayedCommanders(games, Infinity);
  const topCommanders = topCommandersFull.slice(0, 3);
  const mostPlayed = mostPlayedFull.slice(0, 3);
  const seatRates = stats.seatPositionWinRates(games);
  const colorAll = stats.colorBreakdown(games);
  const comboAll = stats.colorComboBreakdown(games);
  // Max is computed from the *full* list, but since everything's sorted
  // descending, the top-3 slice always contains that same max value anyway —
  // so bar widths stay visually consistent whether you're looking at the
  // page or the "view all" modal.
  const maxPersonWins = Math.max(1, ...byPerson.map((r) => r.wins));
  const maxCmdWins = Math.max(1, ...topCommandersFull.map((r) => r.wins));
  const maxPlayed = Math.max(1, ...mostPlayedFull.map((r) => r.played));
  const maxColorPlayed = Math.max(1, ...colorAll.map((r) => r.played));
  const maxComboPlayed = Math.max(1, ...comboAll.map((r) => r.played));

  viewEl.innerHTML = `
    <h2>Wins by person</h2>
    <div class="card">
      ${byPerson.slice(0, 3).map((r) => `<div id="wbp-${r.playerId}" class="tappable-row">${barRow(r.name, r.wins, maxPersonWins, `${r.wins} win${r.wins === 1 ? '' : 's'}`, rateColor(r.winRate))}</div>`).join('')}
    </div>
    ${byPerson.length > 3 ? `<button class="btn btn-ghost" id="view-all-person">View all ${byPerson.length} players</button>` : ''}

    <h2>Top commanders by wins</h2>
    <div class="card card-dark">
      ${topCommanders.length ? topCommanders.map((r) => barRow(r.commanderName, r.wins, maxCmdWins, `${r.wins} win${r.wins === 1 ? '' : 's'}`, 'var(--accent)', true)).join('') : '<p style="color:rgba(243,237,227,0.6);">No wins logged yet.</p>'}
    </div>
    ${topCommandersFull.length > 3 ? `<button class="btn btn-ghost" id="view-all-commanders">View all ${topCommandersFull.length} commanders</button>` : ''}

    <h2>Most played commanders</h2>
    <div class="card">
      ${mostPlayed.map((r) => barRow(r.commanderName, r.played, maxPlayed, `${r.played} game${r.played === 1 ? '' : 's'}`)).join('')}
    </div>
    ${mostPlayedFull.length > 3 ? `<button class="btn btn-ghost" id="view-all-played">View all ${mostPlayedFull.length} commanders</button>` : ''}

    <h2>Win rate by table position</h2>
    <div class="card">
      <div class="gauge-row">
        ${seatRates.map((r) => `
          <div>
            ${arcGaugeHTML({ percent: r.winRate * 100, size: 96, strokeWidth: 9, color: rateColor(r.winRate), valueText: `${Math.round(r.winRate * 100)}%` })}
            <div class="gauge-caption">${seatLabel(r.label)}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <h2>Winning color combinations — everyone</h2>
    <div class="card">
      ${comboAll.length ? comboAll.map((r) => comboBarRow(r, maxComboPlayed)).join('') : '<p>No color data yet.</p>'}
    </div>

    <h2>Winning individual colors</h2>
    <div class="card">
      ${colorAll.length ? colorAll.map((r) => colorBarRow(r, maxColorPlayed)).join('') : '<p>No color data yet.</p>'}
    </div>
  `;

  byPerson.slice(0, 3).forEach((r) => {
    const el = document.getElementById('wbp-' + r.playerId);
    if (el) el.addEventListener('click', () => showPlayerDetailModal(r.playerId, r.name));
  });

  const viewAllPerson = document.getElementById('view-all-person');
  if (viewAllPerson) {
    viewAllPerson.addEventListener('click', () => {
      openStatListModal('Wins by person', byPerson.map((r) => barRow(r.name, r.wins, maxPersonWins, `${r.wins} win${r.wins === 1 ? '' : 's'}`, rateColor(r.winRate))).join(''));
    });
  }

  const viewAllCommanders = document.getElementById('view-all-commanders');
  if (viewAllCommanders) {
    viewAllCommanders.addEventListener('click', () => {
      openStatListModal('Top commanders by wins', topCommandersFull.map((r) => barRow(r.commanderName, r.wins, maxCmdWins, `${r.wins} win${r.wins === 1 ? '' : 's'}`, 'var(--accent)')).join(''));
    });
  }

  const viewAllPlayed = document.getElementById('view-all-played');
  if (viewAllPlayed) {
    viewAllPlayed.addEventListener('click', () => {
      openStatListModal('Most played commanders', mostPlayedFull.map((r) => barRow(r.commanderName, r.played, maxPlayed, `${r.played} game${r.played === 1 ? '' : 's'}`)).join(''));
    });
  }
}


// Combines three things that were previously spread across the page: a
// player's commanders (with the per-deck win rate from stats.deckStats,
// same function the Commanders tab rows use), and their color combination
// and individual-color breakdowns (previously separate dropdown-driven
// sections lower on the Stats page — moved here since "this player's colors"
// is naturally part of their profile, not a separate standing section).
function showPlayerDetailModal(playerId, playerName) {
  const games = db.getGames();
  const playerDecks = db.getDecks().filter((d) => d.ownerId === playerId);
  const comboRows = stats.colorComboBreakdown(games, playerId);
  const colorRows = stats.colorBreakdown(games, playerId);
  const maxCombo = Math.max(1, ...comboRows.map((r) => r.played));
  const maxColor = Math.max(1, ...colorRows.map((r) => r.played));

  const deckRowsHtml = playerDecks.map((d) => {
    const s = stats.deckStats(games, d.id);
    const chips = colorIdentityHex(d.colorIdentity);
    return `
      <div class="list-row">
        <div style="display:flex; align-items:center; gap:10px;">
          <div class="color-chip-row">${chips.map((c) => `<span style="background:${c}"></span>`).join('')}</div>
          <div style="font-weight:600;">${d.commanderName}</div>
        </div>
        <div style="text-align:right;">
          <div class="numeric" style="color:${s.played ? rateColor(s.winRate) : 'var(--ink-faint)'}; opacity:${sampleSizeOpacity(s.played)};">${s.played ? Math.round(s.winRate * 100) + '%' : '—'}</div>
          <div style="font-size:0.68rem; color:var(--ink-faint);">${s.wins}/${s.played}</div>
        </div>
      </div>
    `;
  }).join('');

  openModal(`
    <h2>${playerName}</h2>
    <div class="card">
      ${deckRowsHtml || '<p>No commanders added yet.</p>'}
    </div>

    <h2>Winning color combinations</h2>
    <div class="card">
      ${comboRows.length ? comboRows.map((r) => comboBarRow(r, maxCombo)).join('') : '<p>No games logged yet.</p>'}
    </div>

    <h2>Winning colors</h2>
    <div class="card">
      ${colorRows.length ? colorRows.map((r) => colorBarRow(r, maxColor)).join('') : '<p>No games logged yet.</p>'}
    </div>
  `);
}

function openStatListModal(title, rowsHtml) {
  openModal(`
    <h2>${title}</h2>
    <div class="card">${rowsHtml}</div>
  `);
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
  const lastGame = db.getGames()[0]; // getGames() already sorts newest-first
  viewEl.innerHTML = `
    <label for="log-date">Date</label>
    <input type="date" id="log-date" value="${logState.date}">
    ${lastGame ? `
      <button class="btn btn-block" id="repeat-last-pod" style="margin-top:10px;">
        Repeat Last Pod (${lastGame.podSize} players)
      </button>
    ` : ''}
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
  if (lastGame) {
    document.getElementById('repeat-last-pod').addEventListener('click', () => {
      logState.podSize = lastGame.podSize;
      // Clone, don't reference — this is a fresh game, and must never mutate
      // the previous game's own saved record.
      logState.seats = lastGame.seats.map((s) => ({ ...s }));
      renderLogSeats();
    });
  }
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

  openModal(`
    <h2>Seat ${seatIndex + 1}</h2>
    <label for="seat-player">Player</label>
    <select id="seat-player">
      <option value="">Choose…</option>
      ${players.map((p) => {
        const otherSeatIndex = logState.seats.findIndex((s, i) => i !== seatIndex && s.playerId === p.id);
        const suffix = otherSeatIndex !== -1 ? ` (seat ${otherSeatIndex + 1} — pick to swap)` : '';
        return `<option value="${p.id}">${p.name}${suffix}</option>`;
      }).join('')}
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

  // Already seated elsewhere this game (a swap) — they're still piloting
  // whatever deck they were already assigned, so carry it straight over
  // instead of asking again.
  const existingSeat = logState.seats.find((s) => s.playerId === value);
  if (existingSeat) {
    assignSeat(seatIndex, player, {
      id: existingSeat.deckId,
      commanderName: existingSeat.commanderName,
      colorIdentity: existingSeat.colorIdentity
    });
    return;
  }

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
  const newEntry = {
    seat: seatIndex + 1,
    playerId: player.id,
    playerName: player.name,
    deckId: deck.id,
    commanderName: deck.commanderName,
    colorIdentity: deck.colorIdentity
  };

  // If this player is already sitting in a different seat, swap the two
  // seats' contents instead of leaving them claimed by both. This matters
  // most right after "Repeat Last Pod," which starts every seat pre-filled —
  // reordering who sat where is then just "swap seat A and seat B," not
  // "clear one seat, then fill it again."
  const existingIndex = logState.seats.findIndex((s, i) => i !== seatIndex && s.playerId === player.id);
  if (existingIndex !== -1) {
    const previousOccupant = logState.seats[seatIndex]?.playerId ? { ...logState.seats[seatIndex] } : null;
    logState.seats[existingIndex] = previousOccupant
      ? { ...previousOccupant, seat: existingIndex + 1 }
      : { seat: existingIndex + 1 };
  }

  logState.seats[seatIndex] = newEntry;
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

  // Achievements only ever change as a result of a game being saved, so
  // this is the one place that needs to check. The Achievements tab itself
  // never consults "already unlocked" state at all — it always computes
  // live truth — this check exists purely to detect what's *newly* true,
  // for the popup.
  const previouslyUnlocked = db.getUnlockedAchievementKeys();
  const newlyUnlocked = checkForNewlyUnlocked(previouslyUnlocked, db.getGames(), db.getPlayers());
  if (newlyUnlocked.length > 0) {
    db.markAchievementsUnlocked(newlyUnlocked.map((n) => n.key));
  }

  logState = null;
  navigate('home'); // land on Home first, then show the toast over it
  if (newlyUnlocked.length > 0) {
    queueAchievementToasts(newlyUnlocked);
  }
}

// Toasts queue rather than stack, since a single game can plausibly unlock
// more than one achievement at once (e.g. someone's first game ever is also
// their first win) — showing them one at a time avoids a cluttered pile of
// overlapping popups.
let toastQueue = [];
let toastShowing = false;

function queueAchievementToasts(items) {
  toastQueue.push(...items);
  if (!toastShowing) showNextToast();
}

function showNextToast() {
  if (toastQueue.length === 0) {
    toastShowing = false;
    return;
  }
  toastShowing = true;
  const item = toastQueue.shift();
  const toastRoot = document.getElementById('toast-root');
  toastRoot.innerHTML = `
    <div class="achievement-toast" id="achievement-toast">
      <div class="achievement-toast-icon">🏆</div>
      <div>
        <div class="achievement-toast-label">Achievement Unlocked</div>
        <div class="achievement-toast-name">${item.name}</div>
        ${item.playerName ? `<div class="achievement-toast-player">${item.playerName}</div>` : ''}
      </div>
    </div>
  `;
  const toastEl = document.getElementById('achievement-toast');
  requestAnimationFrame(() => toastEl.classList.add('show'));
  setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => {
      toastRoot.innerHTML = '';
      showNextToast();
    }, 350); // matches the CSS transition duration below
  }, 3200);
}

// ---------------- Init ----------------
// One-time backfill: without this, the very first game saved after this
// feature ships would see every already-earned achievement as "new" (since
// nothing has ever been marked seen before) and flood the screen with
// toasts celebrating things that actually happened long ago.
if (!db.isAchievementsBackfilled()) {
  db.markAchievementsUnlocked(allTrueAchievementKeys(db.getGames(), db.getPlayers()));
  db.markAchievementsBackfilled();
}

navigate('home');
