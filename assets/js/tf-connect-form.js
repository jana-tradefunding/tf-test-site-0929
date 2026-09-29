/**
 * Connect partner-signup form (Prompt 6.15).
 *
 * Posts source:"connect", which the endpoint routes to Zoho's Partners module
 * (CustomModule7) rather than Leads - see app/api/zoho-lead/partners.ts. Field names here are
 * Partners-native (Trading_Name / Phone / Description), so the server's Leads-to-Partners
 * translation passes them through untouched.
 *
 * Lives in one file used by both host pages (connect/index.html and connect/for-vendors/),
 * per Matt's "both please" - the markup is duplicated because these are static pages with no
 * templating, but the behaviour is not.
 */
(function () {
  'use strict';

  function init(form) {
    var statusEl = form.querySelector('[data-connect-status]');
    var submitBtn = form.querySelector('[data-connect-submit]');
    var originalLabel = submitBtn ? submitBtn.textContent : 'Become a partner';

    // ABN lookup on the trading-name field. Optional by design: if tf-abn-lookup.js failed to
    // load, or ABR is down, the field stays plain free text and the form still submits.
    if (window.TFAbn) {
      window.TFAbn.attach({
        input: form.querySelector('[name="Trading_Name"]'),
        abnField: form.querySelector('[name="ABN"]'),
        statusEl: form.querySelector('[data-abn-status]'),
        resultsEl: form.querySelector('[data-abn-results]'),
      });
    }

    function val(name) {
      var el = form.querySelector('[name="' + name + '"]');
      return el ? el.value.trim() : '';
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var data = {
        First_Name: val('First_Name'),
        Last_Name: val('Last_Name'),
        Trading_Name: val('Trading_Name'),
        Email: val('Email'),
        Phone: val('Phone'),
        Description: val('Description'),
      };
      // Only sent when the lookup actually confirmed one - an empty string would overwrite a
      // real ABN on an existing Partner record during the dedupe update.
      var abn = val('ABN');
      if (abn) data.ABN = abn;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
      statusEl.textContent = '';
      statusEl.style.color = '';

      fetch(window.TF_ZOHO.leadUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'connect', data: data }),
      })
        .then(function (res) {
          return res.json().then(function (body) { return { ok: res.ok, body: body }; });
        })
        .then(function (result) {
          if (!(result.ok && result.body && result.body.ok)) {
            throw new Error((result.body && result.body.error) || 'submission_failed');
          }
          form.reset();
          var results = form.querySelector('[data-abn-results]');
          if (results) { results.innerHTML = ''; results.hidden = true; }
          var abnStatus = form.querySelector('[data-abn-status]');
          if (abnStatus) abnStatus.textContent = '';
          statusEl.textContent = "Thanks - we've got your details and someone will be in touch shortly.";
          statusEl.style.color = 'var(--navy)';
          submitBtn.textContent = 'Sent';
        })
        .catch(function () {
          statusEl.textContent = 'Something went wrong sending your details - please call 1300 161 641 and we’ll set you up directly.';
          statusEl.style.color = 'var(--peach)';
          submitBtn.disabled = false;
          submitBtn.textContent = originalLabel;
        });
    });
  }

  function boot() {
    var forms = document.querySelectorAll('[data-connect-form]');
    for (var i = 0; i < forms.length; i++) init(forms[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
