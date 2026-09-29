// Trade Funding - shared site behaviour (vanilla JS, no framework/runtime dependency)

// Zoho lead-capture endpoint config (plan.md §4 / prompts.md Phase 6). The static marketing
// site and the Next/Payload app carrying /api/zoho-lead are separate deployments until
// Phase 10's conversion - apiBase defaults to same-origin ('') and only needs setting here,
// once, to the API app's real Vercel URL after Prompt 6.4 deploys it.
window.TF_ZOHO = window.TF_ZOHO || {};
window.TF_ZOHO.apiBase = window.TF_ZOHO.apiBase || 'https://tradefunding-zoho-api.vercel.app';
window.TF_ZOHO.leadUrl = function () {
  return window.TF_ZOHO.apiBase + '/api/zoho-lead';
};

// --- Pure product-calculator functions (no DOM refs) - ported from
// oldsite/commercial/product-page.js and extended for non-amortizing
// facility types (revolving, advance-against-receivable, factor-rate). ---
function calcMonthly(principal, annualRatePct, months, mode) {
  if (mode === 'FLAT') {
    var R = annualRatePct / 100, T = months / 12, N = months;
    var total = principal + principal * R * T;
    var monthly = N > 0 ? total / N : 0;
    return { monthly: monthly, total: total, interest: total - principal };
  }
  var r = annualRatePct / 100 / 12, n = months, M;
  if (r === 0) { M = n > 0 ? principal / n : 0; }
  else { M = principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1); }
  return { monthly: M, total: M * n, interest: M * n - principal };
}
function calcRevolving(drawnAmount, annualRatePct) {
  var monthly = drawnAmount * (annualRatePct / 100) / 12;
  return { monthly: monthly, annual: drawnAmount * (annualRatePct / 100) };
}
function calcAdvance(receivableAmount, advanceRatePct, feeRatePct, days) {
  var advance = receivableAmount * (advanceRatePct / 100);
  var fee = receivableAmount * (feeRatePct / 100) * (days / 30);
  var balance = receivableAmount - advance - fee;
  return { advance: advance, fee: fee, balance: balance };
}
function calcFactor(advanceAmount, factorRate, holdbackPct, avgDailySales) {
  var repayment = advanceAmount * factorRate;
  var cost = repayment - advanceAmount;
  var dailyRepayment = avgDailySales * (holdbackPct / 100);
  var estDays = dailyRepayment > 0 ? Math.ceil(repayment / dailyRepayment) : 0;
  return { repayment: repayment, cost: cost, dailyRepayment: dailyRepayment, estDays: estDays };
}

