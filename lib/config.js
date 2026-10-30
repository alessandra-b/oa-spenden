// lib/config.js
//
// Tutte le impostazioni lette dalle variabili d'ambiente di Vercel, con i valori di default.
// Le funzioni leggono process.env ogni volta (non una sola volta all'avvio): cosi' i test
// possono cambiare le variabili e una modifica su Vercel vale dal deploy successivo.

const LANGUAGES = ['de', 'en', 'it'];

function env(name, fallback) {
    const v = process.env[name];
    return v === undefined || String(v).trim() === '' ? fallback : String(v).trim();
}

function list(name) {
    return env(name, '')
        .split(',')
        .map((s) => s.trim().replace(/\/+$/, ''))
        .filter(Boolean);
}

function normalizeLang(value) {
    const l = String(value || '').slice(0, 2).toLowerCase();
    return LANGUAGES.includes(l) ? l : 'de';
}

// Pagina "Danke" delle donazioni. {lang} diventa de / en / it.
function returnPageUrl() {
    return env('RETURN_PAGE_URL', 'https://www.orchestra-aurea.ch/{lang}/danke');
}

// Pagina "Willkommen" dei nuovi soci. Se non e' impostata, si ricava da RETURN_PAGE_URL
// sostituendo /danke con /willkommen (es. https://neu.orchestra-aurea.ch/{lang}/willkommen).
// Se RETURN_PAGE_URL non contiene /danke (pagine di test), si usa RETURN_PAGE_URL cosi' com'e'.
function memberReturnPageUrl() {
    const explicit = env('MEMBER_RETURN_PAGE_URL', '');
    if (explicit) return explicit;
    const base = returnPageUrl();
    return /\/danke(?=[/?#]|$)/.test(base) ? base.replace(/\/danke(?=[/?#]|$)/, '/willkommen') : base;
}

// Indirizzo del sito (per i link nelle email e nelle pagine della newsletter).
// Default: l'origine di RETURN_PAGE_URL (oggi neu.orchestra-aurea.ch, poi www.orchestra-aurea.ch).
function siteUrl() {
    const explicit = env('SITE_URL', '');
    if (explicit) return explicit.replace(/\/+$/, '');
    try {
        return new URL(returnPageUrl().replace('{lang}', 'de')).origin;
    } catch (e) {
        return 'https://www.orchestra-aurea.ch';
    }
}

// Statuti del Verein (PDF). STATUTEN_URL vale per tutte le lingue; STATUTEN_URL_EN /
// STATUTEN_URL_IT solo se un giorno esisteranno traduzioni.
function statutesUrl(lang) {
    const base = env('STATUTEN_URL', '');
    if (lang === 'en') return env('STATUTEN_URL_EN', base);
    if (lang === 'it') return env('STATUTEN_URL_IT', base);
    return base;
}

// Indirizzo pubblico del backend, da cui le email caricano il logo (public/email/).
function assetsUrl() {
    return env('ASSETS_URL', 'https://spenden.orchestra-aurea.ch').replace(/\/+$/, '');
}

module.exports = {
    LANGUAGES,
    assetsUrl,
    env,
    normalizeLang,
    allowedOrigins: () => list('ALLOWED_ORIGIN'),
    returnPageUrl,
    memberReturnPageUrl,
    siteUrl,
    statutesUrl,
    maxDonation: () => Number(env('MAX_DONATION_CHF', '')) || 100000,
    membershipFee: () => Number(env('MEMBERSHIP_FEE_CHF', '')) || 100,
    mail: {
        from: () => env('MAIL_FROM', 'info@orchestra-aurea.ch'),
        fromName: () => env('MAIL_FROM_NAME', 'Orchestra Aurea'),
        newsletterFrom: () => env('MAIL_FROM_NEWSLETTER', 'newsletter@orchestra-aurea.ch'),
        admin: () => env('MAIL_TO_ADMIN', 'info@orchestra-aurea.ch')
    },
    association: {
        name: 'Verein Orchestra Aurea',
        address: 'Neumoosstrasse 3d, 6023 Rothenburg',
        email: 'info@orchestra-aurea.ch'
    }
};
