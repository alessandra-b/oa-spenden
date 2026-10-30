// api/status.js — controllo dello stato del backend (TEMPORANEO, per la messa in funzione).
// https://spenden.orchestra-aurea.ch/api/status
// Non mostra chiavi ne' dati di persone: solo se le variabili ci sono, se Brevo accetta la
// chiave, quali mittenti sono registrati in Brevo e se il database risponde.
// Facoltativo: ?send=indirizzo@orchestra-aurea.ch manda un'email di prova a quell'indirizzo
// (solo indirizzi @orchestra-aurea.ch, per evitare abusi).

const config = require('../lib/config');
const brevo = require('../lib/brevo');
const store = require('../lib/store');

const has = (name) => Boolean(process.env[name] && String(process.env[name]).trim());

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const out = {
        time: new Date().toISOString(),
        env: {
            SAFERPAY_ENV: process.env.SAFERPAY_ENV || '(non impostata: test)',
            BREVO_API_KEY: has('BREVO_API_KEY'),
            OA_SECRET: has('OA_SECRET'),
            MAIL_FROM_set: has('MAIL_FROM'),
            MAIL_TO_ADMIN_set: has('MAIL_TO_ADMIN'),
            MAIL_FROM_NEWSLETTER_set: has('MAIL_FROM_NEWSLETTER'),
            BREVO_NEWSLETTER_LIST_ID_set: has('BREVO_NEWSLETTER_LIST_ID')
        },
        mail: {
            from: config.mail.from(),
            newsletterFrom: config.mail.newsletterFrom(),
            admin: config.mail.admin()
        },
        site: {
            allowedOrigins: config.allowedOrigins(),
            returnPage: config.returnPageUrl(),
            memberReturnPage: config.memberReturnPageUrl(),
            statutes: config.statutesUrl('de') || null
        }
    };

    try {
        await brevo.call('GET', '/account');
        out.brevo = { key: 'ok' };
    } catch (err) {
        out.brevo = { key: 'ERRORE', message: err.message };
    }
    if (out.brevo.key === 'ok') {
        try {
            const data = await brevo.call('GET', '/senders');
            const senders = (data && data.senders) || [];
            out.brevo.senders = senders.map((s) => ({ email: s.email, active: s.active }));
            const find = (e) => senders.find((s) => String(s.email).toLowerCase() === String(e).toLowerCase());
            out.brevo.fromRegistered = Boolean(find(out.mail.from));
            out.brevo.newsletterFromRegistered = Boolean(find(out.mail.newsletterFrom));
        } catch (err) {
            out.brevo.senders = 'ERRORE: ' + err.message;
        }
    }

    if (store.enabled()) {
        try {
            await store.setJson('status:ping', { t: Date.now() }, 60);
            out.redis = 'ok';
        } catch (err) {
            out.redis = 'ERRORE: ' + err.message;
        }
    } else {
        out.redis = 'non configurato';
    }

    const to = String((req.query && req.query.send) || '').trim();
    if (to) {
        if (!/^[^\s@]+@orchestra-aurea\.ch$/i.test(to)) {
            out.testEmail = 'solo indirizzi @orchestra-aurea.ch';
        } else {
            try {
                const r = await brevo.sendEmail({
                    from: { email: config.mail.from(), name: config.mail.fromName() },
                    to: [{ email: to }],
                    subject: 'Test Orchestra Aurea (spenden.orchestra-aurea.ch)',
                    html: '<p>Email di prova inviata da /api/status.</p>',
                    text: 'Email di prova inviata da /api/status.',
                    tags: ['oa-status']
                });
                out.testEmail = { sent: true, messageId: r && r.messageId };
            } catch (err) {
                out.testEmail = { sent: false, message: err.message };
            }
        }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(out, null, 2));
};
