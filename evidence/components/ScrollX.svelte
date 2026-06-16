<!-- Horizontal-scroll wrapper so wide tables stay usable on mobile.
     A .svelte component (not a raw-HTML div) so mdsvex compiles its slotted Evidence
     components correctly. -->
<div class="scrollx"><slot /></div>
<style>.scrollx { overflow-x: auto; -webkit-overflow-scrolling: touch; }</style>
