// commander-picker.js — the "choose a commander" flow used from Add Deck.
// Reuses openModal/closeModal from app.js. Search-as-you-type is debounced
// so we're not hammering Scryfall on every keystroke (they ask for ~50-100ms
// between requests; 350ms after the user stops typing comfortably clears that).

const ALL_COLORS = ['W', 'U', 'B', 'R', 'G'];

function openCommanderPicker(onSelect) {
  const state = { colors: [], debounceTimer: null, results: [] };

  openModal(`
    <h2>Choose a Commander</h2>
    <input type="text" id="cmd-search" placeholder="Search commander name…" autofocus>
    <div class="pill-group" id="cmd-color-filter">
      ${ALL_COLORS.map((c) => `
        <button class="color-pill" data-color="${c}" aria-label="${c}">
          <img src="${manaSymbolUrl(c)}" alt="">
        </button>
      `).join('')}
      <button class="color-pill" data-color="C" aria-label="Colorless">
        <img src="${manaSymbolUrl('C')}" alt="">
      </button>
    </div>
    <div id="cmd-results" class="commander-grid">
      <p class="cmd-hint">Type a name or pick colors to search.</p>
    </div>
  `, () => {
    const searchInput = document.getElementById('cmd-search');
    searchInput.addEventListener('input', () => {
      clearTimeout(state.debounceTimer);
      state.debounceTimer = setTimeout(() => runCommanderSearch(state, onSelect), 350);
    });

    document.querySelectorAll('#cmd-color-filter .color-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        toggleColor(state, btn.dataset.color);
        document.querySelectorAll('#cmd-color-filter .color-pill').forEach((b) => {
          b.classList.toggle('selected', state.colors.includes(b.dataset.color));
        });
        runCommanderSearch(state, onSelect);
      });
    });
  });
}

function toggleColor(state, color) {
  if (color === 'C') {
    // Colorless is mutually exclusive with every WUBRG color — a commander
    // can't be both colorless and, say, green.
    state.colors = state.colors.includes('C') ? [] : ['C'];
    return;
  }
  state.colors = state.colors.filter((c) => c !== 'C');
  if (state.colors.includes(color)) {
    state.colors = state.colors.filter((c) => c !== color);
  } else {
    state.colors.push(color);
  }
}

async function runCommanderSearch(state, onSelect) {
  const resultsEl = document.getElementById('cmd-results');
  if (!resultsEl) return; // modal was closed mid-debounce
  const nameVal = document.getElementById('cmd-search')?.value || '';

  if (!nameVal.trim() && state.colors.length === 0) {
    resultsEl.innerHTML = `<p class="cmd-hint">Type a name or pick colors to search.</p>`;
    return;
  }

  resultsEl.innerHTML = `<p class="cmd-hint">Searching…</p>`;
  const results = await scryfall.searchCommanders({ name: nameVal, colors: state.colors });
  if (!document.getElementById('cmd-results')) return; // closed while awaiting

  if (results === null) {
    resultsEl.innerHTML = `<p class="cmd-hint">Couldn't reach Scryfall. Check your connection and try again.</p>`;
    return;
  }
  if (results.length === 0) {
    resultsEl.innerHTML = `<p class="cmd-hint">No commanders matched. Try different colors or spelling.</p>`;
    return;
  }

  state.results = results;
  resultsEl.innerHTML = results.map((c, i) => `
    <button class="commander-card" data-i="${i}">
      ${c.thumbUrl
        ? `<img src="${c.thumbUrl}" alt="${c.name}" loading="lazy">`
        : `<div class="commander-card-noimg">${c.name}</div>`}
      <span class="commander-card-name">${c.name}</span>
    </button>
  `).join('');

  resultsEl.querySelectorAll('.commander-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      const chosen = state.results[parseInt(btn.dataset.i, 10)];
      closeModal();
      onSelect({
        name: chosen.name,
        colorIdentity: chosen.colorIdentity,
        imageUrl: chosen.artUrl,
        scryfallId: chosen.scryfallId
      });
    });
  });
}
