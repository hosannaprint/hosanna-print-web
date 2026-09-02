/* =========================================================
   Hosanna Print — main.js
   1) Sticky nav — blur + shadow po scrolle
   2) Scroll reveal — IntersectionObserver (vanilla), s fallbackom
      pre prefers-reduced-motion a prehliadače bez observera
   3) Scroll progress pre sekciu "Ako to funguje"
   ========================================================= */

/* ---------- Sticky nav + scroll reveal ---------- */
(function () {
  "use strict";

  var doc = document.documentElement;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Sticky nav — blur + shadow once scrolled */
  var nav = document.getElementById("nav");
  var onScroll = function () {
    nav.classList.toggle("is-scrolled", window.scrollY > 12);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* Scroll reveal — only armed once JS confirms the observer can run */
  var items = Array.prototype.slice.call(document.querySelectorAll(".reveal"));

  var showAll = function () {
    items.forEach(function (el) { el.classList.add("is-visible"); });
  };

  if (reduced || !("IntersectionObserver" in window)) {
    showAll();
    return;
  }

  doc.classList.add("js-reveal");

  var reveal = function (el) {
    el.classList.add("is-visible");
    if (observer) { observer.unobserve(el); }
  };

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) { reveal(entry.target); }
    });
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });

  items.forEach(function (el, i) {
    el.style.transitionDelay = (i % 3) * 70 + "ms";
    observer.observe(el);
  });

  /* Fallback: reveal anything already within (or near) the viewport.
     Covers throttled observers in hidden tabs / background frames and any
     environment where the observer is slow to fire. */
  var revealInView = function () {
    var h = window.innerHeight || document.documentElement.clientHeight;
    items.forEach(function (el) {
      if (el.classList.contains("is-visible")) { return; }
      if (el.getBoundingClientRect().top < h * 1.15) { reveal(el); }
    });
  };
  ["scroll", "resize", "load", "pageshow"].forEach(function (evt) {
    window.addEventListener(evt, revealInView, { passive: true });
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") { revealInView(); }
  });
  var ticks = 0;
  var poll = window.setInterval(function () {
    revealInView();
    if (++ticks > 20) { window.clearInterval(poll); }
  }, 250);
  revealInView();

  /* Hard failsafe: never leave content hidden. */
  window.setTimeout(showAll, 2500);
})();

/* ---------- Scroll progress: Ako to funguje ---------- */
(function () {
  "use strict";

  var track = document.getElementById("stepsTrack");
  if (!track) { return; }

  var fill = document.getElementById("stepsFill");
  var rail = track.querySelector(".steps__rail");
  var steps = Array.prototype.slice.call(track.querySelectorAll(".step"));
  var nums = Array.prototype.slice.call(track.querySelectorAll(".step__num"));
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Rail spans from the centre of the first badge to the centre of the last one */
  function layoutRail() {
    if (!rail || nums.length < 2) { return; }
    var trackTop = track.getBoundingClientRect().top;
    var firstRect = nums[0].getBoundingClientRect();
    var lastRect = nums[nums.length - 1].getBoundingClientRect();
    if (!firstRect.height || !lastRect.height) { return; }
    var start = firstRect.top - trackTop + firstRect.height / 2;
    var end = lastRect.top - trackTop + lastRect.height / 2;
    rail.style.top = start + "px";
    rail.style.bottom = "auto";
    rail.style.height = Math.max(0, end - start) + "px";
  }

  /* Re-measure whenever metrics can shift: fonts, images, resize */
  function watchLayout(cb) {
    window.addEventListener("resize", cb);
    window.addEventListener("load", cb);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(cb).catch(function () {});
    }
    window.setTimeout(cb, 300);
    window.setTimeout(cb, 1200);
  }

  if (reduced) {
    fill.style.height = "100%";
    steps.forEach(function (s) { s.classList.add("is-active"); });
    layoutRail();
    watchLayout(layoutRail);
    return;
  }

  document.documentElement.classList.add("js-steps");

  var ticking = false;

  function update() {
    ticking = false;
    layoutRail();

    var anchor = window.innerHeight * 0.55;
    var first = nums[0].getBoundingClientRect();
    var last = nums[nums.length - 1].getBoundingClientRect();
    var span = (last.top - first.top) || 1;
    var ratio = Math.max(0, Math.min(1, (anchor - first.top) / span));

    fill.style.height = (ratio * 100).toFixed(2) + "%";

    steps.forEach(function (step) {
      var r = step.getBoundingClientRect();
      step.classList.toggle("is-active", r.top <= anchor && r.bottom > 0);
    });
  }

  function onScroll() {
    if (ticking) { return; }
    ticking = true;
    window.requestAnimationFrame(update);
    /* rAF is throttled in hidden tabs — never let the flag latch */
    window.setTimeout(function () {
      if (ticking) { update(); }
    }, 250);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  watchLayout(onScroll);
  update();
})();
