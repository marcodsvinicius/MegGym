/* Instalação do app (PWA): registra o service worker e controla o botão "Instalar". */
(function () {
  "use strict";

  let deferredPrompt = null;
  const listeners = new Set();

  /* ---------- Atualização: versão nova esperando → avisa o app → "Atualizar" ---------- */
  let waitingWorker = null;
  let updateRequested = false;
  const updateListeners = new Set();
  const CHECK_EVERY = 30 * 60 * 1000;

  function setWaiting(worker) {
    waitingWorker = worker;
    updateListeners.forEach((fn) => fn());
  }

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    const sw = navigator.serviceWorker;
    window.addEventListener("load", async () => {
      let reg;
      try {
        reg = await sw.register("sw.js");
      } catch (err) {
        console.warn("Service worker não registrado:", err);
        return;
      }
      if (!reg) return; // navegador bloqueou o service worker (ex.: modo privado)
      // Só é "atualização" se já havia uma versão controlando a página.
      if (reg.waiting && sw.controller) setWaiting(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && sw.controller) setWaiting(worker);
        });
      });
      // Procura versão nova ao voltar para o app e a cada 30 min.
      const check = () => reg.update().catch(() => {});
      document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && check());
      setInterval(check, CHECK_EVERY);
      window.MegPWA.checkForUpdate = check;
    });
    // A versão nova assumiu (depois do "Atualizar"): recarrega uma vez para usar os arquivos novos.
    sw.addEventListener("controllerchange", () => {
      if (!updateRequested) return;
      updateRequested = false;
      location.reload();
    });
  }

  function applyUpdate() {
    if (!waitingWorker) return false;
    updateRequested = true;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
    return true;
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
    updateAvailable: () => Boolean(waitingWorker),
    applyUpdate,
    checkForUpdate: () => Promise.resolve(),
    onUpdate(fn) {
      updateListeners.add(fn);
      return () => updateListeners.delete(fn);
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
})();
