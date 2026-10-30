// api/membership.js — iscrizione al Verein con pagamento della quota annuale (member-form.js).
//
// GET  -> impostazioni per il form: { fee, currency, year, statutesUrl } (unica fonte: Vercel)
// POST -> controlla i dati e avvia il pagamento Saferpay della quota (importo deciso qui,
//         non dal browser). Ammissione automatica: socio a pagamento avvenuto.

const config = require('../lib/config');
const saferpay = require('../lib/saferpay');
const orders = require('../lib/orders');
const { isCountry } = require('../lib/countries');
const { setCors, fail, isNonEmptyString, isValidEmail, clean } = require('../lib/http');

function membershipYear() {
    return Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric' }).format(new Date()));
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

function validPhone(value) {
    const v = String(value || '').trim();
    if (!v) return true; // facoltativo
    return /^[+0-9 ()./-]{6,30}$/.test(v) && (v.match(/\d/g) || []).length >= 6;
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
            year: membershipYear(),
            statutesUrl: config.statutesUrl(lang) || null
        });
        return;
    }
    if (req.method !== 'POST') { fail(res, 405, 'Method not allowed'); return; }

    try {
        const body = req.body || {};
        const m = body.member || {};

        const required = ['firstName', 'lastName', 'address', 'postalCode', 'city', 'country', 'birthDate', 'email'];
        if (!required.every((key) => isNonEmptyString(m[key]))) {
            fail(res, 400, 'Missing member details.', { code: 'MISSING_DETAILS' }); return;
        }
        if (!isValidEmail(m.email)) { fail(res, 400, 'Invalid email.', { code: 'INVALID_EMAIL' }); return; }
        const country = String(m.country).trim().toUpperCase();
        if (!isCountry(country)) { fail(res, 400, 'Invalid country.', { code: 'INVALID_COUNTRY' }); return; }
        if (!validBirthDate(m.birthDate)) { fail(res, 400, 'Invalid birth date.', { code: 'INVALID_BIRTHDATE' }); return; }
        if (!validPhone(m.phone)) { fail(res, 400, 'Invalid phone.', { code: 'INVALID_PHONE' }); return; }
        if (body.statutesAccepted !== true) {
            fail(res, 400, 'Statutes must be accepted.', { code: 'STATUTES_NOT_ACCEPTED' }); return;
        }
        if (body.termsAccepted !== true) {
            fail(res, 400, 'Terms must be accepted.', { code: 'TERMS_NOT_ACCEPTED' }); return;
        }
        if (!saferpay.configured()) {
            console.error('Mancano le variabili SAFERPAY_* su Vercel');
            fail(res, 500, 'Server configuration incomplete.', { code: 'CONFIG' }); return;
        }

        const lang = config.normalizeLang(body.lang);
        const fee = config.membershipFee();
        const year = membershipYear();
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

        const result = await orders.startPayment(req, {
            ctx: { type: 'member', lang, amount: fee, year, person, newsletter: m.newsletter === true },
            description: `Orchestra Aurea Mitgliederbeitrag ${year}`,
            billingAddress: {
                FirstName: person.firstName,
                LastName: person.lastName,
                Street: person.address,
                Zip: person.postalCode,
                City: person.city,
                CountryCode: country,
                Email: person.email
            }
        });

        if (result.cookies.length) res.setHeader('Set-Cookie', result.cookies);
        res.status(200).json({ redirectUrl: result.redirectUrl });
    } catch (err) {
        console.error('Errore in /api/membership', err.name, err.message, err.raw ? JSON.stringify(err.raw) : '');
        if (err instanceof saferpay.SaferpayError) {
            fail(res, 502, 'Payment provider error.', { code: 'PROVIDER' }); return;
        }
        fail(res, 500, 'Internal error.', { code: 'INTERNAL' });
    }
};

module.exports.validBirthDate = validBirthDate;
module.exports.validPhone = validPhone;
