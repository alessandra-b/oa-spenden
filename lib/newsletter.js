// lib/newsletter.js
//
// Iscrizione alla newsletter con double opt-in tramite Mailchimp.
// ATTENZIONE: NON ancora testata con un account Mailchimp reale.
//
// Con status_if_new = "pending" Mailchimp invia da solo l'email di conferma;
// l'indirizzo diventa "subscribed" solo dopo il click. Se l'indirizzo e' gia' in
// lista, la chiamata non cambia il suo stato.
//
// Variabili d'ambiente (Vercel):
//   MAILCHIMP_API_KEY       es. xxxxxxxx-us21   (il suffisso dopo il trattino e' il datacenter)
//   MAILCHIMP_AUDIENCE_ID   id della audience
// Se mancano, la funzione non fa nulla e scrive un avviso nei log.

const crypto = require('crypto');

async function subscribeNewsletter({ email, firstName, lastName, lang }) {
    const apiKey = process.env.MAILCHIMP_API_KEY;
    const audienceId = process.env.MAILCHIMP_AUDIENCE_ID;

    if (!apiKey || !audienceId || !apiKey.includes('-')) {
        console.warn('Newsletter richiesta ma Mailchimp non e\' configurato: iscrizione saltata');
        return 'skipped';
    }

    const dc = apiKey.split('-').pop();
    const hash = crypto.createHash('md5').update(email.toLowerCase()).digest('hex');
    const auth = Buffer.from(`anystring:${apiKey}`).toString('base64');

    const response = await fetch(`https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/members/${hash}`, {
        method: 'PUT',
        headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            email_address: email,
            status_if_new: 'pending',
            language: lang,
            merge_fields: { FNAME: firstName, LNAME: lastName }
        })
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Mailchimp ${response.status}: ${text.slice(0, 300)}`);
    }
    return 'sent';
}

module.exports = { subscribeNewsletter };
