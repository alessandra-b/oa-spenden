// api/notify.js — notifica server-to-server di Saferpay (SuccessNotifyUrl).
//
// Saferpay chiama questo indirizzo con un GET, senza dati, quando un pagamento e' riuscito,
// anche se la persona chiude il browser prima di tornare sul sito. Si ritrova il token
// nel database, si incassa (Capture) se il ritorno non l'ha ancora fatto e si mandano le email.
// Risposta 200 = fatto; qualsiasi altra risposta = Saferpay riprova (fino a 6 volte, a
// intervalli crescenti fino a un giorno). Per questo si risponde 500 solo per errori temporanei.
// Attiva solo se il database (Upstash Redis) e' collegato.

const secure = require('../lib/secure');
const store = require('../lib/store');
const orders = require('../lib/orders');
const { query } = require('../lib/http');

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const q = query(req);
    const orderId = String(q.o || '');
    if (!orders.isOrderId(orderId) || !secure.verify(orderId, String(q.s || ''))) {
        console.warn('Notify: id ordine o firma non validi', orderId);
        res.status(400).send('invalid');
        return;
    }
    if (!store.enabled()) {
        res.status(200).send('ok (no store)');
        return;
    }

    let record;
    try {
        record = await orders.loadOrder(orderId, null);
    } catch (err) {
        console.error('Notify: database non raggiungibile', err.message);
        res.status(500).send('retry');
        return;
    }
    if (!record) {
        console.warn(`Notify: ordine ${orderId} non trovato (scaduto?)`);
        res.status(200).send('unknown');
        return;
    }

    const result = await orders.finalizeOrder({ orderId, record, req, source: 'notify' });
    console.log(`Notify ${orderId}: ${result.status}${result.retry ? ' (da riprovare)' : ''}`);
    if (result.retry) {
        res.status(500).send('retry');
        return;
    }
    res.status(200).send('ok');
};
