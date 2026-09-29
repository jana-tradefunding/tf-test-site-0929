/**
 * Shared ABN lookup - ABR (Australian Business Register) JSONP API.
 *
 * The transport and endpoints here are lifted from the working implementation inside
 * home-shared/apply/index.html, per buildspec §11 ("adapt the working mechanism, don't
 * rebuild it"). What is NOT lifted is Apply's DOM coupling: that copy reads and writes
 * hard-coded element IDs (#abnSearch, #abnStatus, autofill blocks) and Apply's own wizard
 * state, so it can't be dropped onto another page. This exposes the same mechanism behind a
 * small API any form can bind to.
 *
 * Apply still carries its own copy. Consolidating the two means refactoring a working
 * multi-step wizard, which is a bigger and riskier change than it looks - left for a
 * deliberate pass rather than folded into the Connect form build (Prompt 6.15).
 *
 * ABR requires JSONP: it sends no CORS headers, so fetch() is not an option.
 */
(function (window, document) {
  'use strict';

  var ABR_GUID = '34f1d0c4-e8a4-4c8e-a347-069ef4df4c2b';
  var ABR_BASE = 'https://abr.business.gov.au/json/';

  /** Resolves with the parsed payload, or null on error/timeout. Never rejects. */
  function jsonp(url) {
    return new Promise(function (resolve) {
      var cbName = 'tfAbnCb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      var script = document.createElement('script');
      var done = false;
      var cleanup = function () {
        if (done) return;
        done = true;
        try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
        if (script.parentNode) script.remove();
      };
      window[cbName] = function (data) { cleanup(); resolve(data); };
      script.src = url + '&callback=' + cbName;
      script.onerror = function () { cleanup(); resolve(null); };
      document.head.appendChild(script);
      // ABR occasionally just never calls back; don't leave the caller hanging.
      setTimeout(function () { cleanup(); resolve(null); }, 8000);
    });
  }

  /** Business-name search. Resolves to an array of {name, abn, state, postcode}. */
  function searchNames(query, maxResults) {
    var url = ABR_BASE + 'MatchingNames.aspx?name=' + encodeURIComponent(query) +
      '&maxResults=' + (maxResults || 5) + '&guid=' + ABR_GUID;
    return jsonp(url).then(function (data) {
      var names = (data && data.Names) || [];
      return names.map(function (n) {
        return { name: n.Name || '', abn: n.Abn || '', state: n.State || '', postcode: n.Postcode || '' };
      }).filter(function (n) { return n.abn; });
    });
  }

  /** Full detail for one ABN. Resolves to a normalised object, or null. */
  function details(abn) {
    var url = ABR_BASE + 'AbnDetails.aspx?abn=' + encodeURIComponent(String(abn).replace(/\s/g, '')) +
      '&guid=' + ABR_GUID;
    return jsonp(url).then(function (data) {
      if (!data || !data.Abn) return null;
      return {
        abn: data.Abn,
        name: data.EntityName || data.BusinessName?.[0] || '',
        status: data.AbnStatus || '',
        type: data.EntityTypeName || '',
        state: data.AddressState || '',
        postcode: data.AddressPostcode || '',
        gstFrom: data.Gst || '',
        activeFrom: data.AbnStatusEffectiveFrom || '',
      };
    });
  }

  /**
   * Binds a text input to the lookup: debounced name/ABN search, a results list the user
   * picks from, and a hidden field that receives the confirmed ABN.
   *
   * Deliberately tolerant - a lookup failure never blocks submission. The visible input
   * stays free-text and whatever the user typed is submitted as the trading name, so ABR
   * being slow or down degrades to a plain form rather than a dead end.
   */
  function attach(opts) {
    var input = opts.input;
    var abnField = opts.abnField || null;      // hidden input receiving the chosen ABN
    var nameField = opts.nameField || null;    // optional input receiving the entity name
    var statusEl = opts.statusEl || null;
    var timer = null;

    if (!input) return;

    function say(msg) { if (statusEl) statusEl.textContent = msg || ''; }
    function clearList() {
      var list = opts.resultsEl;
      if (list) { list.innerHTML = ''; list.hidden = true; }
    }

    function choose(hit) {
      if (abnField) abnField.value = hit.abn;
      if (nameField && hit.name) nameField.value = hit.name;
      input.value = hit.name || input.value;
      clearList();
      say('ABN ' + hit.abn + ' selected.');
    }

    function render(hits) {
      var list = opts.resultsEl;
      if (!list) return;
      list.innerHTML = '';
      if (!hits.length) { list.hidden = true; return; }
      hits.forEach(function (hit) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tf-abn-hit';
        btn.textContent = hit.name + (hit.state ? ' - ' + hit.state : '') + ' · ' + hit.abn;
        btn.addEventListener('click', function () { choose(hit); });
        list.appendChild(btn);
      });
      list.hidden = false;
    }

    input.addEventListener('input', function () {
      clearTimeout(timer);
      var q = input.value.trim();
      if (abnField) abnField.value = '';          // typing invalidates a previous pick
      clearList();
      if (q.length < 3) { say(''); return; }
      say('Searching…');
      timer = setTimeout(function () {
        var digits = q.replace(/\s/g, '');
        var isAbn = /^\d{11}$/.test(digits);
        var work = isAbn
          ? details(digits).then(function (d) { return d ? [{ name: d.name, abn: d.abn, state: d.state }] : []; })
          : searchNames(q);
        work.then(function (hits) {
          if (!hits.length) { say('No match found - you can just type your business name.'); return; }
          if (isAbn && hits.length === 1) { choose(hits[0]); return; }
          say(hits.length + ' match' + (hits.length === 1 ? '' : 'es') + ' - pick yours:');
          render(hits);
        });
      }, 350);
    });
  }

  window.TFAbn = { jsonp: jsonp, searchNames: searchNames, details: details, attach: attach };
})(window, document);
