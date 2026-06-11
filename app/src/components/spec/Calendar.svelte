<script>
  import { createEventDispatcher } from "svelte";

  // Minimal month grid. No external date library — plain JS Date.
  // `value` is an ISO date (YYYY-MM-DD); dispatches 'select' with an ISO string.
  export let value = "";

  const dispatch = createEventDispatcher();

  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  // Parse an ISO date into a LOCAL Date (avoids the UTC-midnight off-by-one
  // that `new Date('2026-01-03')` causes in negative timezones).
  function parseISO(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
    if (!m) return new Date(2026, 5, 3); // fallback: today = 2026-06-03
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function isoOf(d) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${da}`;
  }

  const selected = parseISO(value);
  const selectedISO = isoOf(selected);

  // The month currently displayed (independent of the selection).
  let viewYear = selected.getFullYear();
  let viewMonth = selected.getMonth();

  // Build the grid: leading blanks (Mon-first) + day cells for the month.
  $: firstDay = new Date(viewYear, viewMonth, 1);
  $: leadingBlanks = (firstDay.getDay() + 6) % 7; // convert Sun=0 → Mon-first
  $: daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  $: cells = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function prevMonth() {
    if (viewMonth === 0) {
      viewMonth = 11;
      viewYear -= 1;
    } else {
      viewMonth -= 1;
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      viewMonth = 0;
      viewYear += 1;
    } else {
      viewMonth += 1;
    }
  }

  function pick(day) {
    dispatch("select", isoOf(new Date(viewYear, viewMonth, day)));
  }

  function isSelected(day) {
    return isoOf(new Date(viewYear, viewMonth, day)) === selectedISO;
  }
</script>

<div class="calendar">
  <div class="header">
    <button type="button" class="nav" on:click={prevMonth} aria-label="Previous month">‹</button>
    <span class="title">{MONTHS[viewMonth]} {viewYear}</span>
    <button type="button" class="nav" on:click={nextMonth} aria-label="Next month">›</button>
  </div>

  <div class="grid weekdays">
    {#each WEEKDAYS as wd}
      <span class="weekday">{wd}</span>
    {/each}
  </div>

  <div class="grid days">
    {#each cells as day}
      {#if day === null}
        <span class="blank"></span>
      {:else}
        <button
          type="button"
          class="day"
          class:selected={isSelected(day)}
          on:click={() => pick(day)}
        >
          {day}
        </button>
      {/if}
    {/each}
  </div>
</div>

<style>
  .calendar {
    padding: 10px;
    width: 220px;
    box-sizing: border-box;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .title {
    font-size: 13px;
    font-weight: 600;
    color: #111827;
  }

  .nav {
    border: 1px solid #e5e7eb;
    background: #fff;
    border-radius: 6px;
    width: 24px;
    height: 24px;
    font-size: 14px;
    line-height: 1;
    color: #6b7280;
    cursor: pointer;
    transition: border-color 0.12s ease, color 0.12s ease;
  }

  .nav:hover {
    border-color: #3b82f6;
    color: #111827;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
  }

  .weekday {
    text-align: center;
    font-size: 11px;
    color: #9ca3af;
    padding: 2px 0;
  }

  .blank {
    height: 26px;
  }

  .day {
    height: 26px;
    border: none;
    background: transparent;
    border-radius: 6px;
    font: inherit;
    font-size: 12px;
    color: #111827;
    cursor: pointer;
    transition: background 0.12s ease, color 0.12s ease;
  }

  .day:hover {
    background: #f3f4f6;
  }

  .day.selected {
    background: #2563eb;
    color: #fff;
  }

  .day.selected:hover {
    background: #1d4ed8;
  }
</style>
