import { withPluginApi } from "discourse/lib/plugin-api";

export default {
  name: "closed-sidebar-by-default",

  initialize() {
    withPluginApi("0.8", (api) => {
      const applicationController = api.container.lookup("controller:application");
      const site = api.container.lookup("site:main");

      let touchStartX = null;
      let touchStartY = null;
      let listenersAttached = false;
      let resizeTimeout = null;

      const EDGE_ZONE_RATIO = 0.2;
      const MIN_SWIPE_DISTANCE = 50;
      const MAX_VERTICAL_DRIFT = 100;
      const TABLET_BREAKPOINT = 1024;
      const RESIZE_DEBOUNCE_MS = 150;

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
          applicationController.set("showSidebar", true);
        }

        touchStartX = null;
        touchStartY = null;
      };

      const attachSwipeListeners = () => {
        if (listenersAttached || !shouldCloseSidebar()) {
          return;
        }

        document.addEventListener("touchstart", onTouchStart, { passive: true });
        document.addEventListener("touchend", onTouchEnd, { passive: true });
        listenersAttached = true;
      };

      const detachSwipeListeners = () => {
        if (!listenersAttached) {
          return;
        }

        document.removeEventListener("touchstart", onTouchStart);
        document.removeEventListener("touchend", onTouchEnd);
        listenersAttached = false;
      };

      const shouldCloseSidebar = () => {
        return site.mobileView || window.innerWidth < TABLET_BREAKPOINT;
      };

      const applySidebarState = () => {
        if (shouldCloseSidebar()) {
          applicationController.set("showSidebar", false);
          attachSwipeListeners();
        } else {
          applicationController.set("showSidebar", true);
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

      const attachResizeListener = () => {
        window.addEventListener("resize", onResize, { passive: true });
      };

      const cleanup = () => {
        detachSwipeListeners();
        site.removeObserver("mobileView", site, applySidebarState);
        window.removeEventListener("resize", onResize);

        if (resizeTimeout) {
          clearTimeout(resizeTimeout);
          resizeTimeout = null;
        }
      };

      applySidebarState();

      site.addObserver("mobileView", site, applySidebarState);
      attachResizeListener();

      if (typeof api.cleanupStream === "function") {
        api.cleanupStream(cleanup);
      }
    });
  },
};
