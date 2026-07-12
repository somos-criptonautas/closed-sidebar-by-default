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
          "[closed-sidebar-by-default] sidebar-state service not available:",
          error
        );
        return;
      }

      const site = api.container.lookup("site:main");
      if (!site) {
        // eslint-disable-next-line no-console
        console.warn("[closed-sidebar-by-default] site:main not available");
        return;
      }

      const EXEMPT_CATEGORIES = ["glosario", "trading-curso", "wiki"];
      const TABLET_BREAKPOINT = 1024;
      const EDGE_ZONE_RATIO = 0.2;
      const MIN_SWIPE_DISTANCE = 50;
      const MAX_VERTICAL_DRIFT = 100;
      const RESIZE_DEBOUNCE_MS = 150;

      let touchStartX = null;
      let touchStartY = null;
      let listenersAttached = false;
      let resizeTimeout = null;
      let currentCategorySlug = null;

      const isNarrowViewport = () =>
        site.mobileView || window.innerWidth < TABLET_BREAKPOINT;

      const detectCategoryFromPath = () => {
        const parts = window.location.pathname.split("/").filter(Boolean);
        const categoryIndex = parts.indexOf("c");

        if (categoryIndex !== -1 && parts[categoryIndex + 1]) {
          // /c/<slug> or /c/<parent>/<slug>: the last segment is the active category
          return parts[parts.length - 1];
        }

        return null;
      };

      const updateCurrentCategory = () => {
        currentCategorySlug = detectCategoryFromPath();
      };

      const isExemptCategory = () =>
        currentCategorySlug && EXEMPT_CATEGORIES.includes(currentCategorySlug);

      const setSidebarState = (visible) => {
        if (!sidebarState) {
          return;
        }

        run(() => {
          if (typeof sidebarState.set === "function") {
            sidebarState.set("showSidebar", visible);
          } else {
            sidebarState.showSidebar = visible;
          }
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
        document.removeEventListener("touchend", onTouchEnd, true);
        listenersAttached = false;
      };

      const applySidebarState = () => {
        updateCurrentCategory();

        if (isNarrowViewport()) {
          setSidebarState(isExemptCategory());
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

        detachSwipeListeners();
      };

      if (typeof api.cleanupStream === "function") {
        api.cleanupStream(cleanup);
      }
    });
  },
};
