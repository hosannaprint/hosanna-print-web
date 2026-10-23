/* =====================================================================
   Hosanna print – main.js
   Navigácia, video v hero, animácie pri scrollovaní, karusel logov
   a kontaktný formulár (validácia + odoslanie + potvrdenie).
   3D tlačiareň je v samostatnom súbore printer3d.js.
   ===================================================================== */
(function () {
  'use strict';

  var CONFIG = {
    /* Kam sa dopyt odosiela: berie sa z atribútu action formulára (send.php).
       Ak server nie je dostupný (napr. statický hosting bez PHP alebo otvorenie súboru z disku),
       formulár ponúkne náhradné odoslanie cez e-mailového klienta na adresu nižšie. */
    requestTimeout: 15000,
    messageMax: 2000,
    minFillTime: 2500 // ms – rýchlejšie odoslanie je takmer isto robot
  };

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  document.addEventListener('DOMContentLoaded', function () {
    initHeroVideo();
    initNav();
    initReveal();
    initSteps();
    initCarousel();
    initForm();
    var year = $('[data-year]');
    if (year) year.textContent = String(new Date().getFullYear());
  });

  /* -------------------------------------------------------------------
     Video v hero
     Video sa načíta len vtedy, keď to zariadenie zvládne. Pri šetrení dát, pomalom
     pripojení, málo pamäte alebo zapnutom „obmedziť pohyb" ostáva záložný obrázok (poster).
     Na menších obrazovkách sa použije ľahšia 720p verzia.
     ------------------------------------------------------------------- */
  function initHeroVideo() {
    var video = $('.hero-video');
    if (!video) return;

    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    var slowNet = !!conn && (conn.saveData === true || /(^|-)(2g|3g)$/.test(conn.effectiveType || ''));
    var lowMemory = typeof navigator.deviceMemory === 'number' && navigator.deviceMemory < 4;

    if (reduceMotion.matches || slowNet || lowMemory) {
      video.removeAttribute('autoplay');
      return; // ostáva poster
    }

    var small = window.matchMedia('(max-width: 900px)').matches;
    $$('source', video).forEach(function (src) {
      src.src = (small && src.getAttribute('data-src-small')) || src.getAttribute('data-src');
    });
    video.load();

    var play = function () {
      var p = video.play();
      if (p && typeof p.catch === 'function') p.catch(function () { /* autoplay zablokovaný → ostáva poster */ });
    };
    play();

    // Keď sa hero prelne do svetlého štúdia (alebo je mimo obrazovky), video pozastavíme – šetrí batériu.
    var exp = $('#uvod');
    var sync = function () {
      var r = exp.getBoundingClientRect();
      var shouldPlay = exp.getAttribute('data-tone') !== 'light' && r.bottom > 0 && !document.hidden;
      if (shouldPlay && video.paused) play();
      else if (!shouldPlay && !video.paused) video.pause();
    };
    if (exp) {
      new MutationObserver(sync).observe(exp, { attributes: true, attributeFilter: ['data-tone'] });
      window.addEventListener('scroll', sync, { passive: true });
      document.addEventListener('visibilitychange', sync);
    }
  }

  /* -------------------------------------------------------------------
     Navigácia: mobilné menu, farebná téma podľa pozadia, aktívny odkaz
     ------------------------------------------------------------------- */
  function initNav() {
    var nav = $('[data-nav]');
    if (!nav) return;
    var toggle = $('[data-nav-toggle]', nav);
    var links = $$('[data-nav-link]', nav);
    var exp = $('#uvod');

    var setOpen = function (open) {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Zavrieť menu' : 'Otvoriť menu');
    };
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(!nav.classList.contains('is-open'));
    });
    links.forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });
    document.addEventListener('click', function (e) { if (!nav.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false); toggle.focus(); }
    });

    // Téma: biela navigácia nad videom, svetlá (sklenená) všade inde
    var updateTheme = function () {
      var overVideo = exp && exp.getAttribute('data-tone') !== 'light' && exp.getBoundingClientRect().bottom > 80;
      var theme = overVideo ? 'dark' : 'light';
      if (nav.getAttribute('data-theme') !== theme) nav.setAttribute('data-theme', theme);
    };
    updateTheme();
    window.addEventListener('scroll', updateTheme, { passive: true });
    if (exp) new MutationObserver(updateTheme).observe(exp, { attributes: true, attributeFilter: ['data-tone'] });

    // Aktívny odkaz podľa sekcie v strede obrazovky
    if (!('IntersectionObserver' in window)) return;
    var map = {};
    links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var link = map[entry.target.id];
        if (!link) return;
        if (entry.isIntersecting) {
          links.forEach(function (l) { l.classList.remove('is-active'); l.removeAttribute('aria-current'); });
          link.classList.add('is-active');
          link.setAttribute('aria-current', 'location');
        } else {
          link.classList.remove('is-active');
          link.removeAttribute('aria-current');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(map).forEach(function (id) {
      var sec = document.getElementById(id);
      if (sec) io.observe(sec);
    });
  }

  /* -------------------------------------------------------------------
     Jemné objavovanie obsahu pri scrollovaní (so stupňovaným oneskorením)
     ------------------------------------------------------------------- */
  function initReveal() {
    var els = $$('[data-reveal]');
    if (!('IntersectionObserver' in window) || reduceMotion.matches) {
      els.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    els.forEach(function (el) {
      var siblings = Array.prototype.filter.call(el.parentElement.children, function (c) { return c.hasAttribute('data-reveal'); });
      var i = siblings.indexOf(el);
      if (i > 0) el.style.setProperty('--reveal-delay', (Math.min(i, 6) * 0.08).toFixed(2) + 's');
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    els.forEach(function (el) { io.observe(el); });
  }

  // Spojovacia čiara v sekcii „Postup" sa vykreslí, keď sa kroky objavia
  function initSteps() {
    var steps = $('[data-steps]');
    if (!steps) return;
    if (!('IntersectionObserver' in window)) { steps.classList.add('is-in'); return; }
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { steps.classList.add('is-in'); io.disconnect(); }
    }, { threshold: 0.35 });
    io.observe(steps);
  }

  /* -------------------------------------------------------------------
     Karusel logov klientov
     - nekonečný plynulý posun (kópie položiek sa pridajú automaticky),
     - pauza pri prejdení myšou / fokuse, tlačidlo pauza/play,
     - šípky (aj klávesnica ← →) a ťahanie myšou či prstom,
     - pri „obmedziť pohyb" je automatický posun predvolene vypnutý.
     ------------------------------------------------------------------- */
  function initCarousel() {
    var root = $('[data-carousel]');
    if (!root) return;
    var viewport = $('.carousel__viewport', root);
    var track = $('[data-carousel-track]', root);
    var btnPrev = $('[data-carousel-prev]', root);
    var btnNext = $('[data-carousel-next]', root);
    var btnToggle = $('[data-carousel-toggle]', root);
    var originals = Array.prototype.slice.call(track.children);
    if (!originals.length) return;

    var SPEED = 36; // px za sekundu
    var offset = 0;
    var setWidth = 0;
    var paused = reduceMotion.matches;
    var hovering = false;
    var dragging = false;
    var visible = false;
    var tween = null;
    var raf = 0;
    var last = 0;

    function cloneSet() {
      originals.forEach(function (li) {
        var c = li.cloneNode(true);
        c.setAttribute('aria-hidden', 'true');
        $$('a, button', c).forEach(function (x) { x.tabIndex = -1; });
        track.appendChild(c);
      });
    }
    cloneSet();

    function measure() {
      setWidth = track.children[originals.length].offsetLeft - track.children[0].offsetLeft;
      // dosť kópií na to, aby sa pri posune nikdy neukázala medzera
      var guard = 0;
      while (track.scrollWidth < setWidth + viewport.clientWidth * 1.5 && guard++ < 6) cloneSet();
    }
    function stepSize() {
      var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return originals[0].getBoundingClientRect().width + gap;
    }
    function render() {
      if (!setWidth) return;
      var x = ((offset % setWidth) + setWidth) % setWidth;
      track.style.transform = 'translate3d(' + (-x).toFixed(2) + 'px,0,0)';
    }
    function tick(now) {
      raf = 0;
      var dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      if (tween) {
        var t = Math.min(1, (now - tween.start) / tween.dur);
        var e = 1 - Math.pow(1 - t, 3);
        offset = tween.from + (tween.to - tween.from) * e;
        if (t >= 1) tween = null;
      } else if (!paused && !hovering && !dragging) {
        offset += SPEED * dt;
      }
      render();
      if (visible) raf = requestAnimationFrame(tick);
    }
    function start() { if (!raf && visible) { last = 0; raf = requestAnimationFrame(tick); } }
    function nudge(dir) {
      tween = { from: offset, to: offset + dir * stepSize(), start: performance.now(), dur: 700 };
      start();
    }

    btnPrev.addEventListener('click', function () { nudge(-1); });
    btnNext.addEventListener('click', function () { nudge(1); });
    btnToggle.addEventListener('click', function () {
      paused = !paused;
      btnToggle.setAttribute('aria-pressed', String(paused));
      btnToggle.setAttribute('aria-label', paused ? 'Spustiť posúvanie' : 'Pozastaviť posúvanie');
    });
    if (paused) {
      btnToggle.setAttribute('aria-pressed', 'true');
      btnToggle.setAttribute('aria-label', 'Spustiť posúvanie');
    }

    viewport.tabIndex = 0;
    viewport.setAttribute('aria-label', 'Logá klientov – posúvajte šípkami');
    viewport.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); nudge(1); }
    });
    viewport.addEventListener('mouseenter', function () { hovering = true; });
    viewport.addEventListener('mouseleave', function () { hovering = false; });
    root.addEventListener('focusin', function () { hovering = true; });
    root.addEventListener('focusout', function () { hovering = false; });

    // Ťahanie
    var startX = 0;
    var startOffset = 0;
    var startY = 0;
    var pointerId = null;
    viewport.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      startOffset = offset;
      tween = null;
    });
    viewport.addEventListener('pointermove', function (e) {
      if (pointerId !== e.pointerId) return;
      var dx = e.clientX - startX;
      if (!dragging) {
        // pri dotyku začneme ťahať až pri zjavne vodorovnom pohybe, inak necháme stránku scrollovať
        if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(e.clientY - startY)) return;
        dragging = true;
        viewport.classList.add('is-dragging');
        try { viewport.setPointerCapture(e.pointerId); } catch (err) { /* nič */ }
      }
      offset = startOffset - dx;
      render();
    });
    var endDrag = function (e) {
      if (pointerId !== e.pointerId) return;
      pointerId = null;
      if (!dragging) return;
      dragging = false;
      viewport.classList.remove('is-dragging');
    };
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);
    viewport.addEventListener('dragstart', function (e) { e.preventDefault(); });

    window.addEventListener('resize', function () { measure(); render(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); render(); });
    measure();
    render();

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) start();
      }).observe(root);
    } else {
      visible = true;
      start();
    }
  }

  /* -------------------------------------------------------------------
     Kontaktný formulár – dopyt
     1. Validácia na strane prehliadača (rovnaké pravidlá kontroluje aj send.php).
        Chyby sa ukazujú po opustení poľa a pri odoslaní; pole s chybou dostane
        aria-invalid a text chyby je prepojený cez aria-describedby.
     2. Antispam: skryté pole (honeypot) + minimálny čas vyplnenia.
     3. Odoslanie cez fetch na send.php (bez obnovenia stránky) s časovým limitom.
     4. Po úspechu sa zobrazí potvrdenie. Ak server nie je dostupný, používateľ
        nepríde o text – ponúkneme odoslanie cez e-mailového klienta.
     ------------------------------------------------------------------- */
  function initForm() {
    var form = $('[data-inquiry]');
    if (!form) return;
    var card = form.closest('.form-card');
    var success = $('[data-success]', card);
    var successText = $('[data-success-text]', card);
    var successActions = $('[data-success-actions]', card);
    var resetBtn = $('[data-reset]', card);
    var alertBox = $('[data-form-alert]', form);
    var submitBtn = $('[data-submit]', form);
    var counter = $('[data-count]', form);
    var emailLink = $('[data-contact-email]');
    var studioEmail = emailLink ? emailLink.textContent.trim() : '';
    var startedAt = Date.now();

    var NAME_RE = /^[\p{L}][\p{L}\s.'’-]*$/u;
    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    var PHONE_RE = /^\+?\d{9,15}$/;

    var rules = {
      name: function (v) {
        v = v.trim();
        if (!v) return 'Zadajte, prosím, vaše meno.';
        if (v.length < 2) return 'Meno je príliš krátke.';
        if (v.length > 80) return 'Meno môže mať najviac 80 znakov.';
        if (!NAME_RE.test(v)) return 'Meno môže obsahovať len písmená, medzery a pomlčky.';
        return '';
      },
      email: function (v) {
        v = v.trim();
        if (!v) return 'Zadajte, prosím, váš e-mail.';
        if (v.length > 120 || !EMAIL_RE.test(v)) return 'Skontrolujte formát e-mailu (napr. jana@email.sk).';
        return '';
      },
      phone: function (v) {
        v = v.trim();
        if (!v) return ''; // nepovinné
        if (!PHONE_RE.test(v.replace(/[\s\-().\/]/g, ''))) return 'Zadajte telefón v tvare +421 900 123 456.';
        return '';
      },
      message: function (v) {
        v = v.trim();
        if (!v) return 'Napíšte nám, prosím, čo potrebujete.';
        if (v.length < 10) return 'Dopyt je príliš krátky – pridajte aspoň pár slov (min. 10 znakov).';
        if (v.length > CONFIG.messageMax) return 'Dopyt môže mať najviac ' + CONFIG.messageMax + ' znakov.';
        return '';
      },
      consent: function (v, el) {
        return el.checked ? '' : 'Bez vášho súhlasu nemôžeme dopyt spracovať.';
      }
    };
    var fields = Object.keys(rules).map(function (name) { return form.elements[name]; });

    function setError(el, msg) {
      var wrap = el.closest('.field');
      var err = $('[data-error-for="' + el.name + '"]', form);
      wrap.classList.toggle('is-invalid', !!msg);
      wrap.classList.toggle('is-valid', !msg && el.type !== 'checkbox' && el.value.trim() !== '');
      el.setAttribute('aria-invalid', msg ? 'true' : 'false');
      err.textContent = '';
      if (msg) {
        err.insertAdjacentHTML('afterbegin', '<svg class="icon" aria-hidden="true"><use href="#i-alert"/></svg>');
        err.appendChild(document.createTextNode(msg));
      }
    }
    function validateField(el) {
      var msg = rules[el.name](el.value, el);
      setError(el, msg);
      return !msg;
    }

    // Živá validácia: po prvom opustení poľa kontrolujeme pri každej zmene
    fields.forEach(function (el) {
      var isCheck = el.type === 'checkbox';
      el.addEventListener('blur', function () {
        if (isCheck) return;
        if (el.value.trim() !== '' || el.dataset.touched) { el.dataset.touched = '1'; validateField(el); }
      });
      el.addEventListener(isCheck ? 'change' : 'input', function () {
        if (el.dataset.touched || isCheck) validateField(el);
      });
    });

    var msgEl = form.elements.message;
    function updateCount() {
      var n = msgEl.value.length;
      counter.textContent = n + ' / ' + CONFIG.messageMax;
      counter.classList.toggle('is-near', n > CONFIG.messageMax * 0.9);
    }
    msgEl.addEventListener('input', updateCount);
    updateCount();

    function showAlert(html, kind) {
      alertBox.className = 'form-alert' + (kind ? ' form-alert--' + kind : '');
      alertBox.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-alert"/></svg><div>' + html + '</div>';
      alertBox.hidden = false;
    }
    function hideAlert() { alertBox.hidden = true; alertBox.innerHTML = ''; }
    function setLoading(on) {
      submitBtn.classList.toggle('is-loading', on);
      submitBtn.disabled = on;
      submitBtn.setAttribute('aria-busy', String(on));
      $('.btn__label', submitBtn).textContent = on ? 'Odosielam…' : 'Odoslať dopyt';
    }
    function collect() {
      return {
        name: form.elements.name.value.trim(),
        email: form.elements.email.value.trim(),
        phone: form.elements.phone.value.trim(),
        message: form.elements.message.value.trim()
      };
    }
    function mailtoHref(d) {
      var body = 'Meno: ' + d.name + '\nE-mail: ' + d.email + (d.phone ? '\nTelefón: ' + d.phone : '') + '\n\n' + d.message;
      return 'mailto:' + studioEmail + '?subject=' + encodeURIComponent('Dopyt z webu – ' + d.name) + '&body=' + encodeURIComponent(body);
    }
    function escapeHtml(s) {
      return s.replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
    }

    function showSuccess(d) {
      var first = d.name.split(/\s+/)[0] || '';
      successText.textContent = (first ? first + ', o' : 'O') + 'zveme sa vám na ' + d.email + ' spravidla do 24 hodín s návrhom riešenia a cenovou ponukou.';
      successActions.innerHTML = '';
      form.hidden = true;
      success.hidden = false;
      success.focus({ preventScroll: true });
      card.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'center' });
    }

    function sendInquiry() {
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, CONFIG.requestTimeout);
      return fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { 'Accept': 'application/json', 'X-Requested-With': 'fetch' },
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (res) {
        return res.json().catch(function () { return null; }).then(function (json) {
          if (res.ok && json && json.ok) return json;
          var err = new Error((json && json.message) || 'Server error');
          err.type = res.status === 422 && json && json.errors ? 'validation' : 'server';
          err.errors = json && json.errors;
          throw err;
        });
      }).finally(function () { clearTimeout(timer); });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      hideAlert();

      var firstInvalid = null;
      fields.forEach(function (el) {
        el.dataset.touched = '1';
        if (!validateField(el) && !firstInvalid) firstInvalid = el;
      });
      if (firstInvalid) {
        showAlert('Formulár obsahuje chyby. Skontrolujte, prosím, označené polia.');
        firstInvalid.focus();
        return;
      }

      var data = collect();

      // Robot vyplnil skryté pole alebo formulár odoslal nereálne rýchlo → tváríme sa, že je všetko v poriadku
      if (form.elements.website.value || Date.now() - startedAt < CONFIG.minFillTime) {
        showSuccess(data);
        return;
      }

      setLoading(true);
      sendInquiry()
        .then(function () { showSuccess(data); })
        .catch(function (err) {
          if (err.type === 'validation' && err.errors) {
            Object.keys(err.errors).forEach(function (name) {
              if (form.elements[name]) setError(form.elements[name], err.errors[name]);
            });
            showAlert('Niektoré údaje neprešli kontrolou. Opravte, prosím, označené polia.');
            return;
          }
          // Server nedostupný: ponúkneme náhradné odoslanie e-mailom, vyplnené údaje ostávajú vo formulári
          showAlert(
            'Dopyt sa nepodarilo odoslať automaticky. Skúste to, prosím, znova o chvíľu alebo ho ' +
            '<a href="' + escapeHtml(mailtoHref(data)) + '">odošlite e-mailom</a>' +
            (studioEmail ? ' na <strong>' + escapeHtml(studioEmail) + '</strong>' : '') + '.',
            'info'
          );
          alertBox.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'center' });
        })
        .finally(function () { setLoading(false); });
    });

    resetBtn.addEventListener('click', function () {
      form.reset();
      fields.forEach(function (el) {
        delete el.dataset.touched;
        var wrap = el.closest('.field');
        wrap.classList.remove('is-invalid', 'is-valid');
        el.removeAttribute('aria-invalid');
        $('[data-error-for="' + el.name + '"]', form).textContent = '';
      });
      updateCount();
      hideAlert();
      startedAt = Date.now();
      success.hidden = true;
      form.hidden = false;
      form.elements.name.focus();
    });
  }
})();
