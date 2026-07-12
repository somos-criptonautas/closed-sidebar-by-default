import { withPluginApi } from "discourse/lib/plugin-api";
import { run } from "@ember/runloop";

export default {
  name: "closed-sidebar-by-default",

  initialize() {
    withPluginApi("0.8", (api) => {
      let sidebarState;
      try {
        sidebarState = api.container.lookup("service:sidebar-state");
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(
          "[closed-sidebar-by-default] sidebar-state service not available",
          error
        );
      }

      const site = api.container.lookup("site:main");
      if (!site) {
        // eslint-disable-next-line no-console
        console.warn("[closed-sidebar-by-default] site:main not available");
        return;
      }

      const EXEMPT_CATEGORIES = ["glosario", "trading-curso", "wiki"];
      const LISTING_SEGMENTS = new Set([
        "l",
        "latest",
        "top",
        "new",
        "unread",
        "hot",
        "old",
      ]);
      const TABLET_BREAKPOINT = 1024;
      const EDGE_ZONE_RATIO = 0.2;
      const MIN_SWIPE_DISTANCE = 50;
      const MAX_VERTICAL_DRIFT = 100;
      const RESIZE_DEBOUNCE_MS = 150;
      const STATE_DELAY_MS = 50;

      let touchStartX = null;
      let touchStartY = null;
      let listenersAttached = false;
      let resizeTimeout = null;
      let stateTimeout = null;
      let isInExemptCategory = false;

      const isNarrowViewport = () =>
        site.mobileView || window.innerWidth < TABLET_BREAKPOINT;

      const detectCategoryFromPath = () => {
        const parts = window.location.pathname.split("/").filter(Boolean);
        const categoryIndex = parts.indexOf("c");

        if (categoryIndex === -1 || !parts[categoryIndex + 1]) {
          return false;
        }

        const categorySlugs = parts
          .slice(categoryIndex + 1)
          .filter((segment) => !LISTING_SEGMENTS.has(segment));

        return categorySlugs.some((slug) => EXEMPT_CATEGORIES.includes(slug));
      };

      const updateExemptCategory = () => {
        isInExemptCategory = detectCategoryFromPath();
      };

      const toggleSidebarDOM = (visible) => {
        const html = document.documentElement;
        if (!html) {
          return;
        }

        if (visible) {
          html.classList.add("sidebar-open");
          html.classList.remove("sidebar-closed");
        } else {
          html.classList.remove("sidebar-open");
          html.classList.add("sidebar-closed");
        }
      };

      const setSidebarState = (visible) => {
        const apply = () => {
          if (sidebarState) {
            if (typeof sidebarState.setShowSidebar === "function") {
              sidebarState.setShowSidebar(visible);
            } else if (typeof sidebarState.set === "function") {
              sidebarState.set("showSidebar", visible);
            } else {
              sidebarState.showSidebar = visible;
            }
          }

          toggleSidebarDOM(visible);
        };

        if (stateTimeout) {
          clearTimeout(stateTimeout);
        }

        run(() => {
          apply();

          stateTimeout = setTimeout(() => {
            apply();
            stateTimeout = null;
          }, STATE_DELAY_MS);
        });
      };

      const openSidebar = () => setSidebarState(true);

      const onTouchStart = (event) => {
        if (event.touches.length !== 1) {
          touchStartX = null;
          touchStartY = null;
          return;
        }

        const touch = event.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
      };

      const onTouchMove = (event) => {
        if (touchStartX === null || touchStartY === null) {
          return;
        }

        const touch = event.touches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;

        if (
          touchStartX <= window.innerWidth * EDGE_ZONE_RATIO &&
          deltaX > 0 &&
          Math.abs(deltaY) <= MAX_VERTICAL_DRIFT
        ) {
          event.preventDefault();
        }
      };

      const onTouchEnd = (event) => {
        if (touchStartX === null || touchStartY === null) {
          return;
        }

        const touch = event.changedTouches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;
        const edgeZone = window.innerWidth * EDGE_ZONE_RATIO;

        if (
          touchStartX <= edgeZone &&
          deltaX >= MIN_SWIPE_DISTANCE &&
          Math.abs(deltaY) <= MAX_VERTICAL_DRIFT
        ) {
          openSidebar();
        }

        touchStartX = null;
        touchStartY = null;
      };

      const attachSwipeListeners = () => {
        if (listenersAttached || !isNarrowViewport()) {
          return;
        }

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
        listenersAttached = true;
      };

      const detachSwipeListeners = () => {
        if (!listenersAttached) {
          return;
        }

        document.removeEventListener("touchstart", onTouchStart, true);
        document.removeEventListener("touchmove", onTouchMove, true);
        document.removeEventListener("touchend", onTouchEnd, true);
        listenersAttached = false;
      };

      const applySidebarState = () => {
        updateExemptCategory();

        if (isNarrowViewport()) {
          setSidebarState(isInExemptCategory);
          attachSwipeListeners();
        } else {
          setSidebarState(true);
          detachSwipeListeners();
        }
      };

      const onResize = () => {
        if (resizeTimeout) {
          clearTimeout(resizeTimeout);
        }

        resizeTimeout = setTimeout(() => {
          applySidebarState();
          resizeTimeout = null;
        }, RESIZE_DEBOUNCE_MS);
      };

      applySidebarState();

      api.onPageChange(applySidebarState);
      site.addObserver("mobileView", site, applySidebarState);
      window.addEventListener("resize", onResize, { passive: true });

      const cleanup = () => {
        site.removeObserver("mobileView", site, applySidebarState);
        window.removeEventListener("resize", onResize);

        if (resizeTimeout) {
          clearTimeout(resizeTimeout);
          resizeTimeout = null;
        }

        if (stateTimeout) {
          clearTimeout(stateTimeout);
          stateTimeout = null;
        }

        detachSwipeListeners();
      };

      if (typeof api.cleanupStream === "function") {
        api.cleanupStream(cleanup);
      }
    });
  },
};
