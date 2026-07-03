// ui.js — shared visual helpers used across Home, Players, Decks, and Stats:
// deterministic avatar colors/initials, and the rounded arc-gauge SVG that's
// this redesign's signature element (used wherever a percentage is the point).

// Color-identity combo naming (guilds/shards/wedges/etc). Verified against
// current sources rather than assumed from memory — the 2-and-3-color names
// (guilds, shards, wedges) are common knowledge, but the 4-color ones
// (Dune/Glint/Ink/Witch/Yore, from the 2006 Nephilim cycle) are obscure
// enough that guessing them wrong felt likely.
const WUBRG_ORDER = ['W', 'U', 'B', 'R', 'G'];

function sortWubrg(colors) {
  return WUBRG_ORDER.filter((c) => colors.includes(c));
}

const COMBO_NAMES = {
  '': 'Colorless',
  W: 'Mono-White', U: 'Mono-Blue', B: 'Mono-Black', R: 'Mono-Red', G: 'Mono-Green',
  WU: 'Azorius', WB: 'Orzhov', WR: 'Boros', WG: 'Selesnya',
  UB: 'Dimir', UR: 'Izzet', UG: 'Simic',
  BR: 'Rakdos', BG: 'Golgari', RG: 'Gruul',
  WUB: 'Esper', WUR: 'Jeskai', WUG: 'Bant', WBR: 'Mardu', WBG: 'Abzan',
  WRG: 'Naya', UBR: 'Grixis', UBG: 'Sultai', URG: 'Temur', BRG: 'Jund',
  WBRG: 'Dune', UBRG: 'Glint', WURG: 'Ink', WUBG: 'Witch', WUBR: 'Yore',
  WUBRG: 'Five-Color'
};

function comboLabel(colors) {
  const key = sortWubrg(colors).join('');
  return COMBO_NAMES[key] || key || 'Colorless';
}

const AVATAR_PALETTE = ['#ef7d3f', '#4f9d8f', '#c76b9a', '#5b8fd6', '#d6a24f', '#7f9e4a', '#a06bd6'];

function avatarColorFor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function initialsFor(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function avatarHTML(name, size = 44) {
  return `<div class="avatar" style="width:${size}px; height:${size}px; font-size:${size * 0.38}px; background:${avatarColorFor(name)};">${initialsFor(name)}</div>`;
}

// Rounded-cap ring gauge. Track is a full faint circle; the colored arc is
// drawn on top using stroke-dasharray to show only the "percent" portion.
// Text is laid over the SVG with plain HTML/CSS rather than <text> nodes —
// simpler to style and keeps font rendering consistent with the rest of the page.
function arcGaugeHTML({ percent, size = 120, strokeWidth = 11, color = 'var(--accent)', valueText = '', labelText = '' }) {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = (circumference * clamped) / 100;
  return `
    <div class="arc-gauge" style="width:${size}px; height:${size}px;">
      <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--accent-soft)" stroke-width="${strokeWidth}" />
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"
          stroke-linecap="round" stroke-dasharray="${filled} ${circumference}"
          transform="rotate(-90 ${cx} ${cy})" />
      </svg>
      <div class="arc-gauge-overlay">
        <div class="arc-gauge-value">${valueText}</div>
        <div class="arc-gauge-label">${labelText}</div>
      </div>
    </div>
  `;
}

// Color-coded by magnitude, same idea as the green/amber/red match-rate bars
// in the hiring reference — a quick "is this good or bad" read at a glance.
function rateColor(fraction) {
  if (fraction >= 0.6) return 'var(--rate-high)';
  if (fraction >= 0.35) return 'var(--rate-mid)';
  return 'var(--rate-low)';
}
