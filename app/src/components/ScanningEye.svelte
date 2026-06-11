<script>
  /** Size in pixels — matches whatever width/height the parent needs. */
  export let size = 16;
</script>

<svg
  class="eye-search"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-label="searching"
  role="img"
>
  <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/>
  <circle class="pupil" cx="12" cy="12" r="3"/>
</svg>

<style>
  .eye-search {
    display: block;
    flex-shrink: 0;
  }
  .eye-search .pupil {
    transform-box: fill-box;
    transform-origin: center;
    animation: eye-scan 3.2s cubic-bezier(.68, 0, .27, 1) infinite;
  }
  @keyframes eye-scan {
    0%, 9%    { transform: translate(0px, 0px); }
    16%, 29%  { transform: translate(3px, 0px); }
    36%, 49%  { transform: translate(-3px, 1px); }
    56%, 68%  { transform: translate(1px, -2px); }
    75%, 88%  { transform: translate(-1.2px, 2px); }
    96%, 100% { transform: translate(0px, 0px); }
  }
  @media (prefers-reduced-motion: reduce) {
    .eye-search .pupil { animation: none; }
  }
</style>
