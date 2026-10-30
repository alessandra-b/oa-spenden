// api/session.js — avvia il pagamento di una DONAZIONE (chiamata da donation-form.js).
//
// Il server ricontrolla tutto: importo, livello (ricalcolato dall'importo), dati, termini.
// Poi chiama Saferpay e risponde con l'indirizzo della pagina di pagamento.
// Ritorno del browser: api/return.js. Notifica server-to-server: api/notify.js.

const config = require('../lib/config');
const saferpay = require('../lib/saferpay');
const orders = require('../lib/orders');
const { setCors, fail, isNonEmptyString, isValidEmail, clean } = require('../lib/http');

// Il livello dipende SOLO dall'importo (CHF): >= 1000 RESONANCE, >= 500 FLOW, >= 100 PULSE,
// altrimenti ECHO. Stesse soglie di public/donation-form.js.
const TIERS_DESC = [['RESONANCE', 1000], ['FLOW', 500], ['PULSE', 100]];
const MIN_AMOUNT = 1;

function tierFor(amount) {
    const hit = TIERS_DESC.find(([, min]) => amount >= min);
    return hit ? hit[0] : 'ECHO';
}

module.exports = async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { fail(res, 405, 'Method not allowed'); return; }

    try {
        const body = req.body || {};
        const donor = body.donor || {};

        const rawAmount = Number(body.amount);
        if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
            fail(res, 400, 'Invalid amount.', { code: 'INVALID_AMOUNT' }); return;
        }
        const amount = Math.round(rawAmount * 100) / 100;
        if (amount < MIN_AMOUNT) {
            fail(res, 400, 'Amount below minimum.', { code: 'AMOUNT_TOO_LOW', min: MIN_AMOUNT }); return;
        }
        const maxAmount = config.maxDonation();
        if (amount > maxAmount) {
            fail(res, 400, 'Amount above maximum.', { code: 'AMOUNT_TOO_HIGH', max: maxAmount }); return;
        }
        if (String(body.currency || 'CHF').toUpperCase() !== 'CHF') {
            fail(res, 400, 'Invalid currency.', { code: 'INVALID_CURRENCY' }); return;
        }
        if (body.termsAccepted !== true) {
            fail(res, 400, 'Terms must be accepted.', { code: 'TERMS_NOT_ACCEPTED' }); return;
        }
        const required = ['firstName', 'lastName', 'address', 'postalCode', 'city', 'email'];
        if (!required.every((key) => isNonEmptyString(donor[key]))) {
            fail(res, 400, 'Missing donor details.', { code: 'MISSING_DONOR' }); return;
        }
        if (!isValidEmail(donor.email)) {
            fail(res, 400, 'Invalid email.', { code: 'INVALID_EMAIL' }); return;
        }
        if (!saferpay.configured()) {
            console.error('Mancano le variabili SAFERPAY_* su Vercel');
            fail(res, 500, 'Server configuration incomplete.', { code: 'CONFIG' }); return;
        }

        const lang = config.normalizeLang(body.lang);
        const level = tierFor(amount);
        const person = {
            firstName: clean(donor.firstName, 100),
            lastName: clean(donor.lastName, 100),
            address: clean(donor.address, 100),
            postalCode: clean(donor.postalCode, 20),
            city: clean(donor.city, 100),
            country: 'CH', // il form donazioni non chiede il paese (come il form precedente)
            email: clean(donor.email, 100)
        };

        const result = await orders.startPayment(req, {
            ctx: { type: 'donation', lang, amount, level, person, newsletter: donor.newsletter === true },
            description: `Orchestra Aurea donation (${level})`,
            billingAddress: {
                FirstName: person.firstName,
                LastName: person.lastName,
                Street: person.address,
                Zip: person.postalCode,
                City: person.city,
                CountryCode: 'CH',
                Email: person.email
            }
        });

        if (result.cookies.length) res.setHeader('Set-Cookie', result.cookies);
        res.status(200).json({ redirectUrl: result.redirectUrl });
    } catch (err) {
        console.error('Errore in /api/session', err.name, err.message, err.raw ? JSON.stringify(err.raw) : '');
        if (err instanceof saferpay.SaferpayError) {
            fail(res, 502, 'Payment provider error.', { code: 'PROVIDER' }); return;
        }
        fail(res, 500, 'Internal error.', { code: 'INTERNAL' });
    }
};
