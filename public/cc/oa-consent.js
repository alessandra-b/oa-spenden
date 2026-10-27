/*!
 * Orchestra Aurea: consenso cookie per orchestra-aurea.ch (Webflow)
 * Usa CookieConsent v3 e iframemanager di Orest Bida (licenza MIT, file in questa cartella).
 *
 * Categorie
 *   necessary  Notwendig    sempre attiva (scelta sui cookie, lingua)
 *   analytics  Statistik    Google Analytics 4 (G-KH0199FRB4)
 *   media      Medien       video YouTube (caricati solo dopo il consenso)
 *
 * Come funziona Google Analytics
 *   Nell'head di Webflow gli script di GA hanno type="text/plain" data-category="analytics":
 *   CookieConsent li esegue solo quando la categoria Statistik e' accettata.
 *   Se il visitatore revoca il consenso, i cookie _ga vengono cancellati e la pagina si ricarica.
 *
 * Come funzionano i video
 *   In Webflow si usa il component «Video» (attributo data-oa-video sul contenitore), con dentro:
 *     [data-oa-video-link]   testo: link YouTube (youtu.be/..., watch?v=..., shorts/...) oppure solo l'ID
 *     [data-oa-video-title]  testo: titolo del video (facoltativo)
 *     [data-oa-video-thumb]  immagine di anteprima (facoltativa)
 *   Lo script li trasforma in <div data-service="youtube" ...> per iframemanager.
 *   Senza immagine propria, l'anteprima arriva da spenden.orchestra-aurea.ch/api/yt-thumb,
 *   che la scarica da YouTube lato server: il browser del visitatore non contatta Google.
 *   Il video si carica solo con il consenso Medien, oppure con un clic sul pulsante del video.
 *
 * Testi: oggetto TEXTS qui sotto, una voce per lingua. La lingua viene presa da <html lang>.
 * Se cambi categorie o servizi, aumenta REVISION: il banner ricompare a tutti.
 */
