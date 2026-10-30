/*
 * Orchestra Aurea — form newsletter del footer -> Brevo con double opt-in
 * =========================================================================
 * Caricato in tutte le pagine (Webflow: Site settings -> Custom code -> Footer):
 *     <script src="https://spenden.orchestra-aurea.ch/newsletter-footer.js" defer></script>
 *
 * Intercetta l'invio del form newsletter nativo di Webflow (id "wf-form-Newsletter-subscription",
 * oppure qualsiasi form con l'attributo data-oa-newsletter) e manda l'indirizzo a
 * /api/newsletter, che spedisce l'email di conferma. Poi mostra i messaggi di successo/errore
 * di Webflow (testi modificabili nel Designer, tradotti con Localization).
 * Se lo script non si carica, il form torna al comportamento di Webflow (invio a Webflow Forms).
 */
(function () {
  'use strict';
  if (window.__oaNewsletterLoaded) return;
  window.__oaNewsletterLoaded = true;

  var scriptEl = document.currentScript;
  var ENDPOINT = (scriptEl && scriptEl.getAttribute('data-endpoint')) || 'https://spenden.orchestra-aurea.ch/api/newsletter';
  var SELECTOR = 'form[data-oa-newsletter], form#wf-form-Newsletter-subscription, form[name="wf-form-Newsletter-subscription"]';

  function lang() {
    var l = (document.documentElement.lang || '').slice(0, 2).toLowerCase();
    if (['de', 'en', 'it'].indexOf(l) >= 0) return l;
    var p = (location.pathname.split('/')[1] || '').toLowerCase();
    return ['de', 'en', 'it'].indexOf(p) >= 0 ? p : 'de';
  }

  // Campo trappola per i bot: invisibile alle persone, i bot lo compilano.
  function addHoneypot(form) {
    if (form.querySelector('input[name="website"]')) return;
    var hp = document.createElement('input');
    hp.type = 'text';
    hp.name = 'website';
    hp.tabIndex = -1;
    hp.autocomplete = 'off';
    hp.setAttribute('aria-hidden', 'true');
    hp.style.cssText = 'position:absolute!important;left:-9999px!important;width:1px;height:1px;opacity:0';
    form.appendChild(hp);
  }

  function prepare() {
    Array.prototype.forEach.call(document.querySelectorAll(SELECTOR), addHoneypot);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', prepare); else prepare();

  function show(node, visible) {
    if (node) node.style.display = visible ? 'block' : 'none';
  }

  // Fase di "cattura": si arriva prima del gestore di Webflow e lo si ferma.
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !form.matches || !form.matches(SELECTOR)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    var wrapper = form.closest('.w-form') || form.parentNode;
    var done = wrapper && wrapper.querySelector('.w-form-done');
    var failBox = wrapper && wrapper.querySelector('.w-form-fail');
    var emailInput = form.querySelector('input[type="email"]') || form.querySelector('input[name="Email"]');
    var hp = form.querySelector('input[name="website"]');
    var button = form.querySelector('[type="submit"]');
    var email = emailInput ? emailInput.value.trim() : '';

    show(failBox, false);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (emailInput) { emailInput.focus(); if (emailInput.reportValidity) emailInput.reportValidity(); }
      return;
    }
    if (form.getAttribute('data-oa-busy') === '1') return;
    form.setAttribute('data-oa-busy', '1');
    // Il bottone del footer e' un'icona (freccia): non se ne cambia il testo, lo si disattiva soltanto.
    if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, lang: lang(), website: hp ? hp.value : '' })
    })
      .then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        show(form, false);
        show(done, true);
        if (done) { done.setAttribute('role', 'status'); done.setAttribute('tabindex', '-1'); done.focus(); }
      })
      .catch(function () {
        show(failBox, true);
        if (failBox) failBox.setAttribute('role', 'alert');
      })
      .then(function () {
        form.removeAttribute('data-oa-busy');
        if (button) { button.disabled = false; button.removeAttribute('aria-busy'); }
      });
  }, true);
})();
