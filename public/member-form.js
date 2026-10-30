/*
 * Orchestra Aurea — form di iscrizione al Verein (quota annuale)
 * ================================================================
 * Servito da https://spenden.orchestra-aurea.ch/member-form.js
 *
 * COME SI USA (pagina Webflow "Mitglied werden", una per lingua)
 *   Un Code Embed con:
 *       <div data-oa-member-form></div>
 *       <script src="https://spenden.orchestra-aurea.ch/member-form.js" defer></script>
 *
 * Quota, anno e link agli statuti arrivano dal server (GET /api/membership): si cambiano
 * solo su Vercel (MEMBERSHIP_FEE_CHF, STATUTEN_URL), mai qui.
 *
 * CONFIGURAZIONE facoltativa (attributi data-* sul <script> o sul <div>)
 *   data-endpoint                 URL di /api/membership (default: spenden.orchestra-aurea.ch)
 *   data-terms-de/-en/-it         pagina AGB              (default: /de|en|it/agb)
 *   data-privacy-de/-en/-it       pagina Datenschutz      (default: /de|en|it/datenschutz)
 *   data-back-de/-en/-it          link "Zurück"           (default: /de|en|it/spenden)
 *
 * STILE: stesse variabili del sito e stesso aspetto del form donazioni (donation-form.js).
 * TESTI: le frasi su Saferpay e sui termini sono identiche a quelle del form donazioni.
 */
