# Closed Sidebar by default

Discourse theme component that, on mobile viewports (≤767px), keeps the sidebar
closed by default and lets users open it by swiping from the left edge and close
it by swiping left. In a configurable list of categories the sidebar auto-opens
instead.

## How it works

- Open/close reuses Discourse's own sidebar toggle (the header hamburger
  control) instead of overriding core CSS, so it stays compatible across
  upgrades and animates with the native slide-in panel + backdrop.
- Desktop/tablet behavior is untouched.
- The initializer lives in `javascripts/discourse/api-initializers/`, the path
  Discourse auto-loads.

## Settings

- **exempt_categories** — category slugs (as they appear in the URL) where the
  sidebar should auto-open on mobile. Editable from the component's Settings
  tab in the admin panel. Default: `glosario`, `trading-curso`, `wiki`.
