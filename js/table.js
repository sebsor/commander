// table.js — renders the circular "seats around a table" widget.
// Seat 1 is at the top; seats proceed clockwise, matching how you'd
// actually read turn order sitting down at a table.

function renderTableSeats(container, count) {
  container.innerHTML = '';
  container.classList.add('table-wheel');
  const radius = 42; // percent of container
  const slots = [];

  // faint table surface
  const surface = document.createElement('div');
  surface.className = 'table-surface';
  container.appendChild(surface);

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2; // start at top
    const x = 50 + radius * Math.cos(angle);
    const y = 50 + radius * Math.sin(angle);

    const slot = document.createElement('button');
    slot.type = 'button';
    slot.className = 'table-seat table-seat--empty';
    slot.style.left = x + '%';
    slot.style.top = y + '%';
    slot.dataset.seat = i + 1;
    slot.innerHTML = `<span class="seat-number">${i + 1}</span>`;
    container.appendChild(slot);
    slots.push(slot);
  }
  return slots;
}

function fillSeat(slotEl, { playerName, colorHexes, isWinner }) {
  slotEl.classList.remove('table-seat--empty');
  slotEl.classList.add('table-seat--filled');
  if (isWinner) slotEl.classList.add('table-seat--winner');

  const chipStops = colorHexes && colorHexes.length
    ? colorHexes.join(', ')
    : '#8a8578';

  slotEl.innerHTML = `
    <span class="seat-number">${slotEl.dataset.seat}</span>
    <span class="seat-chip" style="background:linear-gradient(135deg, ${chipStops})"></span>
    <span class="seat-name">${playerName}</span>
    ${isWinner ? '<span class="seat-crown">♛</span>' : ''}
  `;
}

function clearSeat(slotEl) {
  slotEl.classList.remove('table-seat--filled', 'table-seat--winner');
  slotEl.classList.add('table-seat--empty');
  slotEl.innerHTML = `<span class="seat-number">${slotEl.dataset.seat}</span>`;
}