(function () {
  'use strict';

  if (window.__oaMemberLoaded) return;
  window.__oaMemberLoaded = true;

  var STORAGE_KEY = 'oa_member_draft';
  // Pagamento riuscito (pagina "Willkommen" con ?status=success): la bozza non serve più.
  if (/[?&]status=success\b/.test(location.search)) {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  }

  var scriptEl = document.currentScript;
  var rootEl = document.querySelector('[data-oa-member-form]');
  function attr(name) {
    var v = rootEl && rootEl.getAttribute(name);
    if (v) return v;
    return scriptEl && scriptEl.getAttribute(name) ? scriptEl.getAttribute(name) : '';
  }

  // ---- TESTI --------------------------------------------------------------
  var LABELS = {
    de: {
      title: 'Mitglied werden',
      back: 'Zurück',
      formLabel: 'Mitgliedschaft bezahlen',
      feeTitle: 'Jahresbeitrag',
      feeLine: 'Mitgliedschaft {year}',
      feeNote: 'Mit der Zahlung des Jahresbeitrags werden Sie Mitglied des Vereins Orchestra Aurea.',
      yourDetails: 'Ihre Angaben',
      firstName: 'Vorname',
      lastName: 'Nachname',
      address: 'Strasse und Hausnummer',
      postalCode: 'PLZ',
      city: 'Ort',
      country: 'Land',
      birthDate: 'Geburtsdatum',
      day: 'Tag', month: 'Monat', year: 'Jahr',
      dayPh: 'TT', monthPh: 'MM', yearPh: 'JJJJ',
      email: 'E-Mail',
      phone: 'Telefon (optional)',
      newsletterPrefix: 'Ich bin mit dem Empfang des Newsletters von Orchestra Aurea einverstanden und habe die ',
      privacyLink: 'Datenschutzerklärung',
      newsletterSuffix: ' gelesen.',
      statutesPrefix: 'Ich trete dem Verein Orchestra Aurea bei und anerkenne die ',
      statutesLink: 'Statuten',
      statutesSuffix: '.',
      docBack: 'Zurück zum Formular',
      docError: 'Der Text konnte nicht geladen werden. In neuem Tab öffnen:',
      saferpayInfo: 'Zahlungen werden sicher von Saferpay (Worldline) verarbeitet.',
      cardStorageInfo: 'Die Organisation speichert oder verarbeitet keine Kartendaten.',
      noAdditionalCharges: 'Für Kartenzahlungen fallen keine zusätzlichen Gebühren an.',
      acceptTermsPrefix: 'Ich akzeptiere die',
      termsAndConditions: 'Allgemeinen Geschäftsbedingungen',
      completeFields: 'Bitte füllen Sie alle Pflichtfelder aus, bevor Sie fortfahren.',
      validEmail: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.',
      validBirthDate: 'Bitte geben Sie ein gültiges Geburtsdatum ein (TT MM JJJJ).',
      validPhone: 'Bitte prüfen Sie die Telefonnummer.',
      validCountry: 'Bitte wählen Sie Ihr Land.',
      acceptStatutesError: 'Bitte bestätigen Sie den Beitritt zum Verein und die Statuten.',
      acceptTermsError: 'Bitte akzeptieren Sie die Allgemeinen Geschäftsbedingungen, bevor Sie fortfahren.',
      unableToStartPayment: 'Zahlung konnte nicht gestartet werden. Bitte versuchen Sie es erneut.',
      noRedirectUrl: 'Keine Weiterleitungs-URL erhalten. Bitte versuchen Sie es erneut.',
      connectionError: 'Verbindungsfehler. Bitte versuchen Sie es erneut.',
      redirecting: 'Weiterleitung…',
      proceedPayment: 'Zur Zahlung fortfahren'
    },
    en: {
      title: 'Become a member',
      back: 'Back',
      formLabel: 'Pay the membership fee',
      feeTitle: 'Annual membership fee',
      feeLine: 'Membership {year}',
      feeNote: 'Once your annual fee is paid, you become a member of the Orchestra Aurea association.',
      yourDetails: 'Your details',
      firstName: 'First name',
      lastName: 'Last name',
      address: 'Street and number',
      postalCode: 'Postal code',
      city: 'Town/City',
      country: 'Country',
      birthDate: 'Date of birth',
      day: 'Day', month: 'Month', year: 'Year',
      dayPh: 'DD', monthPh: 'MM', yearPh: 'YYYY',
      email: 'Email',
      phone: 'Phone (optional)',
      newsletterPrefix: 'I agree to receive the Orchestra Aurea newsletter and I have read the ',
      privacyLink: 'Privacy Policy',
      newsletterSuffix: '.',
      statutesPrefix: 'I am joining the Orchestra Aurea association and accept its ',
      statutesLink: 'Articles of Association',
      statutesSuffix: '.',
      docBack: 'Back to the form',
      docError: 'The text could not be loaded. Open it in a new tab:',
      saferpayInfo: 'Payments are securely processed by Saferpay (Worldline).',
      cardStorageInfo: 'The organization does not store or process payment card details.',
      noAdditionalCharges: 'No additional charges will be added for card payments.',
      acceptTermsPrefix: 'I accept the',
      termsAndConditions: 'Terms & Conditions',
      completeFields: 'Please complete all required fields before continuing.',
      validEmail: 'Please enter a valid email address.',
      validBirthDate: 'Please enter a valid date of birth (DD MM YYYY).',
      validPhone: 'Please check the phone number.',
      validCountry: 'Please choose your country.',
      acceptStatutesError: 'Please confirm that you are joining the association and accept its Articles of Association.',
      acceptTermsError: 'Please accept the Terms & Conditions before proceeding.',
      unableToStartPayment: 'Unable to start payment. Please try again.',
      noRedirectUrl: 'No redirect URL was returned. Please try again.',
      connectionError: 'Connection error. Please try again.',
      redirecting: 'Redirecting…',
      proceedPayment: 'Proceed to payment'
    },
    it: {
      title: 'Diventa socio',
      back: 'Indietro',
      formLabel: 'Paga la quota associativa',
      feeTitle: 'Quota annuale',
      feeLine: 'Iscrizione {year}',
      feeNote: 'Con il pagamento della quota annuale diventi socio dell’associazione Orchestra Aurea.',
      yourDetails: 'I tuoi dati',
      firstName: 'Nome',
      lastName: 'Cognome',
      address: 'Via e numero civico',
      postalCode: 'CAP',
      city: 'Località',
      country: 'Paese',
      birthDate: 'Data di nascita',
      day: 'Giorno', month: 'Mese', year: 'Anno',
      dayPh: 'GG', monthPh: 'MM', yearPh: 'AAAA',
      email: 'Email',
      phone: 'Telefono (facoltativo)',
      newsletterPrefix: 'Acconsento a ricevere la newsletter di Orchestra Aurea e dichiaro di aver letto l\'',
      privacyLink: 'Informativa sulla Privacy',
      newsletterSuffix: '.',
      statutesPrefix: 'Aderisco all’associazione Orchestra Aurea e ne accetto lo ',
      statutesLink: 'statuto',
      statutesSuffix: '.',
      docBack: 'Torna al form',
      docError: 'Impossibile caricare il testo. Aprilo in una nuova scheda:',
      saferpayInfo: 'I pagamenti sono elaborati in sicurezza da Saferpay (Worldline).',
      cardStorageInfo: 'L\'organizzazione non memorizza né processa i dettagli delle carte di pagamento.',
      noAdditionalCharges: 'Non verranno aggiunti costi aggiuntivi per i pagamenti con carta.',
      acceptTermsPrefix: 'Accetto i',
      termsAndConditions: 'Termini e Condizioni',
      completeFields: 'Compila tutti i campi obbligatori prima di continuare.',
      validEmail: 'Inserisci un indirizzo email valido.',
      validBirthDate: 'Inserisci una data di nascita valida (GG MM AAAA).',
      validPhone: 'Controlla il numero di telefono.',
      validCountry: 'Scegli il tuo Paese.',
      acceptStatutesError: 'Conferma l’adesione all’associazione e l’accettazione dello statuto.',
      acceptTermsError: 'Accetta i Termini e Condizioni prima di procedere.',
      unableToStartPayment: 'Impossibile avviare il pagamento. Riprova.',
      noRedirectUrl: 'Nessun URL di reindirizzamento ricevuto. Riprova.',
      connectionError: 'Errore di connessione. Riprova.',
      redirecting: 'Reindirizzamento…',
      proceedPayment: 'Procedi al pagamento'
    }
  };
  var LOCALES = { de: 'de-CH', en: 'en-GB', it: 'it-CH' };

  function detectLang() {
    var fromHtml = (document.documentElement.lang || '').slice(0, 2).toLowerCase();
    if (LABELS[fromHtml]) return fromHtml;
    var fromPath = (location.pathname.split('/')[1] || '').slice(0, 2).toLowerCase();
    if (LABELS[fromPath]) return fromPath;
    return 'de';
  }
  var lang = detectLang();
  var t = LABELS[lang];

  var CONFIG = {
    endpoint: attr('data-endpoint') || 'https://spenden.orchestra-aurea.ch/api/membership',
    terms: attr('data-terms-' + lang) || '/' + lang + '/agb',
    privacy: attr('data-privacy-' + lang) || '/' + lang + '/datenschutz',
    back: attr('data-back-' + lang) || '/' + lang + '/spenden'
  };

  // Paesi (ISO 3166-1): stesso elenco di lib/countries.js. I nomi vengono dal browser
  // (Intl.DisplayNames) nella lingua della pagina; in cima i Paesi piu' probabili.
  var COUNTRIES = ('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
    'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
    'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
    'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT ' +
    'MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
    'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG ' +
    'UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW').split(' ');
  var TOP_COUNTRIES = ['CH', 'LI', 'DE', 'AT', 'IT', 'FR'];

  function countryName(code) {
    try {
      if (window.Intl && Intl.DisplayNames) {
        return new Intl.DisplayNames([LOCALES[lang]], { type: 'region' }).of(code) || code;
      }
    } catch (e) { /* vecchio browser */ }
    return code;
  }

  // ---- STATO --------------------------------------------------------------
  var DETAIL_KEYS = ['firstName', 'lastName', 'address', 'postalCode', 'city', 'email', 'phone'];
  function emptyDetails() {
    return { firstName: '', lastName: '', address: '', postalCode: '', city: '', country: 'CH', bdDay: '', bdMonth: '', bdYear: '', email: '', phone: '' };
  }
  var state = {
    fee: 100,
    year: new Date().getFullYear(),
    statutesUrl: '',
    details: emptyDetails(),
    newsletter: false,
    statutesAccepted: false,
    termsAccepted: false,
    submitting: false
  };

  function saveDraft() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ details: state.details, newsletter: state.newsletter }));
    } catch (e) { /* storage non disponibile */ }
  }
  function loadDraft() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // ---- STILE (come donation-form.js, piu' quota, menu Paese e data di nascita) ----------
  var CSS = '' +
    '.oa-root{--oa-ink:var(--color--ink,#1c1a17);--oa-gold:var(--color--gold-deep,#8a6a2a);' +
    '--oa-sand:var(--color--sand,#ebddc1);--oa-paper:var(--color--paper,#fff);--oa-bg:var(--color--paper-warm,#f9f5ec);--oa-error:#8f2d1f;' +
    '--oa-pad:clamp(1rem,4vw,2rem);' +
    'box-sizing:border-box;width:100%;max-width:40rem;margin:0 auto;color:var(--oa-ink);' +
    'font-family:var(--font-family,"Switzer Variable",Helvetica,Arial,sans-serif);' +
    'font-size:var(--_typography---text-body--body-size,1rem);line-height:var(--_typography---line-height--lh-body,1.5)}' +
    '.oa-root *{box-sizing:border-box}' +
    '.oa-root .oa-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:.5rem 1.5rem;margin:0 0 var(--oa-pad)}' +
    '.oa-root .oa-card{padding:var(--oa-pad);border-radius:8px;background:var(--oa-bg)}' +
    '.oa-root .oa-back{color:var(--oa-gold);font-size:1rem;line-height:1.3;text-decoration:underline;text-underline-offset:.2em}' +
    '.oa-root .oa-back::before{content:"\\2190\\00a0";text-decoration:none;display:inline-block}' +
    '.oa-root .oa-back:hover{color:var(--oa-ink)}' +
    '.oa-root .oa-label{margin:0;color:var(--oa-gold);font-size:var(--_typography---text-fixed-size--text-label,1rem);' +
    'line-height:1.3;font-weight:500;letter-spacing:.05em;text-transform:uppercase}' +
    '.oa-root .oa-section-title{margin:0 0 .75rem;color:var(--oa-gold);font-size:var(--_typography---text-fixed-size--text-label,1rem);' +
    'line-height:1.3;font-weight:500;letter-spacing:.05em;text-transform:uppercase}' +
    '.oa-root .oa-section+.oa-section{margin-top:2rem}' +
    // Quota: riquadro fisso, stesso aspetto della cifra scelta nel form donazioni
    '.oa-root .oa-fee{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;padding:1rem 1.25rem;border:1px solid var(--oa-gold);' +
    'border-radius:8px;background:var(--oa-gold);color:var(--oa-paper);font-size:1.125rem;line-height:1.3}' +
    '.oa-root .oa-fee-amount{font-weight:500;white-space:nowrap}' +
    '.oa-root .oa-input{display:block;width:100%;height:auto;margin:0;padding:.75rem 1rem;border:1px solid var(--oa-gold);border-radius:8px;' +
    'background:var(--oa-paper);color:var(--oa-ink);font:inherit;font-size:1rem;line-height:1.4;-webkit-appearance:none;appearance:none}' +
    '.oa-root .oa-input::placeholder{color:var(--oa-ink);opacity:.6}' +
    '.oa-root select.oa-input{padding-right:2.75rem;cursor:pointer;background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2714%27 height=%279%27 viewBox=%270 0 14 9%27%3E%3Cpath d=%27M1 1l6 6 6-6%27 fill=%27none%27 stroke=%27%238a6a2a%27 stroke-width=%272%27/%3E%3C/svg%3E");' +
    'background-repeat:no-repeat;background-position:right 1rem center}' +
    '.oa-root .oa-fields{display:grid;gap:.75rem}' +
    '.oa-root .oa-row{display:grid;grid-template-columns:1fr 2fr;gap:.75rem}' +
    '.oa-root .oa-date{margin:0;padding:0;border:0;min-width:0}' +
    '.oa-root .oa-date legend{margin:0 0 .375rem;padding:0;color:var(--oa-ink);font-size:1rem;line-height:1.4}' +
    '.oa-root .oa-date-row{display:grid;grid-template-columns:4.5rem 4.5rem 6.5rem;gap:.75rem}' +
    '.oa-root .oa-date-row .oa-input{text-align:center}' +
    '.oa-root .oa-note{margin:.75rem 0 0;color:var(--oa-ink);font-size:1rem;line-height:1.5}' +
    '.oa-root .oa-check{display:flex;align-items:flex-start;gap:.75rem;margin:1rem 0 0;color:var(--oa-ink);font-size:1rem;line-height:1.5;cursor:pointer}' +
    '.oa-root .oa-check input{flex:none;width:1.25rem;height:1.25rem;margin:.15rem 0 0;accent-color:var(--oa-gold)}' +
    '.oa-root .oa-check a{color:inherit;text-decoration:underline}' +
    '.oa-root .oa-check a:hover{color:var(--oa-gold)}' +
    '.oa-root .oa-error{margin:1rem 0 0;color:var(--oa-error);font-size:1rem;line-height:1.5;font-weight:500}' +
    '.oa-root .oa-actions{margin-top:2rem}' +
    '.oa-root .oa-pay{display:block;width:100%;min-width:200px;padding:.875rem 2rem;border:1px solid var(--oa-gold);border-radius:8px;' +
    'background:var(--oa-gold);color:var(--oa-paper);font:inherit;font-size:1rem;font-weight:400;' +
    'letter-spacing:.05em;text-transform:uppercase;text-align:center;cursor:pointer;transition:all .4s ease}' +
    '.oa-root .oa-pay:hover:not(:disabled){background:var(--oa-paper);color:var(--oa-gold)}' +
    '.oa-root .oa-pay:disabled{opacity:.5;cursor:not-allowed}' +
    '.oa-root :focus-visible{outline:2px solid var(--oa-gold);outline-offset:2px}' +
    '.oa-root .oa-input:focus,.oa-root .oa-input:focus-visible{outline:none;background-color:var(--oa-sand);border-color:var(--oa-gold);box-shadow:0 0 0 1px var(--oa-gold)}' +
    '.oa-root .oa-doc{margin-top:2.5rem;padding:clamp(1rem,4vw,1.5rem);border:1px solid var(--oa-sand);border-radius:8px;background:var(--oa-paper)}' +
    '.oa-root .oa-doc-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:.75rem 1rem;margin-bottom:1.25rem}' +
    '.oa-root .oa-doc-head .oa-section-title{flex:1 1 12rem;min-width:0;margin:0}' +
    '.oa-root .oa-doc-title:focus{outline:none}' +
    '.oa-root .oa-doc-body{display:flex;flex-direction:column;gap:1rem;color:var(--oa-ink)}' +
    '.oa-root .oa-doc-body a{color:inherit;text-decoration:underline}' +
    '.oa-root .oa-doc-close{flex:none;max-width:100%;padding:.5rem 1rem;border:1px solid var(--oa-gold);border-radius:8px;background:transparent;color:var(--oa-gold);font:inherit;font-size:1rem;line-height:1.4;cursor:pointer}' +
    '.oa-root .oa-doc-close:hover{background:var(--oa-sand)}' +
    '.oa-root .oa-doc>.oa-doc-close{margin-top:1.5rem}' +
    '.oa-root .oa-hidden{display:none!important}' +
    '@media (max-width:30rem){.oa-root .oa-pay{padding:.875rem 1rem;letter-spacing:.03em}' +
    '.oa-root .oa-date-row{grid-template-columns:1fr 1fr 1.5fr}}';

  // ---- MARKUP ---------------------------------------------------------------
  var MARKUP = '' +
    '<div class="oa-head">' +
      '<p class="oa-label" id="oa-subtitle"></p>' +
      '<a class="oa-back" id="oa-back" href="#"></a>' +
    '</div>' +
    '<div class="oa-card">' +
    '<form class="oa-form" id="oa-form" novalidate autocomplete="on">' +
      '<section class="oa-section">' +
        '<h2 class="oa-section-title" id="oa-fee-title"></h2>' +
        '<div class="oa-fee"><span id="oa-fee-line"></span><span class="oa-fee-amount" id="oa-fee-amount"></span></div>' +
        '<p class="oa-note" id="oa-fee-note"></p>' +
      '</section>' +
      '<section class="oa-section">' +
        '<h2 class="oa-section-title" id="oa-details-title"></h2>' +
        '<div class="oa-fields">' +
          '<input class="oa-input" id="oa-firstName" name="firstName" type="text" autocomplete="given-name" required>' +
          '<input class="oa-input" id="oa-lastName" name="lastName" type="text" autocomplete="family-name" required>' +
          '<input class="oa-input" id="oa-address" name="address" type="text" autocomplete="street-address" required>' +
          '<div class="oa-row">' +
            '<input class="oa-input" id="oa-postalCode" name="postalCode" type="text" autocomplete="postal-code" required>' +
            '<input class="oa-input" id="oa-city" name="city" type="text" autocomplete="address-level2" required>' +
          '</div>' +
          '<select class="oa-input" id="oa-country" name="country" autocomplete="country" required></select>' +
          '<fieldset class="oa-date">' +
            '<legend id="oa-bd-legend"></legend>' +
            '<div class="oa-date-row">' +
              '<input class="oa-input" id="oa-bdDay" name="bday-day" type="text" inputmode="numeric" maxlength="2" autocomplete="bday-day" required>' +
              '<input class="oa-input" id="oa-bdMonth" name="bday-month" type="text" inputmode="numeric" maxlength="2" autocomplete="bday-month" required>' +
              '<input class="oa-input" id="oa-bdYear" name="bday-year" type="text" inputmode="numeric" maxlength="4" autocomplete="bday-year" required>' +
            '</div>' +
          '</fieldset>' +
          '<input class="oa-input" id="oa-email" name="email" type="email" autocomplete="email" required>' +
          '<input class="oa-input" id="oa-phone" name="phone" type="tel" autocomplete="tel">' +
        '</div>' +
        '<label class="oa-check"><input type="checkbox" id="oa-newsletter"><span><span id="oa-newsletter-prefix"></span><a id="oa-privacy-link" href="#" target="_blank" rel="noopener noreferrer"></a><span id="oa-newsletter-suffix"></span></span></label>' +
      '</section>' +
      '<section class="oa-section">' +
        '<p class="oa-note" id="oa-saferpay"></p>' +
        '<p class="oa-note" id="oa-charges"></p>' +
        '<label class="oa-check"><input type="checkbox" id="oa-statutes"><span><span id="oa-statutes-prefix"></span><a id="oa-statutes-link" href="#" target="_blank" rel="noopener noreferrer"></a><span id="oa-statutes-text" class="oa-hidden"></span><span id="oa-statutes-suffix"></span></span></label>' +
        '<label class="oa-check"><input type="checkbox" id="oa-terms"><span><span id="oa-terms-prefix"></span> <a id="oa-terms-link" href="#" target="_blank" rel="noopener noreferrer"></a>.</span></label>' +
        '<p class="oa-error oa-hidden" id="oa-error" role="alert"></p>' +
        '<div class="oa-actions"><button type="submit" class="oa-pay" id="oa-pay"></button></div>' +
      '</section>' +
    '</form>' +
    '<section class="oa-doc oa-hidden" id="oa-doc" aria-labelledby="oa-doc-title">' +
      '<div class="oa-doc-head">' +
        '<h2 class="oa-section-title oa-doc-title" id="oa-doc-title" tabindex="-1"></h2>' +
        '<button type="button" class="oa-doc-close" id="oa-doc-close-top"></button>' +
      '</div>' +
      '<div class="oa-doc-body" id="oa-doc-body"></div>' +
      '<button type="button" class="oa-doc-close" id="oa-doc-close-bottom"></button>' +
    '</section>' +
    '</div>';

  function fmt(template, vars) {
    return template.replace(/\{(\w+)\}/g, function (_, k) { return vars[k]; });
  }

  // ---- AVVIO ----------------------------------------------------------------
  function init() {
    var styleEl = document.createElement('style');
    styleEl.setAttribute('data-oa-member', '');
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);

    rootEl.classList.add('oa-root');
    rootEl.innerHTML = MARKUP;

    function $(id) { return rootEl.querySelector('#' + id); }
    var el = {
      form: $('oa-form'), subtitle: $('oa-subtitle'), back: $('oa-back'),
      feeTitle: $('oa-fee-title'), feeLine: $('oa-fee-line'), feeAmount: $('oa-fee-amount'), feeNote: $('oa-fee-note'),
      detailsTitle: $('oa-details-title'),
      firstName: $('oa-firstName'), lastName: $('oa-lastName'), address: $('oa-address'),
      postalCode: $('oa-postalCode'), city: $('oa-city'), country: $('oa-country'),
      bdLegend: $('oa-bd-legend'), bdDay: $('oa-bdDay'), bdMonth: $('oa-bdMonth'), bdYear: $('oa-bdYear'),
      email: $('oa-email'), phone: $('oa-phone'),
      newsletter: $('oa-newsletter'), newsletterPrefix: $('oa-newsletter-prefix'), privacyLink: $('oa-privacy-link'), newsletterSuffix: $('oa-newsletter-suffix'),
      saferpay: $('oa-saferpay'), charges: $('oa-charges'),
      statutes: $('oa-statutes'), statutesPrefix: $('oa-statutes-prefix'), statutesLink: $('oa-statutes-link'),
      statutesText: $('oa-statutes-text'), statutesSuffix: $('oa-statutes-suffix'),
      terms: $('oa-terms'), termsPrefix: $('oa-terms-prefix'), termsLink: $('oa-terms-link'),
      error: $('oa-error'), pay: $('oa-pay'),
      doc: $('oa-doc'), docTitle: $('oa-doc-title'), docBody: $('oa-doc-body'),
      docCloseTop: $('oa-doc-close-top'), docCloseBottom: $('oa-doc-close-bottom')
    };

    // Testi fissi
    el.form.setAttribute('aria-label', t.formLabel);
    el.subtitle.textContent = t.title;
    el.back.textContent = t.back;
    el.back.setAttribute('href', CONFIG.back);
    el.feeTitle.textContent = t.feeTitle;
    el.feeNote.textContent = t.feeNote;
    el.detailsTitle.textContent = t.yourDetails;
    ['firstName', 'lastName', 'address', 'postalCode', 'city', 'email', 'phone'].forEach(function (k) {
      el[k].setAttribute('placeholder', t[k]);
      el[k].setAttribute('aria-label', t[k]);
    });
    el.country.setAttribute('aria-label', t.country);
    el.bdLegend.textContent = t.birthDate;
    el.bdDay.setAttribute('placeholder', t.dayPh); el.bdDay.setAttribute('aria-label', t.birthDate + ': ' + t.day);
    el.bdMonth.setAttribute('placeholder', t.monthPh); el.bdMonth.setAttribute('aria-label', t.birthDate + ': ' + t.month);
    el.bdYear.setAttribute('placeholder', t.yearPh); el.bdYear.setAttribute('aria-label', t.birthDate + ': ' + t.year);
    el.newsletterPrefix.textContent = t.newsletterPrefix;
    el.privacyLink.textContent = t.privacyLink;
    el.privacyLink.setAttribute('href', CONFIG.privacy);
    el.newsletterSuffix.textContent = t.newsletterSuffix;
    el.saferpay.appendChild(document.createTextNode(t.saferpayInfo));
    el.saferpay.appendChild(document.createElement('br'));
    el.saferpay.appendChild(document.createTextNode(t.cardStorageInfo));
    el.charges.textContent = t.noAdditionalCharges;
    el.statutesPrefix.textContent = t.statutesPrefix;
    el.statutesLink.textContent = t.statutesLink;
    el.statutesText.textContent = t.statutesLink;
    el.statutesSuffix.textContent = t.statutesSuffix;
    el.termsPrefix.textContent = t.acceptTermsPrefix;
    el.termsLink.textContent = t.termsAndConditions;
    el.termsLink.setAttribute('href', CONFIG.terms);
    el.docCloseTop.textContent = t.docBack;
    el.docCloseBottom.textContent = t.docBack;

    // Menu Paese
    (function fillCountries() {
      var collator = window.Intl && Intl.Collator ? new Intl.Collator(LOCALES[lang]) : null;
      function add(code) {
        var o = document.createElement('option');
        o.value = code;
        o.textContent = countryName(code);
        el.country.appendChild(o);
      }
      TOP_COUNTRIES.forEach(add);
      var sep = document.createElement('option');
      sep.disabled = true;
      sep.textContent = '──────────';
      el.country.appendChild(sep);
      COUNTRIES.filter(function (c) { return TOP_COUNTRIES.indexOf(c) < 0; })
        .map(function (c) { return { c: c, n: countryName(c) }; })
        .sort(function (a, b) { return collator ? collator.compare(a.n, b.n) : (a.n < b.n ? -1 : 1); })
        .forEach(function (x) { add(x.c); });
    })();

    function render() {
      el.feeLine.textContent = fmt(t.feeLine, { year: state.year });
      el.feeAmount.textContent = 'CHF ' + state.fee;
      var hasStatutes = !!state.statutesUrl;
      el.statutesLink.classList.toggle('oa-hidden', !hasStatutes);
      el.statutesText.classList.toggle('oa-hidden', hasStatutes);
      if (hasStatutes) el.statutesLink.setAttribute('href', state.statutesUrl);
      el.pay.textContent = state.submitting ? t.redirecting : t.proceedPayment + ' CHF ' + state.fee;
      el.pay.disabled = state.submitting;
    }

    function showError(msg, focusEl) {
      el.error.textContent = msg;
      el.error.classList.remove('oa-hidden');
      if (focusEl) focusEl.focus();
    }
    function clearError() {
      el.error.textContent = '';
      el.error.classList.add('oa-hidden');
    }

    function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); }
    function validPhone(v) {
      v = v.trim();
      if (!v) return true;
      return /^[+0-9 ()./-]{6,30}$/.test(v) && (v.match(/\d/g) || []).length >= 6;
    }
    // "AAAA-MM-GG" oppure null se la data non esiste / e' nel futuro / prima del 1900
    function birthDateIso() {
      var d = state.details;
      var day = parseInt(d.bdDay, 10), month = parseInt(d.bdMonth, 10), year = parseInt(d.bdYear, 10);
      if (!/^\d{1,2}$/.test(d.bdDay.trim()) || !/^\d{1,2}$/.test(d.bdMonth.trim()) || !/^\d{4}$/.test(d.bdYear.trim())) return null;
      var date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
      if (year < 1900 || date.getTime() > Date.now()) return null;
      function two(n) { return (n < 10 ? '0' : '') + n; }
      return year + '-' + two(month) + '-' + two(day);
    }

    function fillInputs() {
      var d = state.details;
      ['firstName', 'lastName', 'address', 'postalCode', 'city', 'email', 'phone', 'bdDay', 'bdMonth', 'bdYear'].forEach(function (k) {
        el[k].value = d[k] || '';
      });
      el.country.value = d.country || 'CH';
      if (!el.country.value) el.country.value = 'CH';
      el.newsletter.checked = !!state.newsletter;
      el.statutes.checked = false;
      el.terms.checked = false;
    }

    function submit(event) {
      event.preventDefault();
      if (state.submitting) return;
      clearError();
      var d = state.details;
      var required = ['firstName', 'lastName', 'address', 'postalCode', 'city'];
      for (var i = 0; i < required.length; i++) {
        if (!String(d[required[i]]).trim()) { showError(t.completeFields, el[required[i]]); return; }
      }
      if (!d.country) { showError(t.validCountry, el.country); return; }
      if (!d.bdDay.trim() || !d.bdMonth.trim() || !d.bdYear.trim()) {
        showError(t.completeFields, !d.bdDay.trim() ? el.bdDay : !d.bdMonth.trim() ? el.bdMonth : el.bdYear); return;
      }
      var birth = birthDateIso();
      if (!birth) { showError(t.validBirthDate, el.bdDay); return; }
      if (!d.email.trim()) { showError(t.completeFields, el.email); return; }
      if (!validEmail(d.email)) { showError(t.validEmail, el.email); return; }
      if (!validPhone(d.phone)) { showError(t.validPhone, el.phone); return; }
      if (!state.statutesAccepted) { showError(t.acceptStatutesError, el.statutes); return; }
      if (!state.termsAccepted) { showError(t.acceptTermsError, el.terms); return; }

      state.submitting = true;
      render();

      fetch(CONFIG.endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lang: lang,
          member: {
            firstName: d.firstName.trim(),
            lastName: d.lastName.trim(),
            address: d.address.trim(),
            postalCode: d.postalCode.trim(),
            city: d.city.trim(),
            country: d.country,
            birthDate: birth,
            email: d.email.trim(),
            phone: d.phone.trim(),
            newsletter: !!state.newsletter
          },
          statutesAccepted: true,
          termsAccepted: true
        })
      })
        .then(function (response) {
          return response.json().then(function (payload) { return { ok: response.ok, payload: payload }; });
        })
        .then(function (result) {
          if (!result.ok) {
            var code = (result.payload || {}).code;
            var msg = {
              INVALID_EMAIL: [t.validEmail, el.email],
              INVALID_BIRTHDATE: [t.validBirthDate, el.bdDay],
              INVALID_PHONE: [t.validPhone, el.phone],
              INVALID_COUNTRY: [t.validCountry, el.country],
              MISSING_DETAILS: [t.completeFields, null]
            }[code] || [t.unableToStartPayment, null];
            state.submitting = false;
            render();
            showError(msg[0], msg[1]);
            return;
          }
          if (result.payload && result.payload.redirectUrl) {
            window.location.href = result.payload.redirectUrl;
            return;
          }
          state.submitting = false;
          render();
          showError(t.noRedirectUrl);
        })
        .catch(function () {
          state.submitting = false;
          render();
          showError(t.connectionError);
        });
    }

    // ---- EVENTI -------------------------------------------------------------
    ['firstName', 'lastName', 'address', 'postalCode', 'city', 'email', 'phone', 'bdDay', 'bdMonth', 'bdYear'].forEach(function (k) {
      el[k].addEventListener('input', function (e) { state.details[k] = e.target.value; saveDraft(); });
    });
    el.country.addEventListener('change', function (e) { state.details.country = e.target.value; saveDraft(); });
    el.newsletter.addEventListener('change', function (e) { state.newsletter = e.target.checked; saveDraft(); });
    el.statutes.addEventListener('change', function (e) { state.statutesAccepted = e.target.checked; });
    el.terms.addEventListener('change', function (e) { state.termsAccepted = e.target.checked; });
    el.form.addEventListener('submit', submit);

    // AGB e Datenschutz si aprono sotto il form (come nel form donazioni); gli statuti (PDF) in una nuova scheda.
    var docCache = {};
    var docOpen = null;
    function sameOrigin(url) {
      try { return new URL(url, location.href).origin === location.origin; } catch (e) { return false; }
    }
    function sanitize(root) {
      Array.prototype.slice.call(root.querySelectorAll('script,style,iframe,object,embed,link,meta,form')).forEach(function (n) { n.remove(); });
      Array.prototype.slice.call(root.querySelectorAll('*')).forEach(function (n) {
        Array.prototype.slice.call(n.attributes).forEach(function (a) {
          var name = a.name.toLowerCase();
          if (name.indexOf('on') === 0 || name === 'id' || name === 'data-w-id' ||
              ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(a.value))) {
            n.removeAttribute(a.name);
          }
        });
      });
    }
    function fetchDoc(url) {
      if (docCache[url]) return Promise.resolve(docCache[url]);
      return fetch(url, { credentials: 'same-origin' }).then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.text();
      }).then(function (html) {
        var page = new DOMParser().parseFromString(html, 'text/html');
        var txt = page.querySelector('.section-txt');
        if (!txt || !txt.children.length) throw new Error('nessun contenuto');
        var h = page.querySelector('.section_label h1, .section_label h2');
        sanitize(txt);
        docCache[url] = { title: h ? h.textContent.trim() : '', html: txt.innerHTML };
        return docCache[url];
      });
    }
    function scrollTo(node) {
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      try { node.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }); } catch (e) { node.scrollIntoView(); }
    }
    function setExpanded(link) {
      [el.termsLink, el.privacyLink].forEach(function (l) { l.setAttribute('aria-expanded', l === link ? 'true' : 'false'); });
    }
    function closeDoc() {
      if (!docOpen) return;
      var o = docOpen;
      docOpen = null;
      el.doc.classList.add('oa-hidden');
      setExpanded(null);
      o.link.focus({ preventScroll: true });
      scrollTo(o.origin);
    }
    function showDoc(link, origin, title, html) {
      el.docTitle.textContent = title || link.textContent;
      el.docBody.innerHTML = html;
      el.doc.classList.remove('oa-hidden');
      docOpen = { link: link, origin: origin };
      setExpanded(link);
      scrollTo(el.docTitle);
      el.docTitle.focus({ preventScroll: true });
    }
    function toggleDoc(link, origin) {
      if (docOpen && docOpen.link === link) { closeDoc(); return; }
      var url = link.href;
      fetchDoc(url).then(function (d) {
        showDoc(link, origin, d.title, d.html);
      }).catch(function () {
        var p = document.createElement('p');
        p.appendChild(document.createTextNode(t.docError + ' '));
        var a = document.createElement('a');
        a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = link.textContent;
        p.appendChild(a);
        showDoc(link, origin, link.textContent, '');
        el.docBody.appendChild(p);
      });
    }
    [[el.termsLink, el.terms], [el.privacyLink, el.newsletter]].forEach(function (pair) {
      var link = pair[0], origin = pair[1];
      link.setAttribute('aria-controls', 'oa-doc');
      link.setAttribute('aria-expanded', 'false');
      link.addEventListener('click', function (e) {
        saveDraft();
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        if (!sameOrigin(link.href)) { window.open(link.href, '_blank', 'noopener'); return; }
        toggleDoc(link, origin);
      });
    });
    el.statutesLink.addEventListener('click', saveDraft);
    el.docCloseTop.addEventListener('click', closeDoc);
    el.docCloseBottom.addEventListener('click', closeDoc);
    el.doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDoc(); });

    // Bozza (dati gia' inseriti, se la persona torna sulla pagina)
    var draft = loadDraft();
    if (draft && draft.details) state.details = Object.assign(emptyDetails(), draft.details);
    if (draft) state.newsletter = !!draft.newsletter;
    fillInputs();
    if (el.country.value !== state.details.country) state.details.country = el.country.value;
    render();

    // Quota, anno e statuti dal server
    fetch(CONFIG.endpoint + (CONFIG.endpoint.indexOf('?') < 0 ? '?' : '&') + 'lang=' + lang, { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) {
        if (!cfg) return;
        if (cfg.fee) state.fee = cfg.fee;
        if (cfg.year) state.year = cfg.year;
        state.statutesUrl = cfg.statutesUrl || '';
        render();
      })
      .catch(function () { /* restano i valori di default; il server decide comunque l'importo */ });
  }

  if (rootEl) {
    init();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      rootEl = document.querySelector('[data-oa-member-form]');
      if (rootEl) init();
    });
  }
})();
