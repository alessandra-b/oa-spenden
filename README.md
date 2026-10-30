# oa-spenden — donazioni, soci e newsletter Orchestra Aurea (Saferpay + Brevo + Webflow)

Backend serverless su Vercel (`spenden.orchestra-aurea.ch`) e i form che compaiono in **pagine dedicate**
del sito Webflow: donazioni (Spenden), iscrizione come socio (Mitglied werden) e newsletter del footer.

```
api/session.js              donazione: controlla i dati e avvia il pagamento Saferpay -> URL di pagamento
api/membership.js           socio: GET = quota/anno/statuti, POST = controlla i dati e avvia il pagamento
api/return.js               ritorno del browser da Saferpay: Assert + Capture, email, redirect a Danke/Willkommen
api/notify.js               notifica server-to-server di Saferpay (stesso lavoro di return.js, anche se il browser non torna)
api/newsletter.js           newsletter: iscrizione (POST), pagina di conferma (GET ?t=), conferma (POST t)
api/yt-thumb.js             anteprime YouTube senza contattare Google (cookie consent)

lib/config.js               tutte le impostazioni (variabili d'ambiente + default)
lib/orders.js               ordini: avvio pagamento, salvataggio, incasso, email (una sola volta per ordine)
lib/saferpay.js             chiamate a Saferpay (Initialize, Assert, Capture)
lib/brevo.js                chiamate a Brevo (email transazionali, contatti newsletter)
lib/mails.js                testi e grafica delle email e delle pagine newsletter (DE / EN / IT)
lib/newsletter.js           double opt-in della newsletter (link firmato valido 7 giorni)
lib/store.js                Redis (Upstash) facoltativo: ordini, "email gia' inviata", limiti anti-abuso
lib/secure.js               cifratura dei dati dell'ordine e firme dei link
lib/http.js, countries.js   aiuti comuni (CORS, cookie, validazioni) e lista dei paesi

public/donation-form.js     form donazioni, servito su /donation-form.js
public/member-form.js       form soci, servito su /member-form.js
public/newsletter-footer.js collega il form newsletter del footer Webflow a Brevo
public/test-form.html       pagina di prova donazioni (stesso dominio dell'API)
public/test-member.html     pagina di prova soci
public/test-danke.html      finta pagina "Danke/Willkommen" per le prove
public/cc/                  cookie consent del sito

test/backend.test.js        test automatici delle function (Saferpay, Brevo e Redis finti)
test/e2e.browser.js         test nel browser (Chromium) di tutti e tre i form, con screenshot in test/screens/
test/e2e-server.js          server locale usato dai test (anche a mano: node test/e2e-server.js)
scripts/build-embed.js      genera dist/embed-spenden.html (form donazioni da incollare in Webflow)
.env.example                variabili d'ambiente da impostare su Vercel
```

## Come funziona un pagamento (donazione o quota socio)

1. La pagina Webflow contiene `<div data-oa-donation-form></div>` oppure `<div data-oa-member-form></div>`
   e lo script corrispondente: il form compare lì dentro, con font e colori del sito.
2. Il form chiama `POST /api/session` (donazione) o `POST /api/membership` (socio). Il server ricontrolla
   tutto (importo, livello, dati, data di nascita, paese…) e chiama Saferpay `PaymentPage/Initialize`.
   La quota socio la decide il server (`MEMBERSHIP_FEE_CHF`), non il browser.
3. I dati dell'ordine (cifrati) e il token Saferpay restano in Redis per 6 giorni
   (senza Redis: in un cookie del dominio `spenden.orchestra-aurea.ch`).
