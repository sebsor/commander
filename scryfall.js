// scryfall.js — thin wrapper around the Scryfall REST API.
// No API key required. Scryfall's own docs say browser JS callers should
// leave the User-Agent header alone (browsers block overriding it anyway)
// and just send an Accept header. Network failures are caught so a bad
// connection never blocks logging a game — you can always fall back to
// manual entry.

const scryfall = {
  async findCommander(name) {
    if (!name || !name.trim()) return null;
    try {
      const res = await fetch(
        `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name.trim())}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) return null;
      const card = await res.json();
      return {
        name: card.name,
        colorIdentity: card.color_identity || [],
        imageUrl:
          card.image_uris?.art_crop ||
          card.card_faces?.[0]?.image_uris?.art_crop ||
          null,
        scryfallId: card.id
      };
    } catch (e) {
      console.warn('Scryfall lookup failed, falling back to manual entry', e);
      return null;
    }
  },

  async autocomplete(partialName) {
    if (!partialName || partialName.trim().length < 2) return [];
    try {
      const res = await fetch(
        `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(partialName.trim())}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return data.data || [];
    } catch (e) {
      return [];
    }
  }
};

// Color identity → display info, used for deck chips throughout the app
const MANA_COLORS = {
  W: { hex: '#f8f6d8', label: 'White' },
  U: { hex: '#4a90d9', label: 'Blue' },
  B: { hex: '#4a4a52', label: 'Black' },
  R: { hex: '#d9534f', label: 'Red' },
  G: { hex: '#4a8f5c', label: 'Green' }
};

function colorIdentityHex(identity) {
  if (!identity || identity.length === 0) return ['#8a8578']; // colorless
  return identity.map((c) => MANA_COLORS[c]?.hex || '#8a8578');
}
