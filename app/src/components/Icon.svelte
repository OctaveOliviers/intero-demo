<script>
  // Shared monochrome line-icon registry (DESIGN-SYSTEM §1.3).
  // One visual family: Lucide/Heroicons-style, ~1.75px stroke, currentColor,
  // fill:none, round caps/joins. Every other component imports this.
  //
  //   <Icon name="search" />            -> --icon-md (20px), inherits text color
  //   <Icon name="trash" size={16} />   -> explicit pixel size
  //
  // The disclosure caret is the single canonical `chevron` (points right at 0°);
  // rotate it via transform at the call site for other directions.

  export let name;
  export let size = null;

  $: dimension = size != null ? `${size}px` : null;
</script>

<svg
  class="icon"
  viewBox="0 0 24 24"
  style:width={dimension}
  style:height={dimension}
  aria-hidden="true"
  focusable="false"
>
  {#if name === "logo"}
    <!-- an eye (company logo placeholder) -->
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  {:else if name === "new"}
    <!-- compose / new analysis (square-pen, ChatGPT "new chat" style) -->
    <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 16l-4 1 1-4 9.5-9.5Z" />
  {:else if name === "search"}
    <!-- magnifying glass -->
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  {:else if name === "settings"}
    <!-- gear -->
    <path
      d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"
    />
    <circle cx="12" cy="12" r="3" />
  {:else if name === "sidebar"}
    <!-- panel / sidebar toggle -->
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18" />
  {:else if name === "more"}
    <!-- horizontal ellipsis (overflow menu) -->
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  {:else if name === "close"}
    <!-- x -->
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  {:else if name === "check"}
    <!-- checkmark -->
    <path d="M20 6 9 17l-5-5" />
  {:else if name === "chevron"}
    <!-- canonical disclosure caret (rotate via transform) -->
    <path d="m9 18 6-6-6-6" />
  {:else if name === "download"}
    <!-- down-tray -->
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m7 10 5 5 5-5" />
    <path d="M12 15V3" />
  {:else if name === "table"}
    <!-- table / grid outline (file chip glyph) -->
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18" />
    <path d="M3 15h18" />
    <path d="M12 3v18" />
  {:else if name === "file"}
    <!-- document / report page -->
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6" />
    <path d="M9 17h6" />
  {:else if name === "chart"}
    <path d="M3 3v18h18" />
    <rect x="7" y="12" width="3" height="5" rx="1" />
    <rect x="12" y="8" width="3" height="9" rx="1" />
    <rect x="17" y="5" width="3" height="12" rx="1" />
  {:else if name === "datasets"}
    <!-- dataset: database cylinder -->
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v14a9 3 0 0 0 18 0V5" />
    <path d="M3 12a9 3 0 0 0 18 0" />
  {:else if name === "database"}
    <!-- database cylinder -->
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v14a9 3 0 0 0 18 0V5" />
    <path d="M3 12a9 3 0 0 0 18 0" />
  {:else if name === "stop"}
    <!-- stop the running agent (square) -->
    <rect x="6" y="6" width="12" height="12" rx="2" />
  {:else if name === "pin"}
    <!-- pushpin (pin an artifact to the sidebar) -->
    <path d="M12 17v5" />
    <path
      d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"
    />
  {:else if name === "rename"}
    <!-- pencil -->
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  {:else if name === "feedback"}
    <!-- speech bubble (feedback / message) -->
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
  {:else if name === "chat-plus"}
    <!-- message bubble with plus -->
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    <path d="M12 8v6" />
    <path d="M9 11h6" />
  {:else if name === "send"}
    <!-- send -->
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  {:else if name === "expand-diagonal"}
    <!-- diagonal arrows pointing away -->
    <path d="M10 14 4 20" />
    <path d="M4 15v5h5" />
    <path d="M14 10l6-6" />
    <path d="M15 4h5v5" />
  {:else if name === "collapse-diagonal"}
    <!-- diagonal arrows pointing inward -->
    <path d="M4 20l6-6" />
    <path d="M5 14h5v5" />
    <path d="M20 4l-6 6" />
    <path d="M14 5v5h5" />
  {:else if name === "eye"}
    <!-- eye -->
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  {:else if name === "eye-check"}
    <!-- eye with checkmark pupil -->
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <path d="m7.7 12.2 3 3 5.7-5.7" />
  {:else if name === "eye-refresh"}
    <!-- loop-arrow almond motif -->
    <path d="M4 12c2.2-3.4 5.1-5.1 8-5.1 2.2 0 4.4 1 6.2 2.9" />
    <path d="m18.2 7.1 2 .2-.2 2" />
    <path d="M20 12c-2.2 3.4-5.1 5.1-8 5.1-2.2 0-4.4-1-6.2-2.9" />
    <path d="m5.8 16.9-2-.2.2-2" />
  {:else if name === "loop"}
    <!-- refresh / recirculate -->
    <path d="M21 12a9 9 0 0 1-15.5 6.4" />
    <path d="M3 16v5h5" />
    <path d="M3 12a9 9 0 0 1 15.5-6.4" />
    <path d="M21 8V3h-5" />
  {:else if name === "trash"}
    <!-- delete -->
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  {:else if name === "logout"}
    <!-- sign out -->
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <path d="M10 17l5-5-5-5" />
    <path d="M15 12H3" />
  {:else if name === "dash-diabetes"}
    <!-- diabetes: blood drop with inner glucose mark -->
    <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />
    <path d="M9.5 14.5 12 12l2.5 2.5" />
  {:else if name === "dash-cordph"}
    <!-- cord pH: blood-gas sample vial with a fluid level line -->
    <path d="M9 3h6" />
    <path d="M10 3v6l-3.5 7a2 2 0 0 0 1.8 3h7.4a2 2 0 0 0 1.8-3L14 9V3" />
    <path d="M7.6 16h8.8" />
  {:else if name === "dash-epilepsy"}
    <!-- epilepsy / neurology: head profile with EEG wave -->
    <path d="M19.5 12a7.5 7.5 0 1 0-3.6 6.4V21" />
    <path d="m6.5 12 2-2.5 2 5 2-5 2 2.5h1.5" />
  {:else if name === "dash-trauma"}
    <!-- major trauma: medical cross with pulse line -->
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M4 13h3l1.5-3 2 6 1.5-3H20" />
  {:else if name === "share"}
    <!-- share: three nodes linked (share with a colleague) -->
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="m8.59 13.51 6.83 3.98" />
    <path d="m15.41 6.51-6.82 3.98" />
  {/if}
</svg>

<style>
  .icon {
    display: inline-block;
    flex-shrink: 0;
    width: var(--icon-md);
    height: var(--icon-md);
    color: inherit;
    fill: none;
    stroke: currentColor;
    stroke-width: var(--icon-stroke);
    stroke-linecap: round;
    stroke-linejoin: round;
    vertical-align: middle;
  }
</style>
