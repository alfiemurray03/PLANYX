(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const pad = (value) => String(Math.max(0, Number(value) || 0)).padStart(2, "0");
  const featureIcons = [
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M5 19V9l7-5 7 5v10"></path><path d="M9 19v-6h6v6"></path></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M4 18h16"></path><path d="M6 15l4-4 3 2 5-6"></path></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M12 21s7-4.4 7-11a7 7 0 0 0-14 0c0 6.6 7 11 7 11Z"></path><circle cx="12" cy="10" r="2"></circle></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M6 3h9l3 3v15H6z"></path><path d="M9 12h6M9 16h6"></path></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v4l3 2"></path></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M20 12a8 8 0 1 1-3-6.2"></path><path d="m9 12 2 2 5-6"></path></svg>'
  ];
  let countdownTimer = null;

  function cleanPublicBranding(value) {
    return String(value || "")
      .replace(/https?:\/\/(?:www\.)?planyx\.jagroupservices\.co\.uk/gi, "https://sousamurrayplaneia.jagroupservices.co.uk")
      .replace(/\bplanyx\.jagroupservices\.co\.uk\b/gi, "sousamurrayplaneia.jagroupservices.co.uk")
      .replace(/\bJA Plan Studio\b/gi, "Sousa Murray Planeia")
      .replace(/\bPlanyx\b/gi, "Sousa Murray Planeia")
      .replace(/\bplanyx@jagroupservices\.co\.uk\b/gi, "contact@jagroupservices.co.uk");
  }

  function setText(id, value) {
    const element = byId(id);
    const cleaned = cleanPublicBranding(value).trim();
    if (element && cleaned) element.textContent = cleaned;
  }

  function renderFeatures(features) {
    const list = byId("coming-soon-features");
    if (!list || !Array.isArray(features)) return;
    const values = features.map((item) => cleanPublicBranding(item).trim()).filter(Boolean);
    if (!values.length) return;

    list.replaceChildren(...values.map((value, index) => {
      const item = document.createElement("li");
      item.className = "feature";
      item.innerHTML = featureIcons[index % featureIcons.length];
      const text = document.createElement("span");
      text.textContent = value;
      item.append(text);
      return item;
    }));
  }

  function stopCountdown() {
    if (countdownTimer) window.clearInterval(countdownTimer);
    countdownTimer = null;
  }

  function startCountdown(launchDate, enabled) {
    const countdown = byId("countdown");
    if (!countdown) return;

    stopCountdown();
    const target = launchDate ? new Date(launchDate).getTime() : Number.NaN;
    if (!enabled || !launchDate || Number.isNaN(target)) {
      countdown.hidden = true;
      return;
    }

    function tick() {
      const remaining = target - Date.now();
      if (remaining <= 0) {
        countdown.hidden = true;
        stopCountdown();
        return;
      }

      const totalSeconds = Math.floor(remaining / 1000);
      setText("days", pad(Math.floor(totalSeconds / 86400)));
      setText("hours", pad(Math.floor((totalSeconds % 86400) / 3600)));
      setText("minutes", pad(Math.floor((totalSeconds % 3600) / 60)));
      setText("seconds", pad(totalSeconds % 60));
      countdown.hidden = false;
    }

    tick();
    countdownTimer = window.setInterval(tick, 1000);
  }

  async function loadConfiguration() {
    try {
      const response = await fetch("/api/coming-soon-config", {
        headers: { Accept: "application/json" },
        cache: "no-store",
        credentials: "same-origin"
      });
      if (!response.ok) return;
      const config = await response.json();
      if (!config || config.success === false) return;

      const platformName = cleanPublicBranding(config.platformName || "Sousa Murray Planeia").trim() || "Sousa Murray Planeia";
      setText("platform-name", `${platformName} is nearly ready`);
      setText("coming-soon-title", config.headline || "Your next experience starts here.");
      setText("coming-soon-subtext", config.subtext || "We are shaping a smarter, calmer way to turn ideas into experiences worth remembering.");
      setText("coming-soon-description", config.description || "Build plans around the people, places and moments that matter—then keep everything together in one beautifully organised space.");
      renderFeatures(config.features);
      startCountdown(config.launchDate, config.countdownEnabled === true);

      const title = cleanPublicBranding(config.headline || "Coming Soon").trim();
      document.title = `${title} — ${platformName}`;
    } catch (error) {
      console.warn("Coming Soon configuration could not be loaded.", error instanceof Error ? error.message : error);
    }
  }

  async function loadBrowserBranding() {
    for (const endpoint of ["/site-settings", "/api/site-settings/public"]) {
      try {
        const response = await fetch(endpoint, {
          headers: { Accept: "application/json" },
          cache: "no-store",
          credentials: "same-origin"
        });
        if (!response.ok) continue;
        const data = await response.json();
        const tabName = cleanPublicBranding(data.browser?.tab_name || data.settings?.browser_tab_name || "Sousa Murray Planeia").trim();
        const headline = cleanPublicBranding(byId("coming-soon-title")?.textContent || "Coming Soon").trim();
        document.title = `${headline} — ${tabName || "Sousa Murray Planeia"}`;
        return;
      } catch {
        // Try the next public settings endpoint.
      }
    }
  }

  async function initialisePage() {
    await loadConfiguration();
    await loadBrowserBranding();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialisePage, { once: true });
  } else {
    void initialisePage();
  }
})();
