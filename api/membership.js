// api/membership.js — richiesta di adesione al Verein (member-form.js).
//
// Decisione del direttivo (23.11.2026): niente pagamento online. Chi vuole diventare socio
// manda la richiesta; il Vorstand la esamina e, dopo l'ammissione, spedisce per posta la
// fattura della quota annuale con la polizza di versamento QR. Anno associativo: 1 agosto - 31 luglio.
//
// GET  -> impostazioni per il form: { fee, currency, year: "2026/27", statutesUrl }
// POST -> controlla i dati, manda la conferma alla persona e l'avviso all'associazione,
//         l'eventuale conferma newsletter e, con il consenso, una voce in bozza nella lista Gönner.

const crypto = require('crypto');
const config = require('../lib/config');
const store = require('../lib/store');
const secure = require('../lib/secure');
const brevo = require('../lib/brevo');
const mails = require('../lib/mails');
const newsletter = require('../lib/newsletter');
const webflow = require('../lib/webflow');
const { isCountry } = require('../lib/countries');
const { setCors, fail, isNonEmptyString, isValidEmail, isValidPhone, clean, clientIp, baseUrl } = require('../lib/http');

const LIMIT_IP_PER_HOUR = 5;
const LIMIT_EMAIL_PER_DAY = 3;

// Anno associativo in corso, dal 1 agosto: "2026/27"
function associationYear(now = new Date()) {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: 'numeric' })
        .formatToParts(now).reduce((o, x) => Object.assign(o, { [x.type]: x.value }), {});
    const start = Number(p.month) >= 8 ? Number(p.year) : Number(p.year) - 1;
    return `${start}/${String(start + 1).slice(-2)}`;
}

