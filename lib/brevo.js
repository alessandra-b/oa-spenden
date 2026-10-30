// lib/brevo.js — invio email e gestione contatti newsletter con l'API di Brevo.
// Variabile: BREVO_API_KEY (Brevo -> Settings -> SMTP & API -> API keys).
// La chiave deve poter essere usata da qualsiasi indirizzo IP (Vercel non ha un IP fisso):
// se Brevo risponde "unrecognised IP address", va disattivato il blocco IP in Brevo
// (Settings -> Security -> Authorised IPs).

const API = 'https://api.brevo.com/v3';

class BrevoError extends Error {
    constructor(message, status, body) {
        super(message);
        this.name = 'BrevoError';
        this.status = status;
        this.body = body;
    }
}

function apiKey() {
    const key = process.env.BREVO_API_KEY;
    if (!key) throw new BrevoError('BREVO_API_KEY mancante su Vercel', 0, '');
    return key.trim();
}

function configured() {
    return Boolean(process.env.BREVO_API_KEY);
}

async function call(method, path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let response;
    try {
        response = await fetch(`${API}${path}`, {
            method,
            headers: { 'api-key': apiKey(), Accept: 'application/json', 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: controller.signal
        });
    } catch (err) {
        throw new BrevoError(`Brevo non raggiungibile: ${err.message}`, 0, '');
    } finally {
        clearTimeout(timer);
    }
    const text = await response.text().catch(() => '');
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    if (!response.ok) {
        const msg = (data && (data.message || data.code)) || text.slice(0, 300) || `HTTP ${response.status}`;
        throw new BrevoError(`Brevo ${method} ${path} -> ${response.status}: ${msg}`, response.status, text.slice(0, 1000));
    }
    return data;
}

// Invia un'email transazionale. Se l'allegato (es. statuti in PDF) non si puo' scaricare,
// Brevo rifiuta l'email intera: in quel caso si riprova senza allegato (il link resta nel testo).
async function sendEmail({ from, to, replyTo, subject, html, text, attachments, tags }) {
    const body = {
        sender: from,
        to,
        subject,
        htmlContent: html,
        textContent: text
    };
    if (replyTo) body.replyTo = replyTo;
    if (tags && tags.length) body.tags = tags;
    if (attachments && attachments.length) body.attachment = attachments;
    try {
        return await call('POST', '/smtp/email', body);
    } catch (err) {
        if (body.attachment && err.status === 400) {
            console.error('Email con allegato rifiutata, riprovo senza allegato:', err.message);
            delete body.attachment;
            return call('POST', '/smtp/email', body);
        }
        throw err;
    }
}

// ---- Contatti newsletter -------------------------------------------------------

const LIST_NAME = 'Newsletter Orchestra Aurea';
const FOLDER_NAME = 'Orchestra Aurea';
const LANG_ATTRIBUTE = 'SPRACHE';
let cachedListId = null;
let cachedAttributes = null;

// Lista dei contatti newsletter: BREVO_NEWSLETTER_LIST_ID se impostata, altrimenti la lista
// "Newsletter Orchestra Aurea" (creata la prima volta, se non esiste).
async function newsletterListId() {
    const fromEnv = Number(process.env.BREVO_NEWSLETTER_LIST_ID);
    if (fromEnv) return fromEnv;
    if (cachedListId) return cachedListId;

    for (let offset = 0; offset < 500; offset += 50) {
        const page = await call('GET', `/contacts/lists?limit=50&offset=${offset}`);
        const lists = (page && page.lists) || [];
        const found = lists.find((l) => l.name === LIST_NAME);
        if (found) { cachedListId = found.id; return found.id; }
        if (lists.length < 50) break;
    }
    const folders = await call('GET', '/contacts/folders?limit=50&offset=0');
    let folder = ((folders && folders.folders) || []).find((f) => f.name === FOLDER_NAME);
    if (!folder) folder = await call('POST', '/contacts/folders', { name: FOLDER_NAME });
    const created = await call('POST', '/contacts/lists', { name: LIST_NAME, folderId: folder.id });
    cachedListId = created.id;
    console.log(`Brevo: creata la lista "${LIST_NAME}" (id ${created.id})`);
    return created.id;
}

// I nomi degli attributi standard dipendono dalla lingua dell'account Brevo
// (FIRSTNAME / NOME / VORNAME / PRENOM ...): si legge quali esistono davvero.
async function attributeNames() {
    if (cachedAttributes) return cachedAttributes;
    const data = await call('GET', '/contacts/attributes');
    const names = ((data && data.attributes) || []).map((a) => String(a.name).toUpperCase());
    const pick = (candidates) => candidates.find((c) => names.includes(c)) || null;
    const map = {
        firstName: pick(['FIRSTNAME', 'VORNAME', 'NOME', 'PRENOM', 'NOMBRE']),
        lastName: pick(['LASTNAME', 'NACHNAME', 'COGNOME', 'NOM', 'APELLIDOS']),
        lang: names.includes(LANG_ATTRIBUTE) ? LANG_ATTRIBUTE : null
    };
    if (!map.lang) {
        try {
            await call('POST', `/contacts/attributes/normal/${LANG_ATTRIBUTE}`, { type: 'text' });
            map.lang = LANG_ATTRIBUTE;
            console.log(`Brevo: creato l'attributo ${LANG_ATTRIBUTE}`);
        } catch (err) {
            console.error(`Brevo: attributo ${LANG_ATTRIBUTE} non creato:`, err.message);
        }
    }
    cachedAttributes = map;
    return map;
}

// Aggiunge (o aggiorna) il contatto nella lista newsletter dopo la conferma (double opt-in).
// emailBlacklisted:false riattiva chi si era disiscritto e ora si e' riscritto confermando.
async function subscribeContact({ email, firstName, lastName, lang }) {
    const listId = await newsletterListId();
    const attrs = await attributeNames();
    const attributes = {};
    if (attrs.firstName && firstName) attributes[attrs.firstName] = firstName;
    if (attrs.lastName && lastName) attributes[attrs.lastName] = lastName;
    if (attrs.lang && lang) attributes[attrs.lang] = lang;
    await call('POST', '/contacts', {
        email,
        attributes,
        listIds: [listId],
        updateEnabled: true,
        emailBlacklisted: false
    });
    return listId;
}

function resetCache() {
    cachedListId = null;
    cachedAttributes = null;
}

module.exports = { call, configured, sendEmail, subscribeContact, newsletterListId, attributeNames, BrevoError, resetCache };
