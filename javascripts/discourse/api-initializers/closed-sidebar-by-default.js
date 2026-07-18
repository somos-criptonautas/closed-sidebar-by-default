import { apiInitializer } from "discourse/lib/api";
import { schedule } from "@ember/runloop";

// Closed Sidebar by Default + swipe gestures (mobile only).
//
// On mobile viewports the Discourse sidebar is hidden by default. Users open it
// by swiping from the left edge and close it by swiping left. In a configurable
// set of categories the sidebar auto-opens instead.
//
// Open/close reuses Discourse's own sidebar toggle (the header hamburger
// control) rather than overriding core CSS, so it stays compatible across
// upgrades and animates with the native slide-in panel + backdrop.
//
// No teardown hook is registered on purpose: a theme component loads once for
// the lifetime of the single-page app, and the document-level listeners must
// stay active the whole time, so there is nothing to clean up.

export default apiInitializer("1.0", (api) => {
  const MOBILE_MAX_WIDTH = 767;
  const EDGE_ZONE_PX = 30; // distance from left edge that starts an "open" swipe
  const SWIPE_THRESHOLD_PX = 50; // min horizontal travel to trigger
  const DIRECTION_LOCK_PX = 8; // travel before we decide horizontal vs vertical
  const MAX_VERTICAL_DRIFT_PX = 60; // ignore mostly-vertical gestures (scrolls)
  const LISTING_SEGMENTS = new Set([
    "l",
    "latest",
    "top",
    "new",
    "unread",
    "hot",
    "old",
  ]);

  // --- settings ------------------------------------------------------------

  // `settings` is injected by the theme runtime. Reading it via a typeof guard
  // avoids a ReferenceError that would silently abort the whole initializer if
  // it ever isn't defined in scope.
  const setting = (key, fallback) =>
    typeof settings === "undefined" || settings[key] === undefined
      ? fallback
      : settings[key];

  const swipeEnabled = () => setting("enable_swipe", true) !== false;
  const debugEnabled = () => setting("debug_mode", false) === true;

  // On-screen diagnostic readout (only rendered when debug_mode is on). Lets us
  // confirm touch detection on a real device without needing console access.
  let debugEl = null;
  const debug = (msg) => {
    if (!debugEnabled()) {
      return;
    }
    if (!debugEl) {
      debugEl = document.createElement("div");
      debugEl.style.cssText =
        "position:fixed;bottom:8px;left:8px;z-index:99999;background:rgba(0,0,0,.78);color:#4caf50;font:12px/1.4 monospace;padding:8px 10px;border-radius:8px;max-width:72vw;white-space:pre-wrap;pointer-events:none;";
      document.body.appendChild(debugEl);
    }
    debugEl.textContent = `CSBD: ${msg}`;
  };

  // `exempt_categories` is a "list" setting delivered as an array.
  const exemptCategories = () => {
    const raw = setting("exempt_categories", null);
    if (!raw) {
      return [];
    }
    const list = Array.isArray(raw) ? raw : String(raw).split("|");
    return list.map((s) => s.trim().toLowerCase()).filter(Boolean);
  };

  // --- viewport ------------------------------------------------------------

  const isMobile = () =>
    window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches;

  // --- sidebar state (read from DOM, write via native toggle) --------------

  // Optional service read: harmless if the property exists, ignored otherwise.
  let sidebarState = null;
  try {
    sidebarState = api.container.lookup("service:sidebar-state");
  } catch (e) {
    sidebarState = null;
  }

  const isSidebarShowing = () => {
    if (sidebarState && typeof sidebarState.showSidebar === "boolean") {
      return sidebarState.showSidebar;
    }
    // Fallback: the wrapper is only present *and visible* when the panel is open.
    const el = document.querySelector(".sidebar-wrapper");
    return !!(el && el.offsetParent !== null);
  };

  // Locate Discourse's own toggle control. Selectors are ordered from most to
  // least specific to survive markup changes between versions.
  const findToggle = () =>
    document.querySelector(
      ".header-sidebar-toggle button, .header-sidebar-toggle .btn, .btn-sidebar-toggle, .header-sidebar-toggle"
    );

  const clickToggle = () => {
    const btn = findToggle();
    if (btn) {
      btn.click();
      debug(`toggle CLICK (${btn.className || btn.tagName})`);
      return true;
    }
    debug("toggle NOT found");
    return false;
  };

  const openSidebar = () => {
    if (!isSidebarShowing()) {
      clickToggle();
    }
  };

  const closeSidebar = () => {
    if (isSidebarShowing()) {
      clickToggle();
    }
  };

  // --- category detection --------------------------------------------------

  const isInExemptCategory = () => {
    const exempt = exemptCategories();
    if (exempt.length === 0) {
      return false;
    }

    const parts = window.location.pathname.split("/").filter(Boolean);
    const categoryIndex = parts.indexOf("c");
    if (categoryIndex === -1 || !parts[categoryIndex + 1]) {
      return false;
    }

    const slugs = parts
      .slice(categoryIndex + 1)
      .filter((segment) => !LISTING_SEGMENTS.has(segment))
      .map((s) => s.toLowerCase());

    return slugs.some((slug) => exempt.includes(slug));
  };

  // --- default state on load / navigation ----------------------------------

  const applyDefaultState = () => {
    if (!isMobile()) {
      return; // desktop keeps Discourse's normal behavior
    }

    // Wait for the header (and its toggle) to be in the DOM before acting.
    schedule("afterRender", () => {
      if (isInExemptCategory()) {
        openSidebar();
      } else {
        closeSidebar();
      }
    });
  };

  // --- swipe gestures ------------------------------------------------------

  let startX = null;
  let startY = null;
  let tracking = false;
  let horizontalLocked = null;

  const resetGesture = () => {
    startX = null;
    startY = null;
    tracking = false;
    horizontalLocked = null;
  };

  const onTouchStart = (e) => {
    if (!swipeEnabled() || !isMobile() || e.touches.length !== 1) {
      resetGesture();
      return;
    }
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    horizontalLocked = null;

    // Track when opening from the left edge, or any gesture while the sidebar
    // is already open (so we can close it).
    tracking = startX <= EDGE_ZONE_PX || isSidebarShowing();
    if (debugEnabled()) {
      debug(
        `touchstart x=${Math.round(startX)} edge≤${EDGE_ZONE_PX} showing=${isSidebarShowing()} tracking=${tracking}`
      );
    }
  };

  const onTouchMove = (e) => {
    if (!tracking || startX === null) {
      return;
    }
    const t = e.touches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    if (
      horizontalLocked === null &&
      (Math.abs(dx) > DIRECTION_LOCK_PX || Math.abs(dy) > DIRECTION_LOCK_PX)
    ) {
      horizontalLocked = Math.abs(dx) > Math.abs(dy);
    }

    if (horizontalLocked === false) {
      tracking = false; // vertical scroll — hand it back to the page
      return;
    }

    if (
      horizontalLocked === true &&
      Math.abs(dy) <= MAX_VERTICAL_DRIFT_PX &&
      e.cancelable
    ) {
      e.preventDefault(); // keep the page from scrolling during the swipe
    }
  };

  const onTouchEnd = (e) => {
    if (!tracking || startX === null) {
      resetGesture();
      return;
    }
    const t = e.changedTouches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    if (horizontalLocked === true && Math.abs(dy) <= MAX_VERTICAL_DRIFT_PX) {
      if (debugEnabled()) {
        debug(
          `swipe dx=${Math.round(dx)} dy=${Math.round(dy)} showing=${isSidebarShowing()}`
        );
      }
      if (!isSidebarShowing() && dx >= SWIPE_THRESHOLD_PX) {
        openSidebar();
      } else if (isSidebarShowing() && dx <= -SWIPE_THRESHOLD_PX) {
        closeSidebar();
      }
    }

    resetGesture();
  };

  document.addEventListener("touchstart", onTouchStart, {
    passive: true,
    capture: true,
  });
  document.addEventListener("touchmove", onTouchMove, {
    passive: false,
    capture: true,
  });
  document.addEventListener("touchend", onTouchEnd, {
    passive: true,
    capture: true,
  });

  // --- lifecycle -----------------------------------------------------------

  api.onPageChange(applyDefaultState);
});
