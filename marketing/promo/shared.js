/* Shared helpers for the RentNest promo (video renderer + interactive player). */
(function (g) {
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const ease = {
    out: (x) => 1 - Math.pow(1 - x, 3),
    inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    back: (x) => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  };
  /** Progress 0..1 of a tween that starts at `start` seconds and lasts `dur`. */
  const k = (t, start, dur, e = ease.out) => e(clamp((t - start) / dur));
  const lerp = (a, b, p) => a + (b - a) * p;
  const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");

  const LOGO_SVG =
    '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#4f46e5"/><path d="M14 34 32 18l18 16v14a2 2 0 0 1-2 2H38V38H26v12H16a2 2 0 0 1-2-2z" fill="#fff"/></svg>';
  const PIN_SVG =
    '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>';
  const CHECK_SVG =
    '<svg viewBox="0 0 24 24" width="62%" height="62%" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="check-path" d="M5 12.5l4.5 4.5L19 7.5" pathLength="1"/></svg>';

  /** Build a phone mockup element around a screenshot URL. */
  function phone(src, alt) {
    const el = document.createElement("div");
    el.className = "phone";
    el.innerHTML = `<div class="notch"></div><div class="screen"><img alt="${alt || ""}" src="${src}"></div>`;
    return el;
  }

  /** Scroll a phone's screenshot: p = 0..1 of the maximum scroll (capped at maxScreens). */
  function scrollPhone(el, p, maxScreens = 3) {
    const img = el.querySelector("img");
    const screen = el.querySelector(".screen");
    if (!img.naturalWidth) return;
    const shownH = (img.naturalHeight / img.naturalWidth) * screen.clientWidth;
    const max = Math.max(0, Math.min(shownH - screen.clientHeight, screen.clientHeight * maxScreens));
    img.style.transform = `translateY(${-max * p}px)`;
  }

  g.RN = { clamp, ease, k, lerp, inr, phone, scrollPhone, LOGO_SVG, PIN_SVG, CHECK_SVG };
})(window);