// AAAA-MM-GG valida, dal 1900 a oggi
function validBirthDate(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!m) return false;
    const y = +m[1], mo = +m[2], d = +m[3];
    const date = new Date(Date.UTC(y, mo - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return false;
    return y >= 1900 && date.getTime() <= Date.now();
}

function newReference() {
    const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(new Date()).replace(/-/g, '');
    return `OAA-${d}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

module.exports = async (req, res) => {
    setCors(req, res, { methods: 'GET, POST, OPTIONS' });
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }

    if (req.method === 'GET') {
        const lang = config.normalizeLang(req.query && req.query.lang);
        // Niente cache: una risposta salvata senza intestazioni CORS bloccherebbe il form.
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json({
            fee: config.membershipFee(),
            currency: 'CHF',
            year: associationYear(),
            statutesUrl: config.statutesUrl(lang) || null
        });
        return;
    }
    if (req.method !== 'POST') { fail(res, 405, 'Method not allowed'); return; }

    try {
        const body = req.body || {};
        const m = body.member || {};
        if (body.website) { res.status(200).json({ ok: true }); return; } // bot: si finge un successo

        const required = ['firstName', 'lastName', 'address', 'postalCode', 'city', 'country', 'birthDate', 'email', 'phone'];
        if (!required.every((key) => isNonEmptyString(m[key]))) {
            fail(res, 400, 'Missing member details.', { code: 'MISSING_DETAILS' }); return;
        }
        if (!isValidEmail(m.email)) { fail(res, 400, 'Invalid email.', { code: 'INVALID_EMAIL' }); return; }
        const country = String(m.country).trim().toUpperCase();
        if (!isCountry(country)) { fail(res, 400, 'Invalid country.', { code: 'INVALID_COUNTRY' }); return; }
        if (!validBirthDate(m.birthDate)) { fail(res, 400, 'Invalid birth date.', { code: 'INVALID_BIRTHDATE' }); return; }
        if (!isValidPhone(m.phone)) { fail(res, 400, 'Invalid phone.', { code: 'INVALID_PHONE' }); return; }
        if (body.statutesAccepted !== true) {
            fail(res, 400, 'Statutes must be accepted.', { code: 'STATUTES_NOT_ACCEPTED' }); return;
        }
        if (body.termsAccepted !== true) {
            fail(res, 400, 'Terms must be accepted.', { code: 'TERMS_NOT_ACCEPTED' }); return;
        }
        const mentionIn = body.mention && typeof body.mention === 'object' ? body.mention : {};
        let mention = { consent: false };
        if (mentionIn.consent === true) {
            const name = clean(mentionIn.name, 100);
            if (!name) { fail(res, 400, 'Missing mention name.', { code: 'INVALID_MENTION' }); return; }
            mention = { consent: true, name };
        }
        if (!brevo.configured()) {
            console.error('BREVO_API_KEY mancante: richieste di adesione non inviabili');
            fail(res, 500, 'Server configuration incomplete.', { code: 'CONFIG' }); return;
        }

        // Senza pagamento il form e' aperto a tutti: limite di richieste per indirizzo IP e per email.
        if (store.enabled()) {
            try {
                const ipHits = await store.hit(`rl:mb:ip:${secure.hash(clientIp(req))}`, 3600);
                const mailHits = await store.hit(`rl:mb:em:${secure.hash(m.email)}`, 86400);
                if (ipHits > LIMIT_IP_PER_HOUR || mailHits > LIMIT_EMAIL_PER_DAY) {
                    console.warn('Adesione: troppe richieste', ipHits, mailHits);
                    fail(res, 429, 'Too many requests.', { code: 'RATE_LIMIT' }); return;
                }
            } catch (err) {
                console.error('Adesione: limite non verificabile (database)', err.message);
            }
        }

        const lang = config.normalizeLang(body.lang);
        const person = {
            firstName: clean(m.firstName, 100),
            lastName: clean(m.lastName, 100),
            address: clean(m.address, 100),
            postalCode: clean(m.postalCode, 20),
            city: clean(m.city, 100),
            country,
            birthDate: String(m.birthDate).trim(),
            email: clean(m.email, 100),
            phone: clean(m.phone, 30)
        };
        const ctx = {
            type: 'application', lang, person, mention,
            newsletter: m.newsletter === true,
            fee: config.membershipFee(),
            year: associationYear(),
            reference: newReference()
        };
        const statutesUrl = config.statutesUrl(lang);
        const from = { email: config.mail.from(), name: config.mail.fromName() };
        const name = mails.fullName(person);

        // Lista Gönner: voce in bozza senza livello; il Vorstand la pubblica dopo l'ammissione.
        let supporter = null;
        if (mention.consent) {
            supporter = { requested: true, name: mention.name };
            try {
                Object.assign(supporter, await webflow.upsertSupporter({
                    name: mention.name, lastName: person.lastName, email: person.email, level: null, member: true
                }));
            } catch (err) {
                console.error('Gönner (adesione):', err.message);
                supporter.action = 'error';
            }
        }

        const toPerson = mails.applicationEmail({ ctx, statutesUrl });
        const toAdmin = mails.applicationAdminEmail({ ctx, supporter });
        const attachments = statutesUrl && /\.pdf(\?|$)/i.test(statutesUrl)
            ? [{ url: statutesUrl, name: 'Statuten-Orchestra-Aurea.pdf' }] : undefined;

        // Mittente members@ (verificato su Brevo); se Brevo lo rifiuta si ripiega sul mittente generale.
        const members = config.mail.members();
        const send = async (msg) => {
            try {
                return await brevo.sendEmail(Object.assign({ from: { email: members, name: config.mail.fromName() } }, msg));
            } catch (err) {
                if (members === from.email || err.status !== 400) throw err;
                console.error('Adesione: mittente', members, 'rifiutato da Brevo, uso', from.email, err.message);
                return brevo.sendEmail(Object.assign({ from }, msg));
            }
        };
        await send({
            to: [{ email: members }], replyTo: { email: person.email, name },
            subject: toAdmin.subject, html: toAdmin.html, text: toAdmin.text, tags: ['oa-application-admin']
        });
        const results = await Promise.allSettled([
            send({
                to: [{ email: person.email, name }], replyTo: { email: members, name: config.mail.fromName() },
                subject: toPerson.subject, html: toPerson.html, text: toPerson.text, attachments, tags: ['oa-application']
            }),
            brevo.addToList('applications', {
                email: person.email, firstName: person.firstName, lastName: person.lastName, lang,
                extra: {
                    TELEFON: { value: person.phone },
                    ANFRAGE_DATUM: { value: new Date().toISOString().slice(0, 10), type: 'date' },
                    ANFRAGE_REFERENZ: { value: ctx.reference }
                }
            }),
            ctx.newsletter ? newsletter.requestOptIn({
                email: person.email, firstName: person.firstName, lastName: person.lastName,
                lang, source: 'member', base: baseUrl(req)
            }) : Promise.resolve()
        ]);
        results.filter((r) => r.status === 'rejected').forEach((r) => console.error('Adesione: invio secondario fallito', r.reason && r.reason.message));

        res.status(200).json({ ok: true, reference: ctx.reference });
    } catch (err) {
        console.error('Errore in /api/membership', err.name, err.message);
        fail(res, 502, 'Could not send application.', { code: 'SEND_FAILED' });
    }
};

module.exports.validBirthDate = validBirthDate;
module.exports.associationYear = associationYear;
