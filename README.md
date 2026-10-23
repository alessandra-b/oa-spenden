# oa-spenden — donazioni Orchestra Aurea (Saferpay + Webflow)

Backend serverless su Vercel (`spenden.orchestra-aurea.ch`) e form di donazione
che compare in una **pagina dedicata** del sito Webflow (niente pop-up).

```
api/session.js            avvia il pagamento (Saferpay Initialize) -> URL di pagamento
api/return.js             al ritorno da Saferpay: Assert + Capture -> redirect alla pagina "Danke"
lib/newsletter.js         iscrizione Mailchimp con double opt-in (NON ancora testata)
public/donation-form.js   il form (schermata unica, inline), servito su /donation-form.js
public/test-form.html     pagina di prova sullo stesso dominio dell'API (test completo)
public/test-danke.html    finta pagina "Danke" per il test
scripts/build-embed.js    genera dist/embed-spenden.html (form per intero, da incollare in Webflow)
test/local-preview.html   anteprima locale, solo grafica (il pagamento non parte)
.env.example              variabili d'ambiente da impostare su Vercel
```

## Come funziona

1. Sulla pagina Spenden i quattro bottoni sono **normali link Webflow** alla pagina del form:
   `.../spenden/formular?level=PULSE` (poi `FLOW`, `RESONANCE`, `ECHO`). Nessuno script serve lì.
2. La pagina del form contiene un elemento `<div data-oa-donation-form></div>`: il form compare lì dentro,
   con font e colori del sito. Una schermata: importo, dati personali, newsletter, testi Saferpay, termini, pagamento.
3. `donation-form.js` chiama `POST /api/session`. Il server ricontrolla minimi e dati e chiama Saferpay.
4. L'utente paga su Saferpay, che lo riporta su `/api/return`.
5. `return.js` verifica e incassa, poi manda l'utente a `.../{lang}/danke?status=success|incomplete|error`.

