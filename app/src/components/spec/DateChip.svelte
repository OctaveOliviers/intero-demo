<script>
  import { createEventDispatcher } from "svelte";
  import Chip from "./Chip.svelte";
  import ChipPopover from "./ChipPopover.svelte";
  import Calendar from "./Calendar.svelte";

  // A `date` chip: `raw` holds the ISO date, `value` the human display string.
  export let chip;

  const dispatch = createEventDispatcher();

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  let open = false;

  // Format an ISO date (YYYY-MM-DD) as e.g. "3 Jan 2026", parsing as a LOCAL
  // date to match F1's fmtDate and avoid timezone off-by-one.
  function fmtISO(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
    if (!m) return chip.value;
    return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  }

  function toggle() {
    open = !open;
  }

  function handleSelect(e) {
    const iso = e.detail;
    chip = { ...chip, raw: iso, value: fmtISO(iso) };
    open = false;
    dispatch("change", chip);
  }
</script>

<span class="anchor">
  <Chip value={chip.value} open={open} on:toggle={toggle} />
  <ChipPopover {open} on:close={() => (open = false)}>
    <Calendar value={chip.raw} on:select={handleSelect} />
  </ChipPopover>
</span>

<style>
  .anchor {
    position: relative;
    display: inline-block;
  }
</style>
