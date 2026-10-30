// lib/orders.js — ciclo di vita di un pagamento (donazione o quota sociale).
//
//  startPayment   -> Saferpay Initialize; salva token + dati cifrati (database, o cookie di riserva)
//  finalizeOrder  -> chiamato sia dal ritorno del browser (api/return) sia dalla notifica di
//                    Saferpay (api/notify): Assert, Capture se serve, poi le email.
//                    Le due chiamate possono arrivare quasi insieme: Saferpay incassa una volta
//                    sola (la seconda Capture risponde "gia' incassato") e ogni email e'
//                    "prenotata" nel database prima di partire, quindi parte una volta sola.

const crypto = require('crypto');
const config = require('./config');
const secure = require('./secure');
const store = require('./store');
const saferpay = require('./saferpay');
const brevo = require('./brevo');
const mails = require('./mails');
const newsletter = require('./newsletter');
const { parseCookies, baseUrl } = require('./http');

const ORDER_TTL = 6 * 24 * 3600;      // Assert e' possibile fino a 120 ore dopo l'avvio
const DONE_TTL = 60 * 24 * 3600;      // ricordo delle email gia' partite
const COOKIE_PREFIX = 'oa_o_';
const ORDER_ID = /^OA[DM]-\d{8}-[A-F0-9]{8}$/;

