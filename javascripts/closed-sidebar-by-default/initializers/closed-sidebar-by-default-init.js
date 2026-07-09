import { withPluginApi } from "discourse/lib/plugin-api";
import { addObserver } from "@ember/object/observers";

const SIDEBAR_MOBILE_KEY = "discourse_narative_Sidebar_showSidebar";

export default {
  name: "closed-sidebar-by-default",

  initialize() {
    withPluginApi("0.8", (api) => {
      const applicationController = api.container.lookup("controller:application");
      const site = api.container.lookup("site:main");

      const applySidebarState = () => {
        const isMobile = site.mobileView;

        if (isMobile) {
          const storedState = localStorage.getItem(SIDEBAR_MOBILE_KEY);
          if (storedState === null) {
            applicationController.set("showSidebar", false);
            localStorage.setItem(SIDEBAR_MOBILE_KEY, "false");
          } else {
            applicationController.set("showSidebar", storedState === "true");
          }
        } else {
          const storedState = localStorage.getItem(SIDEBAR_MOBILE_KEY);
          if (storedState === "false") {
            applicationController.set("showSidebar", false);
          }
        }
      };

      applySidebarState();

      addObserver(site, "mobileView", () => {
        applySidebarState();
      });
    });
  },
};
