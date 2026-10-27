# oa-spenden — donazioni Orchestra Aurea (Saferpay + Webflow)

Backend serverless su Vercel (`spenden.orchestra-aurea.ch`) e form di donazione
che viene caricato dal sito Webflow.

```
api/session.js          avvia il pagamento (Saferpay Initialize) -> URL di pagamento
api/return.js           al ritorno da Saferpay: Assert + Capture -> redirect alla pagina "Danke"
lib/newsletter.js       iscrizione Mailchimp con double opt-in (NON ancora testata)
public/donation-form.js il form (popup a schermata unica), servito su /donation-form.js
test/local-preview.html anteprima locale con i bottoni di prova
.env.example            variabili d'ambiente da impostare su Vercel
```

## Come funziona

1. L'utente clicca un bottone con `data-oa-donate="PULSE|FLOW|RESONANCE|ECHO"` sulla pagina Spenden.
2. Il popup (una sola schermata): importo, dati personali, newsletter, testi Saferpay, termini, pagamento.
3. `donation-form.js` chiama `POST /api/session`. Il server ricontrolla minimi e dati e chiama Saferpay.
4. L'utente paga su Saferpay, che lo riporta su `/api/return`.
5. `return.js` verifica e incassa, poi manda l'utente a `.../{lang}/danke?status=success|incomplete|error`.

Livelli: il livello dipende dall'importo, non dal bottone da cui si parte. Da CHF 100 PULSE,
da 500 FLOW, da 1000 RESONANCE, sotto 100 ECHO (minimo assoluto CHF 1). Se l'utente scrive nel
campo libero un importo di un altro livello, sotto il campo compare un avviso ("passi al livello
FLOW…", "la donazione diventa ECHO…") e il sottotitolo del popup cambia. Il server ricalcola il
livello dall'importo e ignora quello inviato dal browser. Le soglie stanno in due punti, da
tenere uguali: `public/donation-form.js` e `api/session.js`.

Le cifre rapide sono minimo, +50, +100, +150 del livello di partenza (ECHO: solo campo libero).
Il tetto tecnico è `MAX_DONATION_CHF` (default 100'000), da confermare con Saferpay e Fausto.

## Pubblicazione

1. Copia questi file nella cartella del repo e fai commit + push su `main`: Vercel pubblica da solo.
2. Su Vercel, Settings → Environment Variables: imposta le variabili di `.env.example`.
   Le chiavi LIVE solo in "Production".
3. Controlla che `https://spenden.orchestra-aurea.ch/donation-form.js` si apra nel browser.

## Collegamento a Webflow

**Nel Designer, sulla pagina Spenden**

- Per ogni bottone: Element settings → Custom attributes → nome `data-oa-donate`, valore
  `PULSE`, `FLOW`, `RESONANCE` oppure `ECHO` ("Freier Betrag"). Il bottone resta un link `#`.
- Un solo Code Embed (in fondo alla pagina):

```html
<script src="https://spenden.orchestra-aurea.ch/donation-form.js"
        data-terms-de="/de/agb"
        data-terms-en="/en/agb"
        data-terms-it="/it/agb"
        defer></script>
```

Gli URL dei termini vanno sostituiti con quelli reali delle tre pagine. Se le tre lingue
usano lo stesso indirizzo si possono togliere. La pagina "Danke" deve caricare lo stesso
script (serve a svuotare la bozza dopo un pagamento riuscito).

**Titolo del form e link "Cambia piano"**: il titolo ("Piano: FLOW") sta sopra il riquadro colorato,
con accanto il link per tornare alla pagina Spenden e scegliere un altro piano (`/de|en|it/spenden`
per default; si cambia con `data-back-de`, `data-back-en`, `data-back-it`). I dati gia' inseriti
restano (bozza nel browser); l'importo no se il piano cambia.

**Pagina "Danke"** (tre lingue): legge `?status=` dall'indirizzo e mostra il messaggio giusto
(`success`, `incomplete`, `error`).

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
