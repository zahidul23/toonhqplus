export const DISPLAY_MODE_STYLE_ID = 'toonhq-plus-display-mode';

// Keep the site's existing theme colors, patterns, illustrations, and status
// colors. Only replace the large neutral/light surfaces that become harsh in a
// dark browser theme.
export const DISPLAY_MODE_CSS = `
html[data-toonhq-plus-display-mode="dark"] {
  color-scheme: dark;
}

html[data-toonhq-plus-display-mode="dark"] body {
  background-color: #101a16 !important;
  color: #e7f3eb !important;
}

/* Match only the top navigation bar to each page's footer accent. Secondary
   navigation stays on ToonHQ's original page-specific colors. */
html[data-toonhq-plus-display-mode="dark"] .theme--generic .navbar.navbar-default,
html[data-toonhq-plus-display-mode="dark"] .theme--generic-solid .navbar.navbar-default {
  background-color: #362f77 !important;
}

html[data-toonhq-plus-display-mode="dark"] .theme--home .navbar.navbar-default {
  background-color: #bfbfbf !important;
}

html[data-toonhq-plus-display-mode="dark"] .theme--groups .navbar.navbar-default,
html[data-toonhq-plus-display-mode="dark"] .theme--gardening .navbar.navbar-default {
  background-color: #284a35 !important;
}

html[data-toonhq-plus-display-mode="dark"] .theme--invasions .navbar.navbar-default {
  background-color: #137dbd !important;
}

html[data-toonhq-plus-display-mode="dark"] .theme--notifications .navbar.navbar-default {
  background-color: #068bc4 !important;
}

html[data-toonhq-plus-display-mode="dark"] .theme--fishing .navbar.navbar-default {
  background-color: #2f4882 !important;
}

html[data-toonhq-plus-display-mode="dark"] .theme--fos .navbar.navbar-default,
html[data-toonhq-plus-display-mode="dark"] .theme--guilds .navbar.navbar-default {
  background-color: #222030 !important;
}

html[data-toonhq-plus-display-mode="dark"] .theme--shop .navbar.navbar-default {
  background-color: #8d3d05 !important;
}

/* The background dimmer creates a stacking context for each page shell. Keep
   the navbar above the page banners so its overflowing menus remain visible. */
html[data-toonhq-plus-display-mode="dark"] .theme .navbar.navbar-default {
  position: relative;
  z-index: 20 !important;
}

html[data-toonhq-plus-display-mode="dark"] .theme .sl__header {
  position: relative;
  z-index: 20 !important;
  overflow: visible !important;
}

html[data-toonhq-plus-display-mode="dark"] .theme .navbar.navbar-default .dropdown-menu {
  z-index: 40 !important;
}

/* Dim only the bright patterned backgrounds; keep ToonHQ's layered artwork
   intact and leave cards, controls, and content at their normal contrast. */
html[data-toonhq-plus-display-mode="dark"] .theme--generic,
html[data-toonhq-plus-display-mode="dark"] .theme--generic-solid,
html[data-toonhq-plus-display-mode="dark"] .theme--home,
html[data-toonhq-plus-display-mode="dark"] .theme--invasions,
html[data-toonhq-plus-display-mode="dark"] .theme--notifications,
html[data-toonhq-plus-display-mode="dark"] .theme--fishing,
html[data-toonhq-plus-display-mode="dark"] .theme--groups,
html[data-toonhq-plus-display-mode="dark"] .theme--gardening,
html[data-toonhq-plus-display-mode="dark"] .theme--shop {
  position: relative;
  isolation: isolate;
}

html[data-toonhq-plus-display-mode="dark"] .theme--generic::before,
html[data-toonhq-plus-display-mode="dark"] .theme--generic-solid::before,
html[data-toonhq-plus-display-mode="dark"] .theme--home::before,
html[data-toonhq-plus-display-mode="dark"] .theme--invasions::before,
html[data-toonhq-plus-display-mode="dark"] .theme--notifications::before,
html[data-toonhq-plus-display-mode="dark"] .theme--fishing::before,
html[data-toonhq-plus-display-mode="dark"] .theme--groups::before,
html[data-toonhq-plus-display-mode="dark"] .theme--gardening::before,
html[data-toonhq-plus-display-mode="dark"] .theme--shop::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.22);
}

/* Groups and Gardening use busier, lighter artwork; keep more of it visible. */
html[data-toonhq-plus-display-mode="dark"] .theme--groups::before,
html[data-toonhq-plus-display-mode="dark"] .theme--gardening::before {
  background: rgba(0, 0, 0, 0.12);
}

html[data-toonhq-plus-display-mode="dark"] .theme--generic > :not(.vuedals):not(.v-toast):not(.modal):not(.modal-backdrop),
html[data-toonhq-plus-display-mode="dark"] .theme--generic-solid > :not(.vuedals):not(.v-toast):not(.modal):not(.modal-backdrop),
html[data-toonhq-plus-display-mode="dark"] .theme--home > :not(.vuedals):not(.v-toast):not(.modal):not(.modal-backdrop),
html[data-toonhq-plus-display-mode="dark"] .theme--invasions > :not(.vuedals):not(.v-toast):not(.modal):not(.modal-backdrop),
html[data-toonhq-plus-display-mode="dark"] .theme--notifications > :not(.vuedals):not(.v-toast):not(.modal):not(.modal-backdrop),
html[data-toonhq-plus-display-mode="dark"] .theme--fishing > :not(.vuedals):not(.v-toast):not(.modal):not(.modal-backdrop),
html[data-toonhq-plus-display-mode="dark"] .theme--groups > :not(.vuedals):not(.v-toast):not(.modal):not(.modal-backdrop),
html[data-toonhq-plus-display-mode="dark"] .theme--gardening > :not(.vuedals):not(.v-toast):not(.modal):not(.modal-backdrop),
html[data-toonhq-plus-display-mode="dark"] .theme--shop > :not(.vuedals):not(.v-toast):not(.modal):not(.modal-backdrop) {
  position: relative;
  z-index: 1;
}

/* Preserve ToonHQ's inactive navigation link colors; only the active/hover
   state gets the dark-mode contrast treatment. */
html[data-toonhq-plus-display-mode="dark"] .navbar.navbar-default .navbar-nav > li:hover > a:not(.sign-up),
html[data-toonhq-plus-display-mode="dark"] .navbar.navbar-default .navbar-nav > li.active > a:not(.sign-up) {
  color: #f2fff5 !important;
}

/* Match the dark-mode header logo to the footer's unoutlined logo asset. */
html[data-toonhq-plus-display-mode="dark"] .navbar-left__logo img[alt="ToonHQ"] {
  content: url("/static/dist/img/logo-sm.642a444f.png") !important;
  width: 160px !important;
  height: 55px !important;
}

html[data-toonhq-plus-display-mode="dark"] .theme--home {
  background-color: #16251f !important;
}

html[data-toonhq-plus-display-mode="dark"] .tt-card,
html[data-toonhq-plus-display-mode="dark"] .info-card,
html[data-toonhq-plus-display-mode="dark"] .card.filter-panel {
  background-color: #182820 !important;
  color: #e7f3eb !important;
  border-color: #315342 !important;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.24) !important;
}

/* The Doodles filter toggle/header sits above the filter card content and
   keeps the light theme's text color unless it is overridden explicitly. */
html[data-toonhq-plus-display-mode="dark"] .theme--shop .filter-panel > a,
html[data-toonhq-plus-display-mode="dark"] .theme--shop .filter-panel > a *,
html[data-toonhq-plus-display-mode="dark"] .theme--shop .filter-panel .card-header,
html[data-toonhq-plus-display-mode="dark"] .theme--shop .filter-panel .card-header *,
html[data-toonhq-plus-display-mode="dark"] .theme--shop .filter-panel .filter-header,
html[data-toonhq-plus-display-mode="dark"] .theme--shop .filter-panel .filter-header *,
html[data-toonhq-plus-display-mode="dark"] .theme--shop .filter-panel .card-body > a,
html[data-toonhq-plus-display-mode="dark"] .theme--shop .filter-panel .card-body > a * {
  background-color: #20382b !important;
  color: #ffffff !important;
  border-color: #315342 !important;
}

/* ToonHQ's Bootstrap table reset uses !important white cells, so cover the
   page tables as well as the card-specific tables above. */
html[data-toonhq-plus-display-mode="dark"] .theme table,
html[data-toonhq-plus-display-mode="dark"] .theme .table,
html[data-toonhq-plus-display-mode="dark"] .theme .table td,
html[data-toonhq-plus-display-mode="dark"] .theme .table th,
html[data-toonhq-plus-display-mode="dark"] .theme .track-card table,
html[data-toonhq-plus-display-mode="dark"] .theme .track-card table td,
html[data-toonhq-plus-display-mode="dark"] .theme .track-card table th {
  background-color: #182820 !important;
  color: #e7f3eb !important;
  border-color: #315342 !important;
}

html[data-toonhq-plus-display-mode="dark"] .theme .card,
html[data-toonhq-plus-display-mode="dark"] .theme .track-card,
html[data-toonhq-plus-display-mode="dark"] .theme .panel,
html[data-toonhq-plus-display-mode="dark"] .theme .list-group-item {
  background-color: #182820 !important;
  color: #e7f3eb !important;
  border-color: #315342 !important;
}

html[data-toonhq-plus-display-mode="dark"] .theme .card-header,
html[data-toonhq-plus-display-mode="dark"] .theme .card-footer,
html[data-toonhq-plus-display-mode="dark"] .theme .panel-heading,
html[data-toonhq-plus-display-mode="dark"] .theme .panel-footer {
  background-color: #20382b !important;
  color: #e7f3eb !important;
  border-color: #315342 !important;
}

html[data-toonhq-plus-display-mode="dark"] .info-card--groups:has(.info-card__content.toony-group) {
  background-color: #285b3c !important;
  color: #edfff2 !important;
}

html[data-toonhq-plus-display-mode="dark"] .info-card--groups:has(.info-card__content.stinky-group) {
  background-color: #653b3b !important;
  color: #fff0f0 !important;
}

/* Preserve inactive secondary-nav link colors; keep active links readable. */
html[data-toonhq-plus-display-mode="dark"] .theme .subnav__items > li a.active {
  color: #ffffff !important;
}

html[data-toonhq-plus-display-mode="dark"] .theme .subnav__btn,
html[data-toonhq-plus-display-mode="dark"] .theme .subnav-wrapper .btn.btn-subnav {
  background-color: #376447 !important;
  color: #ffffff !important;
  border-color: #4d7d5d !important;
}

html[data-toonhq-plus-display-mode="dark"] .tt-card h1,
html[data-toonhq-plus-display-mode="dark"] .tt-card h2,
html[data-toonhq-plus-display-mode="dark"] .tt-card h3,
html[data-toonhq-plus-display-mode="dark"] .tt-card h4,
html[data-toonhq-plus-display-mode="dark"] .tt-card h5,
html[data-toonhq-plus-display-mode="dark"] .tt-card h6,
html[data-toonhq-plus-display-mode="dark"] .info-card h1,
html[data-toonhq-plus-display-mode="dark"] .info-card h2,
html[data-toonhq-plus-display-mode="dark"] .info-card h3,
html[data-toonhq-plus-display-mode="dark"] .info-card h4,
html[data-toonhq-plus-display-mode="dark"] .info-card h5,
html[data-toonhq-plus-display-mode="dark"] .info-card h6 {
  color: #e7f3eb !important;
}

html[data-toonhq-plus-display-mode="dark"] .tt-card .table,
html[data-toonhq-plus-display-mode="dark"] .tt-card .table td,
html[data-toonhq-plus-display-mode="dark"] .tt-card .table th {
  background-color: #182820 !important;
  color: #e7f3eb !important;
  border-color: #315342 !important;
}

html[data-toonhq-plus-display-mode="dark"] .dropdown-menu {
  background-color: #284a35 !important;
  border-color: #315342 !important;
  color: #e7f3eb !important;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35) !important;
}

/* More/Profile menus follow the top navbar's page-specific footer color. */
html[data-toonhq-plus-display-mode="dark"] .theme--generic .navbar.navbar-default .dropdown-menu,
html[data-toonhq-plus-display-mode="dark"] .theme--generic-solid .navbar.navbar-default .dropdown-menu {
  background-color: #362f77 !important;
}

html[data-toonhq-plus-display-mode="dark"] .theme--home .navbar.navbar-default .dropdown-menu {
  background-color: #bfbfbf !important;
}

html[data-toonhq-plus-display-mode="dark"] .theme--groups .navbar.navbar-default .dropdown-menu,
html[data-toonhq-plus-display-mode="dark"] .theme--gardening .navbar.navbar-default .dropdown-menu {
  background-color: #284a35 !important;
}

html[data-toonhq-plus-display-mode="dark"] .theme--invasions .navbar.navbar-default .dropdown-menu {
  background-color: #137dbd !important;
}

html[data-toonhq-plus-display-mode="dark"] .theme--notifications .navbar.navbar-default .dropdown-menu {
  background-color: #068bc4 !important;
}

html[data-toonhq-plus-display-mode="dark"] .theme--fishing .navbar.navbar-default .dropdown-menu {
  background-color: #2f4882 !important;
}

html[data-toonhq-plus-display-mode="dark"] .theme--fos .navbar.navbar-default .dropdown-menu,
html[data-toonhq-plus-display-mode="dark"] .theme--guilds .navbar.navbar-default .dropdown-menu {
  background-color: #222030 !important;
}

html[data-toonhq-plus-display-mode="dark"] .theme--shop .navbar.navbar-default .dropdown-menu {
  background-color: #8d3d05 !important;
}

html[data-toonhq-plus-display-mode="dark"] .theme .user-dropdown .dropdown-menu,
html[data-toonhq-plus-display-mode="dark"] .theme .user-dropdown .dropdown-menu * {
  color: #ffffff !important;
}

html[data-toonhq-plus-display-mode="dark"] .dropdown-menu > li > a:hover,
html[data-toonhq-plus-display-mode="dark"] .dropdown-menu .dropdown-item:hover {
  background-color: #376447 !important;
}

/* Preserve each More-menu page link's ToonHQ color and tint the hover state
   relative to the current page nav instead of applying a fixed green. */
html[data-toonhq-plus-display-mode="dark"] .theme .navbar.navbar-default .dropdown-menu > li > a:hover,
html[data-toonhq-plus-display-mode="dark"] .theme .navbar.navbar-default .dropdown-menu .dropdown-item:hover {
  background-color: rgba(255, 255, 255, 0.16) !important;
}

html[data-toonhq-plus-display-mode="dark"] .form-control,
html[data-toonhq-plus-display-mode="dark"] select,
html[data-toonhq-plus-display-mode="dark"] textarea {
  background-color: #101a16 !important;
  color: #e7f3eb !important;
  border-color: #456a55 !important;
}

html[data-toonhq-plus-display-mode="dark"] .form-control::placeholder,
html[data-toonhq-plus-display-mode="dark"] textarea::placeholder {
  color: #9db9a6 !important;
}

html[data-toonhq-plus-display-mode="dark"] .vuedals {
  background-color: rgba(3, 12, 8, 0.78) !important;
}

html[data-toonhq-plus-display-mode="dark"] .vuedal,
html[data-toonhq-plus-display-mode="dark"] .vuedal.modal-content,
html[data-toonhq-plus-display-mode="dark"] .modal-content {
  background-color: #182820 !important;
  color: #e7f3eb !important;
  border-color: #315342 !important;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.42) !important;
}

html[data-toonhq-plus-display-mode="dark"] .group-details-dialog .invasion-info,
html[data-toonhq-plus-display-mode="dark"] .group-details-dialog .toonatar__backdrop {
  background-color: #264d36 !important;
  color: #cfe7d7 !important;
}

html[data-toonhq-plus-display-mode="dark"] .group-details-dialog {
  background-color: #264d36 !important;
}

html[data-toonhq-plus-display-mode="dark"] .group-details-dialog .speedchat__messages-hidden,
html[data-toonhq-plus-display-mode="dark"] .group-details-dialog .speedchat__footer {
  background-color: #20382b !important;
}

html[data-toonhq-plus-display-mode="dark"] .group-details-dialog .speedchat__messages-hidden,
html[data-toonhq-plus-display-mode="dark"] .group-details-dialog .speedchat__body,
html[data-toonhq-plus-display-mode="dark"] .group-details-dialog .speedchat__alert,
html[data-toonhq-plus-display-mode="dark"] .group-details-dialog .speedchat__footer {
  border-color: #315342 !important;
}

html[data-toonhq-plus-display-mode="dark"] .group-details-dialog .speedchat__header {
  background-color: #284a35 !important;
  color: #e7f3eb !important;
}

html[data-toonhq-plus-display-mode="dark"] .group-details-dialog .speedchat__header-title,
html[data-toonhq-plus-display-mode="dark"] .group-details-dialog .speedchat__back,
html[data-toonhq-plus-display-mode="dark"] .group-details-dialog .speedchat__back i {
  color: #d7f0df !important;
}

html[data-toonhq-plus-display-mode="dark"] .group-details-dialog .message__bubble {
  background-color: #304b3a !important;
  color: #e7f3eb !important;
}

html[data-toonhq-plus-display-mode="dark"] .group-details-dialog .table,
html[data-toonhq-plus-display-mode="dark"] .group-details-dialog .table td,
html[data-toonhq-plus-display-mode="dark"] .group-details-dialog .table th {
  background-color: #182820 !important;
  color: #e7f3eb !important;
  border-color: #315342 !important;
}

/* Re-apply saved-toon row colors after the dialog table reset. The extra
   table/class qualifiers are intentional: Bootstrap's dark table rule is
   more specific than the base injected highlight rule. */
html[data-toonhq-plus-display-mode="dark"] .group-details-dialog .table tr.toonhq-plus-favorite,
html[data-toonhq-plus-display-mode="dark"] .group-details-dialog .table tr.toonhq-plus-favorite td {
  background-color: rgba(34, 197, 94, 0.24) !important;
}

html[data-toonhq-plus-display-mode="dark"] .group-details-dialog .table tr.toonhq-plus-blocked,
html[data-toonhq-plus-display-mode="dark"] .group-details-dialog .table tr.toonhq-plus-blocked td {
  background-color: rgba(239, 68, 68, 0.24) !important;
}

html[data-toonhq-plus-display-mode="dark"] .group-details-dialog .modal-image-close {
  background-color: #20382b !important;
  color: #e7f3eb !important;
}

html[data-toonhq-plus-display-mode="dark"] .vuedal label,
html[data-toonhq-plus-display-mode="dark"] .vuedal p,
html[data-toonhq-plus-display-mode="dark"] .modal-content label,
html[data-toonhq-plus-display-mode="dark"] .modal-content p {
  color: #cfe7d7 !important;
}

html[data-toonhq-plus-display-mode="dark"] .alert.alert-primary {
  background-color: #193b4b !important;
  color: #c7efff !important;
  border-color: #2c6b84 !important;
}

html[data-toonhq-plus-display-mode="dark"] .theme__accent-bg {
  filter: brightness(0.82);
}
`;
