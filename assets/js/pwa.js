/* Instalação do app (PWA): registra o service worker e controla o botão "Instalar". */
(function () {
  "use strict";

  let deferredPrompt = null;
  const listeners = new Set();

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Service worker não registrado:", err));
    });
  }

  // Android/Chrome/Edge: guarda o evento para mostrar nosso próprio botão.
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    listeners.forEach((fn) => fn());
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    listeners.forEach((fn) => fn());
  });

  function isInstalled() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  // "prompt" = dá para instalar com um toque; "ios" = mostrar instruções; "installed"; ou "unavailable".
  function status() {
    if (isInstalled()) return "installed";
    if (deferredPrompt) return "prompt";
    if (isIos()) return "ios";
    return "unavailable";
  }

  async function install() {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    listeners.forEach((fn) => fn());
    return outcome === "accepted";
  }

  window.MegPWA = {
    status,
    install,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
})();
