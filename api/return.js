// api/return.js — Saferpay riporta qui il browser dopo il pagamento.
//
// L'indirizzo contiene l'id dell'ordine firmato (?o=...&s=...), come consiglia Saferpay
// (niente sessione via cookie per riconoscere chi torna). Il token Saferpay si ritrova nel
// database (o, se il database non c'e', nel cookie di riserva).
// Poi: Assert, Capture se serve, email (se la notifica non le ha gia' mandate), e redirect a
//   donazioni -> RETURN_PAGE_URL          (pagina "Danke")
//   soci      -> MEMBER_RETURN_PAGE_URL   (pagina "Willkommen")
// con ?status=success|incomplete|error.

const config = require('../lib/config');
const secure = require('../lib/secure');
const saferpay = require('../lib/saferpay');
const orders = require('../lib/orders');
const { parseCookies, redirect, query } = require('../lib/http');

// Vecchi cookie del flusso precedente (pagamenti avviati prima di questo aggiornamento).
const LEGACY_CLEAR = [
    'oa_donation_token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    'oa_donation_lang=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
];

async function legacy(req, res) {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies.oa_donation_token;
    const lang = config.normalizeLang(cookies.oa_donation_lang);
    if (!token) {
        console.warn('Return: nessun ordine nell\'indirizzo e nessun cookie');
        redirect(res, orders.landingUrl('donation', lang, 'error'), LEGACY_CLEAR);
        return;
    }
    let status = 'error';
    try {
        const a = await saferpay.assert(token);
        let s = a.Transaction && a.Transaction.Status;
        if (s === 'AUTHORIZED' && a.Transaction.Id) {
            const c = await saferpay.capture(a.Transaction.Id);
            s = (c.Transaction && c.Transaction.Status) || c.Status;
        }
        status = s === 'CAPTURED' ? 'success' : s === 'PENDING' ? 'incomplete' : 'error';
    } catch (err) {
        console.error('Return (vecchio flusso):', err.name, err.message);
        status = ['TRANSACTION_ABORTED', 'TRANSACTION_NOT_STARTED'].includes(err.name) ? 'incomplete' : 'error';
    }
    redirect(res, orders.landingUrl('donation', lang, status), LEGACY_CLEAR);
}

module.exports = async (req, res) => {
    const q = query(req);
    const orderId = String(q.o || '');
    const sig = String(q.s || '');

    if (!orderId) { await legacy(req, res); return; }

    const type = orders.typeFromOrderId(orderId);
    if (!orders.isOrderId(orderId) || !secure.verify(orderId, sig)) {
        console.warn('Return: id ordine o firma non validi', orderId);
        redirect(res, orders.landingUrl(type, 'de', 'error'));
        return;
    }

    const clear = [orders.clearCookie(orderId)];
    let record = null;
    try {
        record = await orders.loadOrder(orderId, req);
    } catch (err) {
        console.error('Return: lettura ordine fallita', err.message);
    }
    if (!record) {
        console.error(`Return: ordine ${orderId} non trovato (database e cookie)`);
        redirect(res, orders.landingUrl(type, 'de', 'error'), clear);
        return;
    }

    const result = await orders.finalizeOrder({ orderId, record, req, source: 'return' });
    const lang = result.ctx ? result.ctx.lang : 'de';
    console.log(`Return ${orderId}: ${result.status}`);
    redirect(res, orders.landingUrl(type, lang, result.status), clear);
};