4. La persona paga su Saferpay. Saferpay chiama **prima** `/api/notify` (se c'è Redis) e poi riporta il browser
   su `/api/return`. Entrambi fanno lo stesso lavoro: `Assert`, `Capture`, poi le email.
   Ogni email è "prenotata" in Redis, quindi parte **una sola volta** anche se notify e return arrivano insieme
   o Saferpay ripete la notifica.
5. Il browser finisce su `.../{lang}/danke?status=…` (donazione) o `.../{lang}/willkommen?status=…` (socio),
   con `status` = `success`, `incomplete` (annullato/rifiutato) o `error`.

Gli indirizzi di ritorno e di notifica contengono il numero d'ordine firmato (`?o=…&s=…`): nessuno può
inventarsi un ordine o confermarne uno altrui.

Email dopo un pagamento riuscito (via Brevo):

| Chi | Donazione | Socio |
|---|---|---|
| Persona (lingua del form) | ringraziamento con importo, livello, riferimento | benvenuto con quota, anno, dati, **statuti allegati** (PDF da `STATUTEN_URL`) |
| `MAIL_TO_ADMIN` (sempre in tedesco) | "Neue Spende: CHF … (LIVELLO) von …" | "Neues Mitglied: …" con tutti i dati |
| Newsletter (se spuntata) | email di conferma iscrizione (double opt-in) | idem |

Rispondendo all'avviso admin si scrive direttamente alla persona (Reply-To).
Se l'allegato non si può scaricare, l'email parte comunque senza allegato (con il link agli statuti nel testo).

## Livelli delle donazioni

Il livello dipende dall'importo, non dal link da cui si parte. Da CHF 100 PULSE, da 500 FLOW, da 1000 RESONANCE,
sotto 100 ECHO (minimo assoluto CHF 1). Se nel campo libero si scrive un importo di un altro livello compare un
avviso e l'etichetta "Stufe / Livello / Tier" cambia. Il server ricalcola il livello e ignora quello del browser.
Le soglie stanno in due punti, da tenere uguali: `public/donation-form.js` e `api/session.js`.
Cifre rapide: minimo, +50, +100, +150 del livello di partenza (ECHO: solo campo libero).
Tetto tecnico `MAX_DONATION_CHF` (default 100'000), da confermare con Saferpay e Fausto.

## Soci (Mitglied werden)

- Ammissione automatica: chi compila il form e paga CHF 100 diventa socio per l'anno solare in corso
  (l'anno è quello di Zurigo al momento del pagamento).
- Dati: nome, cognome, via, NPA, località, paese (preselezionato Svizzera), data di nascita (GG/MM/AAAA,
  controllata: niente 31 febbraio né date future), email, telefono facoltativo.
- Due caselle obbligatorie: adesione + statuti, AGB. Una facoltativa: newsletter.
- Se il pagamento non va a buon fine i dati restano nel form (bozza nella sessione del browser, senza le caselle
  dei consensi); dopo il successo la bozza viene cancellata.
- Codice nella pagina Webflow (Code Embed):

```html
<div data-oa-member-form></div>
<script src="https://spenden.orchestra-aurea.ch/member-form.js"
        data-terms-de="/de/agb" data-terms-en="/en/agb" data-terms-it="/it/agb"
        data-privacy-de="/de/datenschutz" data-privacy-en="/en/datenschutz" data-privacy-it="/it/datenschutz"
        defer></script>
```

  Gli attributi `data-*` sono facoltativi (quelli sopra sono i default). Il link "← Zurück" porta a `/{lang}/spenden`
  (si cambia con `data-back-de|en|it`). La pagina **Willkommen** deve caricare lo stesso script
  (svuota la bozza dopo il successo) oppure un piccolo script che cancella `sessionStorage` `oa_member_draft`.

## Newsletter

- **Form del footer Webflow**: resta il form nativo (grafica nel Designer). Lo script `newsletter-footer.js`,
  caricato in tutto il sito (Site settings → Custom code → Footer):

```html
<script src="https://spenden.orchestra-aurea.ch/newsletter-footer.js" defer></script>
```

  intercetta l'invio di `form#wf-form-Newsletter-subscription` (o di qualsiasi form con `data-oa-newsletter`)
  **prima** di Webflow, manda l'indirizzo a `/api/newsletter` e mostra i messaggi nativi di Webflow
  (Success / Error). Quindi il testo di "Success" deve dire di confermare via email.
- **Double opt-in**: Brevo non riceve nulla finché la persona non clicca il link nell'email (mittente
  `MAIL_FROM_NEWSLETTER`) e poi il bottone "Bestätigen" nella pagina che si apre (il doppio passaggio evita che i
  filtri antispam delle aziende confermino da soli aprendo il link).
- Alla conferma il contatto entra nella lista Brevo (`BREVO_NEWSLETTER_LIST_ID`, oppure la lista
  "Newsletter Orchestra Aurea" cercata o creata automaticamente) con nome, cognome e lingua (attributo `SPRACHE`).
- Anti-abuso: campo nascosto anti-bot, massimo 5 richieste all'ora per indirizzo IP e 3 al giorno per email (con Redis).

## Perché non i form nativi di Webflow

Pagine, layout, testi e bottoni sono nativi Webflow e si modificano nel Designer. I form di pagamento sono codice
nostro perché i form nativi possono solo inviare dati a Webflow e non sanno chiamare Saferpay né calcolare livelli.
Lo stile però è quello del sito: usano le variabili di Webflow (`--color--ink`, `--color--gold-deep`, `--color--sand`,
`--color--paper`, `--font-family`, le scale tipografiche), quindi se cambi un colore nel Designer cambia anche il form.
Nessun testo sotto 1rem (16px).

## Pubblicazione del backend

1. Copia i file nella cartella del repo e fai commit + push su `main`: Vercel pubblica da solo.
2. Su Vercel, Settings → Environment Variables: imposta le variabili di `.env.example`
   (le chiavi Saferpay LIVE solo in "Production").
3. Vercel → Storage → **Upstash for Redis** (regione Frankfurt), "Connect" al progetto per tutti gli ambienti:
   crea da solo `KV_REST_API_URL` e `KV_REST_API_TOKEN`. Poi **Redeploy**.
4. Brevo: dominio autenticato, mittenti `info@` e `newsletter@`, Security → Authorised IPs **disattivato**.
5. Controlla che si aprano `https://spenden.orchestra-aurea.ch/member-form.js` e
   `https://spenden.orchestra-aurea.ch/api/membership?lang=de` (deve mostrare quota, anno e link statuti).

## Come provarlo

- **Test automatici (in locale, senza internet):**
  `node --test test/backend.test.js` (19 test delle function) e `node test/e2e.browser.js`
  (7 prove nel browser: form soci DE/IT/EN, errori, pagamento annullato, donazione, newsletter del footer;
  screenshot di form, email e pagine in `test/screens/`). Serve Node 18+ e, per il secondo, Playwright.
- **Anteprima a mano:** `node test/e2e-server.js` e apri `http://localhost:4173/test-member.html`
  (Saferpay e Brevo finti; le email si vedono su `http://localhost:4173/__state`).
- **Prova reale con Saferpay di test:** sul sito `neu.orchestra-aurea.ch` (dominio `.orchestra-aurea.ch`, necessario
  per il cookie quando Redis non c'è) con `SAFERPAY_ENV=test`. Carte di test: Visa 4111 1111 1111 1111 /
  9010 0031 5000 0001, Mastercard 5555 5555 5555 4444 / 9030 0031 5000 0007, scadenza futura qualsiasi, CVC 123.
  TWINT: nell'ambiente di test si apre il simulatore TWINT di Saferpay.

## Testi

I testi dei form seguono il form donazioni attuale. Correzioni ortografiche rispetto al codice vecchio
(Città, né, Wählen, für, Gebühren, Geschäftsbedingungen, füllen, gültige, frase "mindestens CHF {min}")
e testi nuovi (intestazioni, newsletter, avvisi sui livelli, tutto il form soci, tutte le email):
da far approvare. In italiano i form danno del "tu" (come il form donazioni esistente), le email danno del "Lei":
da uniformare quando si decide il registro del sito.

## Da fare / da verificare

Vedi il documento di passaggio consegne del progetto (handoff) per l'elenco completo e aggiornato.
