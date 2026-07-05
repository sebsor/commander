// db.js — localStorage-backed repository.
// Every read/write goes through this module so the storage backend
// (localStorage now, Firebase later) can be swapped without touching
// any view or stats code.

const STORAGE_KEY = 'round-table-data';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadRaw() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { players: [], decks: [], games: [], unlockedAchievements: [], achievementsBackfilled: false };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      players: parsed.players || [],
      decks: parsed.decks || [],
      games: parsed.games || [],
      unlockedAchievements: parsed.unlockedAchievements || [],
      achievementsBackfilled: parsed.achievementsBackfilled || false
    };
  } catch (e) {
    console.error('Corrupt data, starting fresh', e);
    return { players: [], decks: [], games: [], unlockedAchievements: [], achievementsBackfilled: false };
  }
}

function saveRaw(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const db = {
  // ---- Players ----
  getPlayers() {
    return loadRaw().players;
  },
  addPlayer(name) {
    const data = loadRaw();
    const player = { id: uid(), name, createdAt: Date.now() };
    data.players.push(player);
    saveRaw(data);
    return player;
  },
  updatePlayer(id, updates) {
    const data = loadRaw();
    const p = data.players.find((x) => x.id === id);
    if (!p) return null;
    Object.assign(p, updates);
    saveRaw(data);
    return p;
  },
  deletePlayer(id) {
    const data = loadRaw();
    data.players = data.players.filter((x) => x.id !== id);
    saveRaw(data);
  },

  // ---- Decks ----
  getDecks() {
    return loadRaw().decks;
  },
  addDeck({ ownerId, commanderName, colorIdentity, imageUrl, scryfallId }) {
    const data = loadRaw();
    const deck = {
      id: uid(),
      ownerId,
      commanderName,
      colorIdentity: colorIdentity || [],
      imageUrl: imageUrl || null,
      scryfallId: scryfallId || null,
      createdAt: Date.now()
    };
    data.decks.push(deck);
    saveRaw(data);
    return deck;
  },
  updateDeck(id, updates) {
    const data = loadRaw();
    const d = data.decks.find((x) => x.id === id);
    if (!d) return null;
    Object.assign(d, updates);
    saveRaw(data);
    return d;
  },
  deleteDeck(id) {
    const data = loadRaw();
    data.decks = data.decks.filter((x) => x.id !== id);
    saveRaw(data);
  },

  // ---- Games ----
  getGames() {
    return loadRaw().games.sort((a, b) => b.date - a.date);
  },
  addGame({ date, podSize, seats, winnerId, winningDeckId }) {
    const data = loadRaw();
    const game = {
      id: uid(),
      date: date || Date.now(),
      podSize,
      seats, // [{ seat: 1, playerId, deckId }, ...]
      winnerId,
      winningDeckId,
      createdAt: Date.now()
    };
    data.games.push(game);
    saveRaw(data);
    return game;
  },
  deleteGame(id) {
    const data = loadRaw();
    data.games = data.games.filter((x) => x.id !== id);
    saveRaw(data);
  },

  // ---- Bulk ----
  exportAll() {
    return loadRaw();
  },
  importAll(data) {
    saveRaw({
      players: data.players || [],
      decks: data.decks || [],
      games: data.games || [],
      unlockedAchievements: data.unlockedAchievements || [],
      achievementsBackfilled: data.achievementsBackfilled || false
    });
  },
  resetAll() {
    saveRaw({ players: [], decks: [], games: [], unlockedAchievements: [], achievementsBackfilled: false });
  },

  // ---- Achievement tracking ----
  // Separate from the achievement *definitions* (those live in
  // achievements.js) — this is just "which ones has the app already shown
  // a popup for," so a re-render of the Achievements tab doesn't depend on
  // this at all (that tab always computes live truth). This is purely for
  // detecting *newly* true achievements after a game save.
  getUnlockedAchievementKeys() {
    return loadRaw().unlockedAchievements;
  },
  markAchievementsUnlocked(keys) {
    const data = loadRaw();
    const set = new Set(data.unlockedAchievements);
    keys.forEach((k) => set.add(k));
    data.unlockedAchievements = Array.from(set);
    saveRaw(data);
  },
  isAchievementsBackfilled() {
    return loadRaw().achievementsBackfilled;
  },
  markAchievementsBackfilled() {
    const data = loadRaw();
    data.achievementsBackfilled = true;
    saveRaw(data);
  }
};
