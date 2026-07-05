// achievements.js — milestone definitions and unlock-checking logic.
// Kept separate from stats.js on purpose: that file computes continuous
// numeric stats (win rates, counts). This checks discrete yes/no unlock
// conditions against the same underlying game/deck data — a different kind
// of question ("has this happened at all") than stats.js answers ("how
// often does this happen").

// App-wide milestones — not tied to any one player.
const MILESTONES = [
  { id: 'first-game', name: 'First Blood', description: 'Log your first game', check: (games) => games.length >= 1 },
  { id: 'games-10', name: 'Regular', description: 'Log 10 games', check: (games) => games.length >= 10 },
  { id: 'games-25', name: 'Veteran', description: 'Log 25 games', check: (games) => games.length >= 25 },
  { id: 'games-50', name: 'Historian', description: 'Log 50 games', check: (games) => games.length >= 50 }
];

// Per-player achievements — each check receives (playerId, games). Color
// identity is already denormalized into each seat (same as everywhere else
// in this app), so none of these actually need a live deck lookup.
const PLAYER_ACHIEVEMENTS = [
  { id: 'first-win', name: 'First Win', description: 'Win a game', check: (playerId, games) => games.some((g) => g.winnerId === playerId) },
  { id: 'wins-5', name: 'Fan Favorite', description: 'Win 5 games', check: (playerId, games) => games.filter((g) => g.winnerId === playerId).length >= 5 },
  { id: 'wins-10', name: 'Champion', description: 'Win 10 games', check: (playerId, games) => games.filter((g) => g.winnerId === playerId).length >= 10 },
  { id: 'streak-3', name: 'On a Roll', description: 'Win 3 games in a row', check: (playerId, games) => longestWinStreak(playerId, games) >= 3 },
  { id: 'streak-5', name: 'Unstoppable', description: 'Win 5 games in a row', check: (playerId, games) => longestWinStreak(playerId, games) >= 5 },
  { id: 'loyalty', name: 'Commander Loyalty', description: 'Play 10 games with one commander', check: (playerId, games) => maxGamesWithOneDeck(playerId, games) >= 10 },
  { id: 'rainbow', name: 'Five-Color', description: 'Win with a five-color commander', check: (playerId, games) => winsWithColorCount(playerId, games, 5) > 0 },
  { id: 'mono', name: 'Mono-Color Master', description: 'Win with a mono-colored commander', check: (playerId, games) => winsWithColorCount(playerId, games, 1) > 0 },
  { id: 'colorless', name: 'Colorless Victory', description: 'Win with a colorless commander', check: (playerId, games) => winsWithColorCount(playerId, games, 0) > 0 },
  { id: 'iron-man', name: 'Iron Man', description: "Play in every game logged so far", check: (playerId, games) => games.length > 0 && games.every((g) => g.seats.some((s) => s.playerId === playerId)) }
];

// db.getGames() returns newest-first (for display purposes elsewhere) —
// streaks need chronological order, so this re-sorts ascending rather than
// assuming callers already have the right order.
function longestWinStreak(playerId, games) {
  const chronological = [...games].sort((a, b) => a.date - b.date);
  let longest = 0;
  let current = 0;
  for (const g of chronological) {
    const inGame = g.seats.some((s) => s.playerId === playerId);
    if (!inGame) continue; // only this player's own games count toward their streak
    if (g.winnerId === playerId) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

function maxGamesWithOneDeck(playerId, games) {
  const counts = {};
  for (const g of games) {
    const seat = g.seats.find((s) => s.playerId === playerId);
    if (!seat) continue;
    counts[seat.deckId] = (counts[seat.deckId] || 0) + 1;
  }
  return Math.max(0, ...Object.values(counts));
}

function winsWithColorCount(playerId, games, count) {
  return games.filter((g) => {
    const seat = g.seats.find((s) => s.playerId === playerId);
    return seat && g.winnerId === playerId && (seat.colorIdentity?.length || 0) === count;
  }).length;
}

// Every achievement gets one stable string key so it can be recorded in
// db's unlockedAchievements list. Milestones and player achievements use
// different prefixes since a milestone id and a player achievement id could
// otherwise collide (both are just short slugs like "first-game").
function allTrueAchievementKeys(games, players) {
  const keys = [];
  for (const m of MILESTONES) {
    if (m.check(games)) keys.push(`milestone:${m.id}`);
  }
  for (const p of players) {
    for (const a of PLAYER_ACHIEVEMENTS) {
      if (a.check(p.id, games)) keys.push(`player:${p.id}:${a.id}`);
    }
  }
  return keys;
}

// Same traversal as allTrueAchievementKeys, but returns full display info
// (name, and player name for player-specific ones) only for achievements
// that are true now AND weren't already in previouslyUnlockedKeys — i.e.
// genuinely new since the last check, not just "currently true."
function checkForNewlyUnlocked(previouslyUnlockedKeys, games, players) {
  const seen = new Set(previouslyUnlockedKeys);
  const newly = [];
  for (const m of MILESTONES) {
    const key = `milestone:${m.id}`;
    if (!seen.has(key) && m.check(games)) newly.push({ key, name: m.name });
  }
  for (const p of players) {
    for (const a of PLAYER_ACHIEVEMENTS) {
      const key = `player:${p.id}:${a.id}`;
      if (!seen.has(key) && a.check(p.id, games)) {
        newly.push({ key, name: a.name, playerName: p.name });
      }
    }
  }
  return newly;
}
