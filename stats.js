// stats.js — pure functions over the raw players/decks/games arrays.
// Nothing here touches localStorage directly; it's handed data from db.js
// so it stays testable and reusable if the storage backend ever changes.

const stats = {
  // Win count + win rate per player
  winsByPerson(players, games) {
    const rows = players.map((p) => {
      const played = games.filter((g) => g.seats.some((s) => s.playerId === p.id));
      const wins = games.filter((g) => g.winnerId === p.id);
      return {
        playerId: p.id,
        name: p.name,
        played: played.length,
        wins: wins.length,
        winRate: played.length ? wins.length / played.length : 0
      };
    });
    return rows.sort((a, b) => b.wins - a.wins);
  },

  // Win count + play count per commander name (aggregated across decks,
  // in case the same commander gets rebuilt into a new deck later)
  byCommander(games) {
    const map = new Map();
    for (const g of games) {
      for (const seat of g.seats) {
        if (!seat.commanderName) continue;
        const key = seat.commanderName;
        if (!map.has(key)) {
          map.set(key, {
            commanderName: key,
            colorIdentity: seat.colorIdentity || [],
            played: 0,
            wins: 0
          });
        }
        const row = map.get(key);
        row.played += 1;
        if (g.winnerId === seat.playerId && g.winningDeckId === seat.deckId) {
          row.wins += 1;
        }
      }
    }
    return Array.from(map.values());
  },

  mostPlayedCommanders(games, limit = 5) {
    return this.byCommander(games)
      .sort((a, b) => b.played - a.played)
      .slice(0, limit);
  },

  winsByCommanderRanked(games, limit = 5) {
    return this.byCommander(games)
      .sort((a, b) => b.wins - a.wins)
      .slice(0, limit);
  },

  // Seat position win rate, normalized by pod size so "seat 3 of 3" (last)
  // isn't lumped in with "seat 3 of 6" (middle). Bucketed into
  // first / middle / last since that's what's actually comparable
  // across different pod sizes.
  seatPositionWinRates(games) {
    const buckets = {
      first: { played: 0, wins: 0 },
      middle: { played: 0, wins: 0 },
      last: { played: 0, wins: 0 }
    };
    for (const g of games) {
      for (const seat of g.seats) {
        let bucket;
        if (seat.seat === 1) bucket = 'first';
        else if (seat.seat === g.podSize) bucket = 'last';
        else bucket = 'middle';

        buckets[bucket].played += 1;
        if (g.winnerId === seat.playerId) buckets[bucket].wins += 1;
      }
    }
    return Object.entries(buckets).map(([label, v]) => ({
      label,
      played: v.played,
      wins: v.wins,
      winRate: v.played ? v.wins / v.played : 0
    }));
  }
};
