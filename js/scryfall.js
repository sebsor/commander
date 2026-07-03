// scryfall.js — thin wrapper around the Scryfall REST API.
// No API key required. Scryfall's own docs say browser JS callers should
// leave the User-Agent header alone (browsers block overriding it anyway)
// and just send an Accept header.

const scryfall = {
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
  },

  // Search legal commanders by (optional) name substring and (optional)
  // exact color identity. Returns:
  //   [] on a clean zero-result search (nothing matched)
  //   null on a network/API failure (so callers can tell "no matches" from "couldn't ask")
  async searchCommanders({ name = '', colors = [] } = {}) {
    let query = 'is:commander';
    const trimmedName = name.trim();
    if (trimmedName) {
      // name: restricts matching to the card name field (not oracle text),
      // so typing "zur" doesn't surface unrelated cards that merely mention Zur.
      query += ` name:"${trimmedName.replace(/"/g, '')}"`;
    }
    if (colors.length > 0) {
      // id= is an exact color-identity match (see note above) — colors.length
      // covers the "colorless" case too, since the caller passes ['C'] for that.
      const identity = colors.includes('C') ? 'c' : colors.join('').toLowerCase();
      query += ` id=${identity}`;
    }
    try {
      const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=name&unique=cards`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.status === 404) return []; // Scryfall's way of saying "zero matches"
      if (!res.ok) return null;
      const data = await res.json();
      return (data.data || []).map(cardToCommanderSummary);
    } catch (e) {
      console.warn('Commander search failed', e);
      return null;
    }
  }
};

function cardToCommanderSummary(card) {
  const face = card.card_faces?.[0];
  return {
    name: card.name,
    colorIdentity: card.color_identity || [],
    thumbUrl: card.image_uris?.small || face?.image_uris?.small || null,
    artUrl: card.image_uris?.art_crop || face?.image_uris?.art_crop || null,
    scryfallId: card.id
  };
}

// Individual mana symbol SVGs live at a predictable, stable Scryfall CDN
// path — no API call needed to fetch these, unlike card data.
function manaSymbolUrl(letter) {
  return `https://svgs.scryfall.io/card-symbols/${letter.toUpperCase()}.svg`;
}

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