(function () {
  'use strict';

  var REVISION = 1;

  function lang() {
    var l = (document.documentElement.getAttribute('lang') || '').slice(0, 2).toLowerCase();
    if (l !== 'de' && l !== 'en' && l !== 'it') {
      var m = location.pathname.match(/^\/(de|en|it)(\/|$)/);
      l = m ? m[1] : 'de';
    }
    return l;
  }
  var LANG = lang();

  var PRIVACY = { de: '/de/datenschutz', en: '/en/datenschutz', it: '/it/datenschutz' };

  /* ---------- Testi ---------- */
  var TEXTS = {
    de: {
      title: 'Cookies auf dieser Website',
      desc: 'Wir verwenden notwendige Cookies, damit die Website funktioniert. Mit Ihrer Zustimmung nutzen wir zusätzlich Google Analytics, um zu verstehen, wie die Website genutzt wird, und zeigen Videos von YouTube an. Ihre Wahl können Sie jederzeit unter «Cookie-Einstellungen» im Footer ändern.',
      acceptAll: 'Alle akzeptieren',
      reject: 'Ablehnen',
      settings: 'Einstellungen',
      privacy: 'Datenschutzerklärung',
      pmTitle: 'Cookie-Einstellungen',
      save: 'Auswahl speichern',
      close: 'Schliessen',
      intro: 'Hier entscheiden Sie, welche Cookies und Dienste wir verwenden dürfen. Ihre Wahl gilt für diese Website und lässt sich jederzeit ändern.',
      necTitle: 'Notwendig',
      necDesc: 'Diese Cookies braucht die Website, um zu funktionieren, zum Beispiel um Ihre Cookie-Auswahl zu speichern. Sie lassen sich nicht deaktivieren.',
      anaTitle: 'Statistik',
      anaDesc: 'Google Analytics hilft uns zu verstehen, welche Seiten besucht werden und wie Besucherinnen und Besucher die Website finden. Die Daten werden an Google (USA) übermittelt und nach 2 Monaten gelöscht.',
      medTitle: 'Medien',
      medDesc: 'Videos von YouTube werden erst geladen, wenn Sie zustimmen. YouTube (Google) kann dabei Cookies setzen und Daten in die USA übermitteln.',
      moreTitle: 'Weitere Informationen',
      moreDesc: 'Details finden Sie in unserer <a href="' + PRIVACY.de + '">Datenschutzerklärung</a>.',
      colName: 'Name', colDomain: 'Dienst', colDesc: 'Zweck', colExp: 'Dauer',
      ccCookie: 'Speichert Ihre Cookie-Auswahl', gaCookie: 'Unterscheidet Besucherinnen und Besucher', gaCookie2: 'Speichert den Sitzungsstatus',
      months6: '6 Monate', years2: '2 Jahre',
      vNotice: 'Dieses Video wird von YouTube bereitgestellt. Beim Abspielen werden Daten an Google übermittelt. Mehr dazu in der <a href="' + PRIVACY.de + '">Datenschutzerklärung</a>.',
      vLoad: 'Video laden',
      vLoadAll: 'YouTube immer erlauben'
    },
    en: {
      title: 'Cookies on this website',
      desc: 'We use necessary cookies to make the website work. With your consent we also use Google Analytics to understand how the website is used, and we show videos from YouTube. You can change your choice at any time under “Cookie settings” in the footer.',
      acceptAll: 'Accept all',
      reject: 'Reject',
      settings: 'Settings',
      privacy: 'Privacy policy',
      pmTitle: 'Cookie settings',
      save: 'Save my choice',
      close: 'Close',
      intro: 'Choose which cookies and services we may use. Your choice applies to this website and can be changed at any time.',
      necTitle: 'Necessary',
      necDesc: 'The website needs these cookies to work, for example to remember your cookie choice. They cannot be switched off.',
      anaTitle: 'Statistics',
      anaDesc: 'Google Analytics helps us understand which pages are visited and how people find the website. The data is sent to Google (USA) and deleted after 2 months.',
      medTitle: 'Media',
      medDesc: 'YouTube videos are only loaded with your consent. YouTube (Google) may set cookies and send data to the USA.',
      moreTitle: 'More information',
      moreDesc: 'Find out more in our <a href="' + PRIVACY.en + '">privacy policy</a>.',
      colName: 'Name', colDomain: 'Service', colDesc: 'Purpose', colExp: 'Duration',
      ccCookie: 'Stores your cookie choice', gaCookie: 'Distinguishes visitors', gaCookie2: 'Stores the session state',
      months6: '6 months', years2: '2 years',
      vNotice: 'This video is provided by YouTube. Playing it sends data to Google. More in our <a href="' + PRIVACY.en + '">privacy policy</a>.',
      vLoad: 'Load video',
      vLoadAll: 'Always allow YouTube'
    },
    it: {
      title: 'Cookie su questo sito',
      desc: 'Usiamo cookie necessari al funzionamento del sito. Con il tuo consenso usiamo anche Google Analytics per capire come viene utilizzato il sito e mostriamo video da YouTube. Puoi cambiare la tua scelta in qualsiasi momento da «Impostazioni cookie» nel footer.',
      acceptAll: 'Accetta tutti',
      reject: 'Rifiuta',
      settings: 'Impostazioni',
      privacy: 'Informativa sulla privacy',
      pmTitle: 'Impostazioni cookie',
      save: 'Salva la scelta',
      close: 'Chiudi',
      intro: 'Qui scegli quali cookie e servizi possiamo usare. La scelta vale per questo sito e puoi cambiarla in qualsiasi momento.',
      necTitle: 'Necessari',
      necDesc: 'Il sito ha bisogno di questi cookie per funzionare, per esempio per ricordare la tua scelta sui cookie. Non si possono disattivare.',
      anaTitle: 'Statistiche',
      anaDesc: 'Google Analytics ci aiuta a capire quali pagine vengono visitate e come le persone trovano il sito. I dati vengono trasmessi a Google (USA) e cancellati dopo 2 mesi.',
      medTitle: 'Media',
      medDesc: 'I video di YouTube vengono caricati solo con il tuo consenso. YouTube (Google) può impostare cookie e trasmettere dati negli USA.',
      moreTitle: 'Maggiori informazioni',
      moreDesc: 'Trovi i dettagli nella nostra <a href="' + PRIVACY.it + '">informativa sulla privacy</a>.',
      colName: 'Nome', colDomain: 'Servizio', colDesc: 'Scopo', colExp: 'Durata',
      ccCookie: 'Memorizza la tua scelta sui cookie', gaCookie: 'Distingue i visitatori', gaCookie2: 'Memorizza lo stato della sessione',
      months6: '6 mesi', years2: '2 anni',
      vNotice: 'Questo video è fornito da YouTube. Riproducendolo, i dati vengono trasmessi a Google. Maggiori informazioni nell’<a href="' + PRIVACY.it + '">informativa sulla privacy</a>.',
      vLoad: 'Carica il video',
      vLoadAll: 'Consenti sempre YouTube'
    }
  };

  function translation(t, l) {
    return {
      consentModal: {
        title: t.title,
        description: t.desc,
        acceptAllBtn: t.acceptAll,
        acceptNecessaryBtn: t.reject,
        showPreferencesBtn: t.settings,
        footer: '<a href="' + PRIVACY[l] + '">' + t.privacy + '</a>'
      },
      preferencesModal: {
        title: t.pmTitle,
        acceptAllBtn: t.acceptAll,
        acceptNecessaryBtn: t.reject,
        savePreferencesBtn: t.save,
        closeIconLabel: t.close,
        sections: [
          { description: t.intro },
          {
            title: t.necTitle,
            description: t.necDesc,
            linkedCategory: 'necessary',
            cookieTable: {
              headers: { name: t.colName, domain: t.colDomain, desc: t.colDesc, exp: t.colExp },
              body: [{ name: 'cc_cookie', domain: 'Orchestra Aurea', desc: t.ccCookie, exp: t.months6 }]
            }
          },
          {
            title: t.anaTitle,
            description: t.anaDesc,
            linkedCategory: 'analytics',
            cookieTable: {
              headers: { name: t.colName, domain: t.colDomain, desc: t.colDesc, exp: t.colExp },
              body: [
                { name: '_ga', domain: 'Google Analytics', desc: t.gaCookie, exp: t.years2 },
                { name: '_ga_*', domain: 'Google Analytics', desc: t.gaCookie2, exp: t.years2 }
              ]
            }
          },
          { title: t.medTitle, description: t.medDesc, linkedCategory: 'media' },
          { title: t.moreTitle, description: t.moreDesc }
        ]
      }
    };
  }

  /* ---------- Video (iframemanager) ---------- */
  var im = window.iframemanager ? window.iframemanager() : null;
  var THUMB_PROXY = 'https://spenden.orchestra-aurea.ch/api/yt-thumb?id=';

  // Estrae l'ID da qualsiasi link YouTube, o accetta l'ID nudo (11 caratteri)
  function youtubeId(v) {
    v = (v || '').trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    var m = v.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  // Trasforma i component «Video» di Webflow nei div che iframemanager sa gestire
  function buildVideos() {
    var list = document.querySelectorAll('[data-oa-video]:not([data-oa-ready])');
    for (var i = 0; i < list.length; i++) {
      var box = list[i];
      box.setAttribute('data-oa-ready', '1');
      var linkEl = box.querySelector('[data-oa-video-link]');
      var id = youtubeId(linkEl ? linkEl.textContent : box.getAttribute('data-oa-video'));
      if (!id) continue;
      var titleEl = box.querySelector('[data-oa-video-title]');
      var imgEl = box.querySelector('[data-oa-video-thumb]');
      var thumb = imgEl && imgEl.getAttribute('src');
      if (!thumb || /placeholder/i.test(thumb)) thumb = THUMB_PROXY + id;

      var div = document.createElement('div');
      div.setAttribute('data-service', 'youtube');
      div.setAttribute('data-id', id);
      div.setAttribute('data-thumbnail', thumb);
      div.setAttribute('data-autoscale', '');
      var title = titleEl ? titleEl.textContent.trim() : '';
      if (title) div.setAttribute('data-title', title);

      while (box.firstChild) box.removeChild(box.firstChild);
      box.appendChild(div);
    }
  }

  function runVideos() {
    if (!im) return;
    buildVideos();
    var v = {};
    ['de', 'en', 'it'].forEach(function (l) {
      v[l] = { notice: TEXTS[l].vNotice, loadBtn: TEXTS[l].vLoad, loadAllBtn: TEXTS[l].vLoadAll };
    });
    im.run({
      currLang: LANG,
      // clic su "YouTube immer erlauben" dentro il video: aggiorna anche il consenso generale
      onChange: function (p) {
        if (p.eventSource.type === 'click' && window.CookieConsent) {
          var cur = window.CookieConsent.getUserPreferences().acceptedServices.media || [];
          window.CookieConsent.acceptService(cur.concat(p.changedServices), 'media');
        }
      },
      services: {
        youtube: {
          // nessuna miniatura da YouTube: caricarla manderebbe dati a Google prima del consenso
          embedUrl: 'https://www.youtube-nocookie.com/embed/{data-id}',
          iframe: { allow: 'accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen;' },
          cookie: { name: 'cc_youtube', path: '/', samesite: 'lax' },
          languages: v
        }
      }
    });
  }

  /* ---------- Google Analytics: aggiornamento del Consent Mode ---------- */
  function syncGtag() {
    if (typeof window.gtag !== 'function') return;
    var ok = window.CookieConsent.acceptedCategory('analytics');
    window.gtag('consent', 'update', { analytics_storage: ok ? 'granted' : 'denied' });
  }

  /* ---------- Avvio ---------- */
  function start() {
    if (!window.CookieConsent) return;
    runVideos();

    var translations = {};
    ['de', 'en', 'it'].forEach(function (l) { translations[l] = translation(TEXTS[l], l); });

    window.CookieConsent.run({
      revision: REVISION,
      hideFromBots: true,
      disablePageInteraction: false,
      cookie: { name: 'cc_cookie', expiresAfterDays: 182, sameSite: 'Lax' },
      guiOptions: {
        consentModal: { layout: 'box', position: 'bottom left', equalWeightButtons: true, flipButtons: false },
        preferencesModal: { layout: 'box', equalWeightButtons: true, flipButtons: false }
      },
      categories: {
        necessary: { enabled: true, readOnly: true },
        analytics: {
          autoClear: {
            cookies: [{ name: /^_ga/ }],
            reloadPage: true
          }
        },
        media: {
          services: {
            youtube: {
              label: 'YouTube',
              onAccept: function () { if (im) im.acceptService('youtube'); },
              onReject: function () { if (im) im.rejectService('youtube'); }
            }
          }
        }
      },
      onConsent: syncGtag,
      onChange: syncGtag,
      language: {
        default: 'de',
        autoDetect: 'document',
        translations: translations
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
