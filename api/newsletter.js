// api/newsletter.js — newsletter con double opt-in (Brevo).
//
// POST JSON { email, lang, website }  dal form newsletter del footer (newsletter-footer.js):
//      manda l'email di conferma. "website" e' un campo trappola per i bot (deve restare vuoto).
// GET  ?t=...   pagina "Bitte bestätigen" con un bottone (il link dell'email porta qui).
// POST t=...    (dal bottone) conferma: il contatto entra nella lista newsletter di Brevo.

const config = require('../lib/config');
const store = require('../lib/store');
const secure = require('../lib/secure');
const brevo = require('../lib/brevo');
const mails = require('../lib/mails');
const newsletter = require('../lib/newsletter');
const { setCors, fail, isValidEmail, clientIp, baseUrl, query } = require('../lib/http');

const LIMIT_IP_PER_HOUR = 5;
const LIMIT_EMAIL_PER_DAY = 3;

function sendPage(res, status, lang, opts) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.status(status).send(mails.page(lang, opts));
}

// Legge il token del link; se non vale (o e' scaduto) mostra la pagina "Link ungültig".
function readTokenOrPage(res, token) {
    const r = newsletter.readToken(token);
    if (!r.ok) {
        const t = mails.texts('de').pages;
        sendPage(res, 400, 'de', { title: t.invalidTitle, text: t.invalidText, siteLink: true });
        return null;
    }
    return r.payload;
}

async function subscribe(req, res) {
    const body = req.body || {};
    const lang = config.normalizeLang(body.lang);
    const email = String(body.email || '').trim();
    if (body.website) { res.status(200).json({ ok: true }); return; } // bot: si finge un successo
    if (!isValidEmail(email)) { fail(res, 400, 'Invalid email.', { code: 'INVALID_EMAIL' }); return; }
    if (!brevo.configured()) { fail(res, 500, 'Server configuration incomplete.', { code: 'CONFIG' }); return; }

    if (store.enabled()) {
        try {
            const ipHits = await store.hit(`rl:nl:ip:${secure.hash(clientIp(req))}`, 3600);
            const mailHits = await store.hit(`rl:nl:em:${secure.hash(email)}`, 86400);
            if (ipHits > LIMIT_IP_PER_HOUR || mailHits > LIMIT_EMAIL_PER_DAY) {
                console.warn('Newsletter: troppe richieste', ipHits, mailHits);
                fail(res, 429, 'Too many requests.', { code: 'RATE_LIMIT' });
                return;
            }
        } catch (err) {
            console.error('Newsletter: limite non verificabile (database)', err.message);
        }
    }

    try {
        await newsletter.requestOptIn({ email, lang, source: 'footer', base: baseUrl(req) });
        res.status(200).json({ ok: true });
    } catch (err) {
        console.error('Newsletter: invio conferma fallito', err.message);
        fail(res, 502, 'Could not send confirmation.', { code: 'SEND_FAILED' });
    }
}

module.exports = async (req, res) => {
    setCors(req, res, { methods: 'GET, POST, OPTIONS', credentials: false });
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }

    const base = baseUrl(req);
    const q = query(req);

    if (req.method === 'GET') {
        const payload = readTokenOrPage(res, String(q.t));
        if (!payload) return;
        const t = mails.texts(payload.lg).pages;
        sendPage(res, 200, payload.lg, {
            title: t.confirmTitle,
            text: t.confirmText(payload.e),
            form: { action: `${base}/api/newsletter`, token: String(q.t), button: t.confirmButton }
        });
        return;
    }

    if (req.method !== 'POST') { fail(res, 405, 'Method not allowed'); return; }

    const body = req.body || {};
    if (typeof body === 'object' && body.t) {
        const payload = readTokenOrPage(res, String(body.t));
        if (!payload) return;
        const t = mails.texts(payload.lg).pages;
        try {
            await newsletter.confirm(payload);
            console.log('Newsletter: iscrizione confermata', secure.hash(payload.e));
            sendPage(res, 200, payload.lg, { title: t.doneTitle, text: t.doneText, siteLink: true });
        } catch (err) {
            console.error('Newsletter: conferma fallita', err.message);
            sendPage(res, 502, payload.lg, { title: t.errorTitle, text: t.errorText, siteLink: true });
        }
        return;
    }

    await subscribe(req, res);
};