document.addEventListener('DOMContentLoaded', function () {

  // --- Product calculators: any [data-calc] container drives its inputs/
  // outputs declaratively. data-calc = amortizing | revolving | advance | factor.
  // Inputs are marked [data-calc-input="field"], outputs [data-calc-output="field"].
  (function () {
    function fmt(n) { return '$' + Math.round(n).toLocaleString('en-AU'); }
    function fmtInt(n) { return Math.round(n).toLocaleString('en-AU'); }
    function parseAmount(str) { return parseInt(String(str).replace(/[^0-9]/g, ''), 10) || 0; }

    document.querySelectorAll('[data-calc]').forEach(function (box) {
      var type = box.getAttribute('data-calc');
      var slider = box.querySelector('[data-calc-input="amount"]');
      var amountText = box.querySelector('[data-calc-input-text="amount"]');
      var termSelect = box.querySelector('[data-calc-input="months"]');
      var modeBtns = box.querySelectorAll('[data-calc-mode-btn]');
      var salesSlider = box.querySelector('[data-calc-input="dailySales"]');
      if (!slider) return;

      var mode = box.getAttribute('data-calc-mode') || 'APR';

      function amount() { return parseFloat(slider.value) || 0; }
      function months() { return termSelect ? parseInt(termSelect.value, 10) : (parseInt(box.getAttribute('data-calc-months'), 10) || 12); }
      function rate() { return parseFloat(box.getAttribute('data-calc-rate')) || 0; }

      function setOutput(field, text) {
        box.querySelectorAll('[data-calc-output="' + field + '"]').forEach(function (el) { el.textContent = text; });
      }

      function updateSliderBg(el) {
        var min = parseFloat(el.min) || 0, max = parseFloat(el.max) || 100, val = parseFloat(el.value) || 0;
        var pct = ((val - min) / (max - min)) * 100;
        el.style.background = 'linear-gradient(to right, var(--skyblue) ' + pct + '%, var(--border-neutral) ' + pct + '%)';
      }

      function update() {
        updateSliderBg(slider);
        if (salesSlider) updateSliderBg(salesSlider);

        if (type === 'amortizing') {
          var res = calcMonthly(amount(), rate(), months(), mode);
          setOutput('monthly', fmt(res.monthly) + '/mo');
          setOutput('total', fmt(res.total));
          setOutput('interest', fmt(res.interest));
        } else if (type === 'revolving') {
          var rv = calcRevolving(amount(), rate());
          setOutput('monthly', fmt(rv.monthly) + '/mo');
          setOutput('annual', fmt(rv.annual));
        } else if (type === 'advance') {
          var advanceRate = parseFloat(box.getAttribute('data-calc-advance-rate')) || 80;
          var feeRate = parseFloat(box.getAttribute('data-calc-fee-rate')) || 0;
          var days = parseFloat(box.getAttribute('data-calc-days')) || 30;
          var av = calcAdvance(amount(), advanceRate, feeRate, days);
          setOutput('advance', fmt(av.advance));
          setOutput('fee', fmt(av.fee));
          setOutput('balance', fmt(av.balance));
        } else if (type === 'factor') {
          var factorRate = parseFloat(box.getAttribute('data-calc-factor-rate')) || 1.15;
          var holdback = parseFloat(box.getAttribute('data-calc-holdback')) || 15;
          var dailySales = salesSlider ? (parseFloat(salesSlider.value) || 0) : (parseFloat(box.getAttribute('data-calc-daily-sales')) || 0);
          var fa = calcFactor(amount(), factorRate, holdback, dailySales);
          setOutput('repayment', fmt(fa.repayment));
          setOutput('cost', fmt(fa.cost));
          setOutput('dailyRepayment', fmt(fa.dailyRepayment));
          setOutput('estDays', fmtInt(fa.estDays) + ' days');
        }
        setOutput('amount', fmt(amount()));
        if (salesSlider) setOutput('dailySales', fmt(parseFloat(salesSlider.value) || 0));
      }

      slider.addEventListener('input', function () {
        if (amountText) amountText.value = fmtInt(amount());
        update();
      });
      if (amountText) {
        amountText.addEventListener('input', function () {
          var min = parseFloat(slider.min) || 0, max = parseFloat(slider.max) || 5000000;
          slider.value = Math.min(Math.max(parseAmount(amountText.value), min), max);
          update();
        });
        amountText.addEventListener('blur', function () {
          amountText.value = fmtInt(amount());
        });
      }
      if (termSelect) termSelect.addEventListener('change', update);
      if (salesSlider) salesSlider.addEventListener('input', update);
      modeBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          mode = btn.getAttribute('data-calc-mode-btn');
          modeBtns.forEach(function (b) { b.classList.remove('is-active'); });
          btn.classList.add('is-active');
          update();
        });
      });

      update();
    });
  }());

  // --- Generic accordion toggle: any [data-accordion-toggle] controls the
  // sibling [data-accordion-panel], flips aria-expanded and a chevron rotation.
  document.querySelectorAll('[data-accordion-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var panel = btn.closest('[data-accordion-item]').querySelector('[data-accordion-panel]');
      var chevron = btn.querySelector('[data-chevron]');
      var isOpen = btn.getAttribute('aria-expanded') === 'true';
      var group = btn.getAttribute('data-accordion-toggle'); // group name, e.g. "faq" or "steps"

      if (group) {
        // Close other items in the same group (single-open accordion)
        document.querySelectorAll('[data-accordion-toggle="' + group + '"]').forEach(function (other) {
          if (other !== btn) {
            other.setAttribute('aria-expanded', 'false');
            var op = other.closest('[data-accordion-item]').querySelector('[data-accordion-panel]');
            if (op) op.hidden = true;
            var oc = other.querySelector('[data-chevron]');
            if (oc) oc.style.transform = 'rotate(0deg)';
            other.closest('[data-accordion-item]').classList.remove('is-open');
          }
        });
      }

      btn.setAttribute('aria-expanded', String(!isOpen));
      if (panel) panel.hidden = isOpen;
      if (chevron) chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
      btn.closest('[data-accordion-item]').classList.toggle('is-open', !isOpen);
    });
  });

  // --- Pill selector groups (e.g. Personal & Property loan-type pills):
  // clicking a [data-pill-group] button marks it active within its group
  // and updates any [data-pill-output="GROUP"] targets from data-value.
  document.querySelectorAll('[data-pill-group]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var group = btn.getAttribute('data-pill-group');
      document.querySelectorAll('[data-pill-group="' + group + '"]').forEach(function (b) {
        b.classList.toggle('is-active', b === btn);
      });
      document.dispatchEvent(new CustomEvent('tf:pill-change', { detail: { group: group, value: btn.getAttribute('data-value') } }));
    });
  });

  // --- Sliders: any input[type=range][data-slider] updates a paired
  // [data-slider-output] element with a formatted currency value, and
  // optionally a derived value via a simple formula in data-derive.
  function formatCurrency(n) { return '$' + Math.round(Number(n)).toLocaleString('en-AU'); }

  document.querySelectorAll('input[type="range"][data-slider]').forEach(function (input) {
    var outputId = input.getAttribute('data-slider-output');
    var output = outputId ? document.getElementById(outputId) : null;
    var deriveId = input.getAttribute('data-derive-output');
    var deriveFormula = input.getAttribute('data-derive-formula'); // 'repayment' | 'power' | 'lease'
    var deriveEl = deriveId ? document.getElementById(deriveId) : null;

    function update() {
      if (output) output.textContent = formatCurrency(input.value);
      if (deriveEl && deriveFormula === 'repayment') {
        deriveEl.textContent = formatCurrency(input.value * 0.0193);
      }
      if (deriveEl && deriveFormula === 'power') {
        deriveEl.textContent = formatCurrency(input.value * 3);
      }
      if (deriveEl && deriveFormula === 'lease') {
        deriveEl.textContent = formatCurrency(input.value * 0.01846);
      }
    }
    input.addEventListener('input', update);
    update();
  });

  // --- Reveal on scroll ---
  var revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '-10% 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }

  // --- Home page: hero background video ---
  // The <video> has no autoplay attribute, so it only starts here. Its poster
  // is the video's own opening frame, so playback starts without a visible
  // swap. Visitors who prefer reduced motion get data-still (the settled end
  // state) as the poster instead, and can opt in with the toggle; so does any
  // browser that can't decode the file. The toggle is the WCAG 2.2.2 pause
  // control, shown only when the browser can decode the file so it never
  // offers a control that does nothing. Off-screen the video pauses to save
  // battery, and resumes on return unless the visitor paused it. Chrome
  // refuses to start muted video in a hidden tab, so a page opened in a
  // background tab starts it on visibilitychange instead.
  (function () {
    var video = document.querySelector('[data-hero-video]');
    var toggle = document.querySelector('[data-hero-video-toggle]');
    if (!video || !toggle) return;
    var userPaused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var canPlay = !!video.canPlayType('video/mp4; codecs="avc1.640028"');
    if ((userPaused || !canPlay) && video.dataset.still) video.poster = video.dataset.still;
    if (!canPlay) return;
    var inView = true;
    var setLabel = function () {
      toggle.textContent = video.paused ? 'Play video' : 'Pause video';
    };
    var play = function () {
      var p = video.play();
      // Rejected when autoplay is blocked (e.g. iOS Low Power Mode): the poster
      // stays and the toggle reads "Play video", which works from a tap.
      if (p && p.catch) p.catch(setLabel);
    };
    var sync = function () {
      if (!inView) video.pause();
      else if (!userPaused && !document.hidden && video.paused) play();
    };
    video.addEventListener('play', setLabel);
    video.addEventListener('pause', setLabel);
    toggle.addEventListener('click', function () {
      userPaused = !video.paused;
      if (userPaused) video.pause(); else play();
    });
    document.addEventListener('visibilitychange', sync);
    setLabel();
    toggle.hidden = false;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        sync();
      }).observe(video);
    } else {
      sync();
    }
  }());

  // --- Home page: channel-card hover detail reveal (Phase 9 Part 1) ---
  // focusin/focusout, not focus/blur: the card is a plain div, so it never
  // takes focus itself - what focuses is a link or button inside it, and
  // focus/blur do not bubble. Keyboard users get the same reveal as hover.
  // Touch devices are handled in CSS (@media (hover: none)), where the line
  // is shown outright rather than gated behind a hover that cannot happen.
  document.querySelectorAll('[data-hover-card]').forEach(function (card) {
    var detail = card.querySelector('[data-hover-detail]');
    if (!detail) return;
    var show = function () { detail.classList.add('is-visible'); };
    var hide = function () { detail.classList.remove('is-visible'); };
    card.addEventListener('mouseenter', show);
    card.addEventListener('mouseleave', hide);
    card.addEventListener('focusin', show);
    card.addEventListener('focusout', function (e) {
      if (!card.contains(e.relatedTarget)) hide();
    });
  });

  // --- Mobile nav (subpages): inject the hamburger button, wire it up,
  // and let a tap on "Products"/"Compare" expand their mega panel inline
  // (the panels only open on hover otherwise, which touch devices don't have). ---
  document.querySelectorAll('.tf-nav').forEach(function (navEl) {
    var inner = navEl.querySelector('.tf-nav-inner');
    var links = navEl.querySelector('.tf-nav-links');
    if (!inner || !links) return;

    // Full-bleed mega panels (.tf-mega-panel-wide) are position:fixed and need
    // the nav's real rendered height, which varies with content/breakpoint.
    var setNavHeight = function () {
      document.documentElement.style.setProperty('--nav-h', navEl.offsetHeight + 'px');
    };
    setNavHeight();
    window.addEventListener('resize', setNavHeight);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tf-nav-toggle-btn';
    btn.setAttribute('aria-label', 'Menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span class="tf-burger"></span>';
    inner.appendChild(btn);

    btn.addEventListener('click', function () {
      var isOpen = navEl.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(isOpen));
    });

    navEl.querySelectorAll('.tf-nav-item').forEach(function (item) {
      var trigger = item.querySelector('.tf-nav-link');
      var panel = item.querySelector('.tf-mega-panel, .tf-mega-panel-compare');
      if (!trigger || !panel) return;
      trigger.addEventListener('click', function (e) {
        if (window.innerWidth > 900) return;
        e.preventDefault();
        var wasOpen = item.classList.contains('is-open');
        navEl.querySelectorAll('.tf-nav-item.is-open').forEach(function (i) {
          if (i !== item) i.classList.remove('is-open');
        });
        item.classList.toggle('is-open', !wasOpen);
        trigger.setAttribute('aria-expanded', String(!wasOpen));
      });
      // The panel itself opens on CSS :hover/:focus-within regardless of this
      // JS - this only keeps aria-expanded in sync for screen readers, since
      // CSS has no way to reflect that state back onto the trigger's markup.
      item.addEventListener('mouseenter', function () { trigger.setAttribute('aria-expanded', 'true'); });
      item.addEventListener('mouseleave', function () {
        if (!item.classList.contains('is-open')) trigger.setAttribute('aria-expanded', 'false');
      });
      item.addEventListener('focusin', function () { trigger.setAttribute('aria-expanded', 'true'); });
      item.addEventListener('focusout', function (e) {
        if (!item.contains(e.relatedTarget) && !item.classList.contains('is-open')) {
          trigger.setAttribute('aria-expanded', 'false');
        }
      });
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 900 && navEl.classList.contains('is-open')) {
        navEl.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  });

  // --- Personal & Property: sample-rate table swaps with loan-type pill ---
  var sampleData = {
    home: [
      { lender: 'Lender A', product: 'Full-doc • 80% LVR', rate: '6.49%' },
      { lender: 'Lender B', product: 'Alt-doc • 75% LVR', rate: '6.79%' },
      { lender: 'Lender C', product: 'Low-doc • 80% LVR', rate: '7.05%' }
    ],
    investment: [
      { lender: 'Lender A', product: 'Full-doc • 75% LVR', rate: '6.75%' },
      { lender: 'Lender B', product: 'Alt-doc • 70% LVR', rate: '7.10%' },
      { lender: 'Lender C', product: 'Low-doc • 75% LVR', rate: '7.35%' }
    ],
    commercial: [
      { lender: 'Lender A', product: 'Full-doc • 70% LVR', rate: '7.20%' },
      { lender: 'Lender B', product: 'Alt-doc • 65% LVR', rate: '7.55%' },
      { lender: 'Lender C', product: 'Low-doc • 70% LVR', rate: '7.90%' }
    ],
    construction: [
      { lender: 'Lender A', product: 'Progress draws • 80% LVR', rate: '7.05%' },
      { lender: 'Lender B', product: 'Progress draws • 75% LVR', rate: '7.40%' },
      { lender: 'Lender C', product: 'Progress draws • 70% LVR', rate: '7.75%' }
    ]
  };
  var loanTypeLabels = { home: 'home loan', investment: 'investment loan', commercial: 'commercial property loan', construction: 'construction loan' };

  document.addEventListener('tf:pill-change', function (e) {
    if (e.detail.group !== 'loan-type') return;
    var rows = sampleData[e.detail.value] || sampleData.home;
    var tbody = document.getElementById('pp-sample-rows');
    var label = document.getElementById('pp-loan-type-label');
    if (label) label.textContent = loanTypeLabels[e.detail.value] || 'home loan';
    if (tbody) {
      tbody.innerHTML = rows.map(function (r) {
        return '<div class="pp-sample-row">' +
          '<span class="pp-sample-lender">' + r.lender + '</span>' +
          '<span class="pp-sample-product">' + r.product + '</span>' +
          '<span class="pp-sample-rate">' + r.rate + '</span>' +
          '</div>';
      }).join('');
    }
  });

  // --- Connect: booking widget "This week" day selector (cosmetic only) ---
  document.querySelectorAll('[data-day-pill]').forEach(function (day) {
    day.addEventListener('click', function () {
      document.querySelectorAll('[data-day-pill]').forEach(function (d) { d.classList.remove('is-active'); });
      day.classList.add('is-active');
    });
  });

  // --- Phase 7 Part L: sitewide sticky mobile CTA bar, one thumb-reach
  // away regardless of scroll position. Injected once via JS rather than
  // duplicated into every page's markup; visibility/space-reservation is
  // handled by CSS (components.css) so there's no layout shift either way.
  (function () {
    if (document.querySelector('.tf-sticky-cta')) return;
    var bar = document.createElement('div');
    bar.className = 'tf-sticky-cta';
    // Guide section 7: each channel's own primary CTA.
    var path = location.pathname;
    var cta = path.indexOf('/tf-test-site-0929/personal-and-property/') !== -1
      ? '<a href="/tf-test-site-0929/home-shared/contact/index.html#book-a-chat" class="btn btn-primary">Book a 15-minute chat</a>'
      : path.indexOf('/tf-test-site-0929/connect/') !== -1
        ? '<a href="/tf-test-site-0929/connect/become-a-partner/index.html" class="btn btn-primary">Become a Partner</a>'
        : '<a href="/tf-test-site-0929/commercial/compare-report/index.html" class="btn btn-primary">Get my Compare Report</a>';
    bar.innerHTML = cta;
    document.body.appendChild(bar);
    // Phase 9 Part 1: the header CTA is only hidden on narrow screens once
    // this bar actually exists, so a JS-off visitor keeps a CTA in the
    // header rather than losing both.
    document.body.classList.add('tf-has-sticky-cta');
  }());

  // --- Phase 7 Part H: "Not sure yet?" router. One question prepended ahead
  // of each channel's own entry point (the Get Funded mega-menu's 4th tile,
  // and the homepage hero CTA both open this) - not a new wizard, a detour
  // into the existing per-channel Compare Report / Connect / P&P front doors.
  //
  // Built as a factory rather than a single hard-coded dialog because a
  // second prompt (.tf-intent-open, the new-vs-review question behind the
  // "Fund my business" card) briefly used it too. That card went back to
  // two explicit buttons on request, so only one dialog is wired up now -
  // see 9477c6f if the prompt is ever reinstated.
  (function () {
    function buildRouter(config) {
      var triggers = document.querySelectorAll(config.trigger);
      if (!triggers.length) return;

      var optionsHtml = config.options.map(function (opt) {
        return '<button type="button" class="tf-router-option" data-router-target="' + opt.key + '">' +
          '<span class="tf-router-option-label">' + opt.label +
            '<span class="tf-mega-arrow" aria-hidden="true">→</span></span>' +
          '<span class="tf-router-option-sub">' + opt.sub + '</span>' +
        '</button>';
      }).join('');

      var overlay = document.createElement('div');
      overlay.className = 'tf-router-overlay';
      overlay.innerHTML =
        '<div class="tf-router-modal" role="dialog" aria-modal="true" aria-labelledby="' + config.titleId + '">' +
          '<button type="button" class="tf-router-close" aria-label="Close">&times;</button>' +
          '<span class="eyebrow">' + config.eyebrow + '</span>' +
          '<h2 id="' + config.titleId + '" class="tf-router-title">' + config.title + '</h2>' +
          '<p class="tf-router-sub">' + config.sub + '</p>' +
          '<div class="tf-router-options">' + optionsHtml + '</div>' +
        '</div>';
      document.body.appendChild(overlay);

      var modal = overlay.querySelector('.tf-router-modal');
      var lastTrigger = null;

      function focusableEls() {
        return Array.prototype.slice.call(
          modal.querySelectorAll('button, a[href]')
        ).filter(function (el) { return !el.disabled; });
      }

      function openRouter(e) {
        // Triggers may be real links (so the card still works with JS off) -
        // intercept rather than follow, then ask the question.
        if (e && e.preventDefault) e.preventDefault();
        lastTrigger = e && e.currentTarget;
        overlay.classList.add('is-open');
        document.body.classList.add('tf-no-scroll');
        var first = focusableEls()[0];
        if (first) first.focus();
      }
      function closeRouter() {
        overlay.classList.remove('is-open');
        document.body.classList.remove('tf-no-scroll');
        if (lastTrigger) lastTrigger.focus();
      }

      triggers.forEach(function (t) { t.addEventListener('click', openRouter); });
      overlay.querySelector('.tf-router-close').addEventListener('click', closeRouter);
      overlay.addEventListener('click', function (e) { if (e.target === overlay) closeRouter(); });
      document.addEventListener('keydown', function (e) {
        if (!overlay.classList.contains('is-open')) return;
        if (e.key === 'Escape') { closeRouter(); return; }
        // Basic focus trap: keep Tab/Shift+Tab cycling within the dialog
        // while it's open, per WAI-ARIA modal dialog conventions.
        if (e.key === 'Tab') {
          var els = focusableEls();
          if (!els.length) return;
          var firstEl = els[0], lastEl = els[els.length - 1];
          if (e.shiftKey && document.activeElement === firstEl) {
            e.preventDefault(); lastEl.focus();
          } else if (!e.shiftKey && document.activeElement === lastEl) {
            e.preventDefault(); firstEl.focus();
          }
        }
      });
      overlay.querySelectorAll('[data-router-target]').forEach(function (opt) {
        opt.addEventListener('click', function () {
          window.location.href = config.routes[opt.getAttribute('data-router-target')];
        });
      });
    }

    buildRouter({
      trigger: '.tf-router-open',
      titleId: 'tf-router-title',
      eyebrow: 'Quick question',
      title: 'What are you funding?',
      sub: 'Tell Cashper who this is for and we’ll take you straight to the right comparison.',
      options: [
        { key: 'business', label: 'Your business', sub: 'Working capital, equipment, trade and more.' },
        { key: 'customers', label: 'Your customers', sub: 'Offer financing at your point of sale, get paid upfront.' },
        { key: 'yourself', label: 'Yourself', sub: 'Home loans, investment property and personal lending.' }
      ],
      routes: {
        business: '/tf-test-site-0929/commercial/compare-report/index.html',
        customers: '/tf-test-site-0929/connect/index.html',
        yourself: '/tf-test-site-0929/personal-and-property/index.html'
      }
    });

  }());

});
