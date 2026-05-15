const isLocalhost = Boolean(
  window.location.hostname === "localhost" ||
    window.location.hostname === "[::1]" ||
    window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d?\d)){3}$/)
);

export function register() {
  const canRegister = window.isSecureContext || isLocalhost;

  if ("serviceWorker" in navigator && process.env.NODE_ENV === "production" && canRegister) {
    const publicUrl = new URL(process.env.PUBLIC_URL, window.location.href);

    if (publicUrl.origin !== window.location.origin) {
      return;
    }

    window.addEventListener("load", async () => {
      const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;

      try {
        const registration = await navigator.serviceWorker.register(swUrl);

        registration.onupdatefound = () => {
          const installingWorker = registration.installing;

          if (!installingWorker) {
            return;
          }

          installingWorker.onstatechange = () => {
            if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
              window.dispatchEvent(new CustomEvent("sw-update-available"));
            }
          };
        };
      } catch (error) {
        console.error("Service worker registration failed:", error);
      }
    });
  }
}

export function unregister() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
      })
      .catch((error) => {
        console.error("Service worker unregister failed:", error);
      });
  }
}
