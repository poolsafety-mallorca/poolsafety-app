/* ==========================================================================
   PoolSafety · Librería de iconos (Lucide-style)
   Inyecta un <svg> con <symbol>s reutilizables al inicio del body.
   Uso: <svg class="ic"><use href="#ic-home"/></svg>
   ========================================================================== */

(function () {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">
  <defs>
    <symbol id="ic-home" viewBox="0 0 24 24"><path d="M3 12l9-9 9 9M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"/></symbol>
    <symbol id="ic-clipboard" viewBox="0 0 24 24"><rect x="8" y="4" width="8" height="4" rx="1"/><path d="M16 6h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/><path d="M9 14l2 2 4-4"/></symbol>
    <symbol id="ic-medkit" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M12 11v6M9 14h6"/></symbol>
    <symbol id="ic-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></symbol>
    <symbol id="ic-users" viewBox="0 0 24 24"><circle cx="9" cy="8" r="4"/><path d="M2 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1"/><path d="M16 3a4 4 0 0 1 0 8"/><path d="M22 21v-1a5 5 0 0 0-4-4.9"/></symbol>
    <symbol id="ic-shield" viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.4 9.5-8 11-4.6-1.5-8-6-8-11V5l8-3z"/><path d="M9 12l2 2 4-4"/></symbol>
    <symbol id="ic-lifebuoy" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M5.5 5.5l3.7 3.7M14.8 14.8l3.7 3.7M5.5 18.5l3.7-3.7M14.8 9.2l3.7-3.7"/></symbol>
    <symbol id="ic-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></symbol>
    <symbol id="ic-pin" viewBox="0 0 24 24"><path d="M12 22s-7-7.5-7-13a7 7 0 1 1 14 0c0 5.5-7 13-7 13z"/><circle cx="12" cy="9" r="2.5"/></symbol>
    <symbol id="ic-map" viewBox="0 0 24 24"><path d="M9 3l6 2 5-2v16l-5 2-6-2-5 2V5l5-2z"/><path d="M9 3v16M15 5v16"/></symbol>
    <symbol id="ic-compass" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15 9l-2 6-6 2 2-6 6-2z"/></symbol>
    <symbol id="ic-signal" viewBox="0 0 24 24"><path d="M2 20l3-3M17 5l3-3"/><path d="M6 16a4 4 0 0 1 0-8M18 16a4 4 0 0 0 0-8"/><path d="M9 14a2 2 0 0 1 0-4M15 14a2 2 0 0 0 0-4"/><circle cx="12" cy="12" r="1"/></symbol>
    <symbol id="ic-check" viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></symbol>
    <symbol id="ic-check-circle" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></symbol>
    <symbol id="ic-x" viewBox="0 0 24 24"><path d="M6 6l12 12M6 18L18 6"/></symbol>
    <symbol id="ic-x-circle" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M9 15l6-6"/></symbol>
    <symbol id="ic-alert" viewBox="0 0 24 24"><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v4M12 17.5v.5"/></symbol>
    <symbol id="ic-alert-circle" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.5"/></symbol>
    <symbol id="ic-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v.5M11 12h1v5h1"/></symbol>
    <symbol id="ic-bell" viewBox="0 0 24 24"><path d="M6 8a6 6 0 1 1 12 0c0 6 3 6 3 8H3c0-2 3-2 3-8z"/><path d="M10 21a2 2 0 0 0 4 0"/></symbol>
    <symbol id="ic-arrow-right" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
    <symbol id="ic-arrow-up-right" viewBox="0 0 24 24"><path d="M7 17L17 7M8 7h9v9"/></symbol>
    <symbol id="ic-chevron-right" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></symbol>
    <symbol id="ic-chevron-left" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></symbol>
    <symbol id="ic-chevron-down" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></symbol>
    <symbol id="ic-pen" viewBox="0 0 24 24"><path d="M17 3l4 4-13 13H4v-4L17 3z"/></symbol>
    <symbol id="ic-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
    <symbol id="ic-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></symbol>
    <symbol id="ic-filter" viewBox="0 0 24 24"><path d="M4 5h16l-6 8v6l-4-2v-4L4 5z"/></symbol>
    <symbol id="ic-settings" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z"/></symbol>
    <symbol id="ic-logout" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></symbol>
    <symbol id="ic-play" viewBox="0 0 24 24"><path d="M6 4l14 8-14 8V4z"/></symbol>
    <symbol id="ic-stop" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></symbol>
    <symbol id="ic-pause" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></symbol>
    <symbol id="ic-trending-up" viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></symbol>
    <symbol id="ic-package" viewBox="0 0 24 24"><path d="M12 3l9 5v8l-9 5-9-5V8l9-5z"/><path d="M3 8l9 5 9-5M12 13v10"/></symbol>
    <symbol id="ic-heart-pulse" viewBox="0 0 24 24"><path d="M20 8.4A5 5 0 0 0 12 6a5 5 0 0 0-8 2.4c0 5 8 12 8 12s2-1.8 4-4"/><path d="M13 12l2-3 2 5 2-2h3"/></symbol>
    <symbol id="ic-droplet" viewBox="0 0 24 24"><path d="M12 3s7 7.5 7 12a7 7 0 0 1-14 0c0-4.5 7-12 7-12z"/></symbol>
    <symbol id="ic-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></symbol>
    <symbol id="ic-wind" viewBox="0 0 24 24"><path d="M3 8h13a3 3 0 1 0-3-3M3 16h17a3 3 0 1 1-3 3M3 12h8"/></symbol>
    <symbol id="ic-calendar" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></symbol>
    <symbol id="ic-phone" viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 20 20 0 0 1-8.7-3.1 19.7 19.7 0 0 1-6-6A20 20 0 0 1 2 4.1 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c0 1 .3 2 .7 3a2 2 0 0 1-.5 2L8 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2-.5c1 .4 2 .6 3 .7a2 2 0 0 1 1.7 2z"/></symbol>
    <symbol id="ic-mail" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></symbol>
    <symbol id="ic-message" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z"/></symbol>
    <symbol id="ic-file-text" viewBox="0 0 24 24"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z"/><path d="M14 3v6h6M8 13h8M8 17h6"/></symbol>
    <symbol id="ic-download" viewBox="0 0 24 24"><path d="M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/><path d="M7 11l5 5 5-5M12 4v12"/></symbol>
    <symbol id="ic-more-vertical" viewBox="0 0 24 24"><circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="18" r="1.5"/></symbol>
    <symbol id="ic-bar-chart" viewBox="0 0 24 24"><path d="M3 20V10M9 20V4M15 20v-8M21 20V6"/></symbol>
    <symbol id="ic-briefcase" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></symbol>
    <symbol id="ic-waves" viewBox="0 0 24 24"><path d="M2 6c2.5-2 5-2 7.5 0S15 8 17.5 6 22 4 22 4"/><path d="M2 12c2.5-2 5-2 7.5 0s5 2 7.5 0 4.5-2 4.5-2"/><path d="M2 18c2.5-2 5-2 7.5 0s5 2 7.5 0 4.5-2 4.5-2"/></symbol>
    <symbol id="ic-award" viewBox="0 0 24 24"><circle cx="12" cy="9" r="6"/><path d="M8.2 13.5L7 22l5-3 5 3-1.2-8.5"/></symbol>
    <symbol id="ic-refresh" viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 15.5-6.5L21 8"/><path d="M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.5L3 16"/><path d="M3 21v-5h5"/></symbol>
    <symbol id="ic-star" viewBox="0 0 24 24"><path d="M12 2l3 6.5 7 1-5 5 1.5 7L12 18l-6.5 3.5L7 14.5l-5-5 7-1L12 2z"/></symbol>
    <symbol id="ic-eye" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></symbol>
    <symbol id="ic-menu" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></symbol>
    <symbol id="ic-flag" viewBox="0 0 24 24"><path d="M4 22V4a1 1 0 0 1 1-1h11l-2 4 2 4H5"/></symbol>
  </defs>
</svg>`;
  if (document.body) {
    document.body.insertAdjacentHTML('afterbegin', svg);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      document.body.insertAdjacentHTML('afterbegin', svg);
    });
  }
})();
