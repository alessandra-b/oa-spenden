// lib/newsletter.js — iscrizione alla newsletter con double opt-in (Brevo).
//
// 1. requestOptIn: manda alla persona un'email (da newsletter@) con un link firmato, valido 7 giorni.
// 2. Il link apre /api/newsletter?t=...: una pagina chiede di confermare con un bottone
//    (i filtri antispam che "cliccano" i link non confermano niente da soli).
// 3. confirm: il contatto entra nella lista newsletter di Brevo.
// Prima della conferma nessun dato finisce nella lista.

const config = require('./config');
const secure = require('./secure');
const brevo = require('./brevo');
const mails = require('./mails');

const TOKEN_TTL = 7 * 24 * 3600;

async function requestOptIn({ email, firstName, lastName, lang, source, base }) {
    const l = config.normalizeLang(lang);
    const token = secure.signToken({
        e: String(email).trim(),
        f: firstName ? String(firstName).trim() : '',
        l: lastName ? String(lastName).trim() : '',
        lg: l,
        src: source || 'web'
    }, TOKEN_TTL);
    const confirmUrl = `${base}/api/newsletter?t=${encodeURIComponent(token)}`;
    const name = [firstName, lastName].filter(Boolean).join(' ').trim();
    const mail = mails.newsletterEmail({ lang: l, name, firstName: firstName ? String(firstName).trim() : '', confirmUrl });
    await brevo.sendEmail({
        from: { email: config.mail.newsletterFrom(), name: config.mail.fromName() },
        to: [{ email: String(email).trim(), name: name || undefined }],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        tags: ['oa-newsletter-optin']
    });
}

// Restituisce { ok:true, payload } | { ok:false, reason:'invalid'|'expired' }
function readToken(token) {
    const payload = secure.verifyToken(token);
    if (!payload) return { ok: false, reason: 'invalid' };
    if (payload.expired) return { ok: false, reason: 'expired' };
    if (!payload.e) return { ok: false, reason: 'invalid' };
    return { ok: true, payload };
}

async function confirm(payload) {
    await brevo.subscribeContact({
        email: payload.e,
        firstName: payload.f,
        lastName: payload.l,
        lang: payload.lg
    });
}

module.exports = { requestOptIn, readToken, confirm };