Livelli: il livello dipende dall'importo, non dal link da cui si parte. Da CHF 100 PULSE,
da 500 FLOW, da 1000 RESONANCE, sotto 100 ECHO (minimo assoluto CHF 1). Se l'utente scrive nel
campo libero un importo di un altro livello, sotto il campo compare un avviso ("passi al livello
FLOW…", "la donazione diventa ECHO…") e l'etichetta "Piano" cambia. Il server ricalcola il
livello dall'importo e ignora quello inviato dal browser. Le soglie stanno in due punti, da
tenere uguali: `public/donation-form.js` e `api/session.js`.

Le cifre rapide sono minimo, +50, +100, +150 del livello di partenza (ECHO: solo campo libero).
Il tetto tecnico è `MAX_DONATION_CHF` (default 100'000), da confermare con Saferpay e Fausto.

## Perché non i form nativi di Webflow

La pagina, il layout, i testi e i bottoni sono nativi Webflow e si modificano nel Designer.
Solo il **form** è codice nostro: i form nativi di Webflow possono solo inviare i dati a Webflow
(email, CMS) e non sanno chiamare Saferpay, né calcolare il livello dall'importo, né mostrare
gli avvisi di cambio livello. Per questo il form è uno script. Lo stile però è quello del sito:
usa le variabili di Webflow (`--color--ink`, `--color--gold-deep`, `--color--sand`, `--color--paper`,
`--font-family`, le scale tipografiche), quindi se cambi un colore nel Designer cambia anche il form.

## Pubblicazione del backend

1. Copia questi file nella cartella del repo e fai commit + push su `main`: Vercel pubblica da solo.
2. Su Vercel, Settings → Environment Variables: imposta le variabili di `.env.example`.
   Le chiavi LIVE solo in "Production".
3. Controlla che `https://spenden.orchestra-aurea.ch/donation-form.js` si apra nel browser.

## Due modi di inserire il form in Webflow

Nella pagina del form (una per lingua, con elementi nativi Webflow attorno) si usa **uno** di questi:

**A. Script collegato (consigliato).** Un Code Embed:

```html
<div data-oa-donation-form></div>
<script src="https://spenden.orchestra-aurea.ch/donation-form.js"
        data-terms-de="/de/agb" data-terms-en="/en/agb" data-terms-it="/it/agb" defer></script>
```

Vantaggio: una correzione al form si pubblica su Vercel e vale per tutte le pagine e lingue.

**B. Codice incollato.** `node scripts/build-embed.js` crea `dist/embed-spenden.html`
(circa 27'000 caratteri, limite Webflow 50'000): si incolla per intero in un Code Embed.
Funziona senza dipendere dal file su Vercel, ma ogni correzione va re-incollata in ogni pagina/lingua.
Le chiamate di pagamento vanno comunque a Vercel (l'API resta lì).

In entrambi i casi gli URL dei termini vanno sostituiti con quelli reali. La pagina "Danke" deve caricare
lo stesso script (serve a svuotare la bozza dopo un pagamento riuscito); con l'opzione B basta
`<script src="https://spenden.orchestra-aurea.ch/donation-form.js" defer></script>` sulla sola pagina Danke.

**Pagina "Danke"** (tre lingue): legge `?status=` dall'indirizzo e mostra il messaggio giusto
(`success`, `incomplete`, `error`).

## Come vederlo e provarlo

- **Solo grafica, subito:** apri `test/local-preview.html` nel browser (doppio clic). Link in alto per cambiare livello.
  Il bottone di pagamento non funziona (non c'è un server).
- **Prova completa con pagamento di test:** su Vercel fai un deploy di anteprima (branch diverso da `main`),
  con le variabili Saferpay di test e `RETURN_PAGE_URL=https://<indirizzo-anteprima>/test-danke.html?lang={lang}`.
  Poi apri `https://<indirizzo-anteprima>/test-form.html` (livello e lingua si cambiano dai link in alto) e paga
  con le carte di test Saferpay. Torni su `test-danke.html` con l'esito.
- **Sul sito Webflow:** pagina del form su un dominio `.orchestra-aurea.ch` (es. `neu.orchestra-aurea.ch`) per il
  cookie del token; su `*.webflow.io` il pagamento si avvia ma al ritorno il cookie non c'è.

## Testi

I testi seguono il form attuale. La disposizione cambia: le due frasi su Saferpay (`saferpayInfo`,
`cardStorageInfo`) e `noAdditionalCharges` restano insieme, vicino ai termini e al pagamento.

Correzioni ortografiche rispetto al codice vecchio (da far approvare):

| Lingua | Prima | Dopo |
|---|---|---|
| IT | Citta | Città |
| IT | non memorizza ne processa | non memorizza né processa |
| DE | Waehlen Sie Ihren Beitrag | Wählen Sie Ihren Beitrag |
| DE | Mindestbetrag fuer diese Auswahl | Mindestbetrag für diese Auswahl |
| DE | Fuer Kartenzahlungen fallen keine zusaetzlichen Gebuehren an. | Für Kartenzahlungen fallen keine zusätzlichen Gebühren an. |
| DE | Allgemeinen Geschaeftsbedingungen | Allgemeinen Geschäftsbedingungen |
| DE | Bitte fuellen Sie … / gueltige | Bitte füllen Sie … / gültige |
| DE | Bitte geben Sie mindestens CHF ein 50. (bug: la cifra finiva dopo "ein") | Bitte geben Sie einen Betrag von mindestens CHF 50 ein. |
| IT/EN | frase "almeno CHF" + cifra incollata dal codice | frase completa con {min} |

Testi nuovi (non esistevano, da far approvare): intestazione "Ihre Angaben / I tuoi dati / Your details",
testo della casella newsletter, avviso per importi sopra il tetto e i quattro messaggi sui livelli
(`tierFrom`, `tierUp`, `tierDown`, `tierEcho`, in `LABELS` dentro `donation-form.js`).

## Da fare / da verificare

- [ ] Limite massimo per transazione e minimo reale di CHF 1 sul terminale: chiedere a Saferpay.
- [ ] Mailchimp: creare audience, chiave API, variabili `MAILCHIMP_*`; provare l'iscrizione reale.
- [ ] Test con Visa e Mastercard (finora provato solo TWINT).
- [ ] Il form non chiede il paese: `CountryCode` è sempre `CH`, come nel codice vecchio.
- [ ] Pagine Webflow: Danke, Termini e Condizioni, Privacy (i testi sono nel codice del vecchio sito).
- [ ] Quota associativa nel testo "Mitglied werden" (segnaposto `CHF [XX]`).