function newOrderId(type) {
    const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(new Date()).replace(/-/g, '');
    return `OA${type === 'member' ? 'M' : 'D'}-${d}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function isOrderId(value) {
    return ORDER_ID.test(String(value || ''));
}

function typeFromOrderId(orderId) {
    return String(orderId || '').startsWith('OAM-') ? 'member' : 'donation';
}

// ---- Avvio ----------------------------------------------------------------------------

// ctx: { type, lang, amount, level?, year?, person:{...}, newsletter }
// Restituisce { redirectUrl, cookies } (cookies solo se il database non c'e' o non risponde).
async function startPayment(req, { ctx, description, billingAddress }) {
    const orderId = newOrderId(ctx.type);
    const sig = secure.sign(orderId);
    const base = baseUrl(req);
    const fullCtx = Object.assign({}, ctx, { orderId, createdAt: new Date().toISOString() });

    const data = await saferpay.initialize({
        orderId,
        amountCents: Math.round(ctx.amount * 100),
        description,
        lang: ctx.lang,
        returnUrl: `${base}/api/return?o=${orderId}&s=${sig}`,
        notifyUrl: store.enabled() ? `${base}/api/notify?o=${orderId}&s=${sig}` : null,
        billingAddress
    });
    if (!data || !data.RedirectUrl || !data.Token) {
        throw new saferpay.SaferpayError('Initialize senza RedirectUrl/Token', { raw: data });
    }

    const record = { token: data.Token, ctx: secure.encrypt(fullCtx) };
    let saved = false;
    if (store.enabled()) {
        try {
            await store.setJson(`order:${orderId}`, record, ORDER_TTL);
            saved = true;
        } catch (err) {
            console.error('Database non raggiungibile, uso il cookie di riserva:', err.message);
        }
    }
    const cookies = saved ? [] : [
        `${COOKIE_PREFIX}${orderId}=${record.token}~${record.ctx}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=7200`
    ];
    console.log(`Pagamento avviato ${orderId} (${ctx.type}, ${ctx.amount} CHF, ${saved ? 'database' : 'cookie'})`);
    return { orderId, redirectUrl: data.RedirectUrl, cookies };
}

// ---- Lettura ----------------------------------------------------------------------------

async function loadOrder(orderId, req) {
    if (store.enabled()) {
        try {
            const rec = await store.getJson(`order:${orderId}`);
            if (rec && rec.token) return rec;
        } catch (err) {
            console.error('Lettura ordine dal database fallita:', err.message);
            if (!req) throw Object.assign(err, { transient: true });
        }
    }
    if (req) {
        const raw = parseCookies(req.headers.cookie)[`${COOKIE_PREFIX}${orderId}`];
        if (raw && raw.includes('~')) {
            const i = raw.indexOf('~');
            return { token: raw.slice(0, i), ctx: raw.slice(i + 1) };
        }
    }
    return null;
}

function clearCookie(orderId) {
    return `${COOKIE_PREFIX}${orderId}=; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

// ---- Conclusione ------------------------------------------------------------------------

const INCOMPLETE_ERRORS = ['TRANSACTION_ABORTED', 'TRANSACTION_NOT_STARTED'];

function txStatus(data) {
    return (data && data.Transaction && data.Transaction.Status) || (data && data.Status) || '';
}

// Restituisce { status: 'success'|'incomplete'|'error', ctx, retry }
//   retry = true se qualcosa e' fallito per un motivo temporaneo (la notifica risponde 500
//   e Saferpay riprova piu' tardi).
async function finalizeOrder({ orderId, record, req, source }) {
    const ctx = secure.decrypt(record.ctx);
    if (!ctx || ctx.orderId !== orderId) {
        console.error(`${source}: dati dell'ordine ${orderId} illeggibili`);
        return { status: 'error', ctx: null, retry: false };
    }

    let tx;
    try {
        tx = await saferpay.assert(record.token);
    } catch (err) {
        console.error(`${source}: Assert ${orderId} fallita`, err.name, err.message);
        if (INCOMPLETE_ERRORS.includes(err.name)) return { status: 'incomplete', ctx, retry: false };
        return { status: 'error', ctx, retry: Boolean(err.transient) };
    }

    let status = txStatus(tx);
    const transactionId = tx.Transaction && tx.Transaction.Id;

    if (status === 'AUTHORIZED' && transactionId) {
        try {
            const cap = await saferpay.capture(transactionId);
            status = txStatus(cap) || 'CAPTURED';
            console.log(`${source}: Capture ${orderId} -> ${status}`);
        } catch (err) {
            // Di solito: l'altra chiamata (ritorno o notifica) ha appena incassato. Si rilegge lo stato.
            console.warn(`${source}: Capture ${orderId} non eseguita (${err.name}), rileggo lo stato`);
            try {
                tx = await saferpay.assert(record.token);
                status = txStatus(tx);
            } catch (err2) {
                console.error(`${source}: seconda Assert ${orderId} fallita`, err2.name, err2.message);
                return { status: 'error', ctx, retry: Boolean(err.transient || err2.transient) };
            }
        }
    }

    if (status === 'CAPTURED') {
        // Controllo di coerenza: importo incassato = importo deciso dal server.
        const paid = tx.Transaction && tx.Transaction.Amount && Number(tx.Transaction.Amount.Value);
        if (paid && paid !== Math.round(ctx.amount * 100)) {
            console.error(`ATTENZIONE ${orderId}: importo incassato ${paid} diverso da quello atteso ${ctx.amount * 100}`);
        }
        const followUps = await runFollowUps({ orderId, ctx, tx, req, source });
        return { status: 'success', ctx, retry: !followUps.ok };
    }
    if (status === 'PENDING') return { status: 'incomplete', ctx, retry: false };
    console.warn(`${source}: ${orderId} stato finale ${status || '(vuoto)'}`);
    return { status: 'error', ctx, retry: false };
}

// ---- Email dopo l'incasso ----------------------------------------------------------------

async function once(orderId, task, fn) {
    const key = `done:${task}:${orderId}`;
    if (store.enabled()) {
        let claimed;
        try {
            claimed = await store.claim(key, DONE_TTL);
        } catch (err) {
            console.error(`Database non raggiungibile per ${task} ${orderId}:`, err.message);
            return false; // si riprova con la prossima notifica
        }
        if (!claimed) return true; // gia' fatto (o in corso) da un'altra chiamata
        try {
            await fn();
            return true;
        } catch (err) {
            console.error(`${task} ${orderId} fallito:`, err.message);
            await store.release(key).catch(() => {});
            return false;
        }
    }
    try {
        await fn();
        return true;
    } catch (err) {
        console.error(`${task} ${orderId} fallito:`, err.message);
        return false;
    }
}

async function runFollowUps({ orderId, ctx, tx, req }) {
    if (!brevo.configured()) {
        console.error(`BREVO_API_KEY mancante: nessuna email per ${orderId}`);
        return { ok: true }; // inutile far riprovare Saferpay finche' manca la configurazione
    }
    const paidAt = new Date();
    const isMember = ctx.type === 'member';
    const statutesUrl = isMember ? config.statutesUrl(ctx.lang) : '';
    const person = ctx.person;
    const from = { email: config.mail.from(), name: config.mail.fromName() };
    const name = mails.fullName(person);

    const tasks = [
        once(orderId, 'person', async () => {
            const mail = isMember
                ? mails.memberEmail({ ctx, tx, paidAt, statutesUrl })
                : mails.donationEmail({ ctx, tx, paidAt });
            const attachments = isMember && statutesUrl && /\.pdf(\?|$)/i.test(statutesUrl)
                ? [{ url: statutesUrl, name: 'Statuten-Orchestra-Aurea.pdf' }]
                : undefined;
            await brevo.sendEmail({
                from,
                to: [{ email: person.email, name }],
                replyTo: { email: config.mail.admin(), name: config.mail.fromName() },
                subject: mail.subject,
                html: mail.html,
                text: mail.text,
                attachments,
                tags: [isMember ? 'oa-member' : 'oa-donation']
            });
        }),
        once(orderId, 'admin', async () => {
            const mail = mails.adminEmail({ ctx, tx, paidAt, statutesUrl, newsletterRequested: !!ctx.newsletter });
            await brevo.sendEmail({
                from,
                to: [{ email: config.mail.admin() }],
                replyTo: { email: person.email, name },
                subject: mail.subject,
                html: mail.html,
                text: mail.text,
                tags: [isMember ? 'oa-member-admin' : 'oa-donation-admin']
            });
        })
    ];
    if (ctx.newsletter) {
        tasks.push(once(orderId, 'newsletter', () => newsletter.requestOptIn({
            email: person.email,
            firstName: person.firstName,
            lastName: person.lastName,
            lang: ctx.lang,
            source: ctx.type,
            base: req ? baseUrl(req) : 'https://spenden.orchestra-aurea.ch'
        })));
    }
    const results = await Promise.all(tasks);
    return { ok: results.every(Boolean) };
}

// ---- Pagina di destinazione --------------------------------------------------------------

function landingUrl(type, lang, status) {
    const tpl = type === 'member' ? config.memberReturnPageUrl() : config.returnPageUrl();
    const base = tpl.replace('{lang}', config.normalizeLang(lang));
    return `${base}${base.includes('?') ? '&' : '?'}status=${encodeURIComponent(status)}`;
}

module.exports = {
    startPayment, loadOrder, finalizeOrder, clearCookie, landingUrl,
    isOrderId, typeFromOrderId, newOrderId, COOKIE_PREFIX
};
