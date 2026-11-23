// lib/webflow.js — lista «Gönnerinnen und Gönner» nel CMS di Webflow.
//
// Dopo una donazione da PULSE in su, se la persona ha accettato di essere nominata,
// si crea una voce IN BOZZA nella collection «Gönner»: qualcuno la controlla e la pubblica
// dal CMS (protezione contro nomi falsi o offensivi). Se la persona ha gia' una voce,
// si alza solo il livello (mai abbassato) e il nome resta quello eventualmente corretto a mano.
//
// La persona si riconosce dal campo «Referenz»: un codice ricavato dall'email con una chiave
// segreta (HMAC). Dal codice l'email non si ricostruisce, e l'email non entra nel CMS.
//
// Variabili su Vercel:
//   WEBFLOW_API_TOKEN               token del sito con permesso CMS lettura/scrittura (obbligatorio)
//   WEBFLOW_GOENNER_COLLECTION_ID   default: la collection «Gönner» del sito
//   WEBFLOW_CMS_LOCALE_IDS          id delle lingue CMS separati da virgola (default: DE, EN, IT del sito)

const crypto = require('crypto');
const secure = require('./secure');

const API = 'https://api.webflow.com/v2';
const DEFAULT_COLLECTION = '6b048b54a815618a2f46f6c2';
const DEFAULT_LOCALES = ['6acb63b38cefba012e4d632e', '6acb8a099848d81d2d17c9c2', '6ad86af75dfa41d4033fe5a5'];
const RANK = { PULSE: 1, FLOW: 2, RESONANCE: 3 };
const F = { tier: 'stufe-tier', rank: 'rang-rank', surname: 'nachname-surname', ref: 'referenz-reference' };

function env(name, fallback) {
    const v = process.env[name];
    return v === undefined || String(v).trim() === '' ? fallback : String(v).trim();
}
function token() { return env('WEBFLOW_API_TOKEN', ''); }
function collectionId() { return env('WEBFLOW_GOENNER_COLLECTION_ID', DEFAULT_COLLECTION); }
function localeIds() {
    const raw = env('WEBFLOW_CMS_LOCALE_IDS', '');
    return raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_LOCALES;
}
function configured() { return !!token(); }

function reference(email) {
    return 'oa1-' + crypto.createHmac('sha256', secure.subKeyFor('goenner'))
        .update(String(email || '').trim().toLowerCase()).digest('hex').slice(0, 32);
}

function slugify(name) {
    const base = String(name || 'goenner').normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/ß/g, 'ss').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'goenner';
    return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

async function call(method, path, body) {
    const res = await fetch(API + path, {
        method,
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', accept: 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
    if (!res.ok) {
        const err = new Error(`Webflow ${method} ${path} -> ${res.status} ${(data && (data.message || data.code)) || ''}`);
        err.status = res.status;
        throw err;
    }
    return data;
}

// Nome del livello -> id dell'opzione nel campo «Stufe (tier)».
async function tierOptionId(level) {
    const col = await call('GET', `/collections/${collectionId()}`);
    const field = (col.fields || []).find((f) => f.slug === F.tier);
    const opts = (field && field.validations && field.validations.options) || [];
    const hit = opts.find((o) => String(o.name).toUpperCase() === level);
    if (!hit) throw new Error(`Opzione «${level}» mancante nel campo ${F.tier}`);
    return hit.id;
}

async function findByReference(ref) {
    for (let offset = 0; offset < 2000; offset += 100) {
        const data = await call('GET', `/collections/${collectionId()}/items?limit=100&offset=${offset}`);
        const items = (data && data.items) || [];
        const hit = items.find((i) => i.fieldData && i.fieldData[F.ref] === ref);
        if (hit) return hit;
        if (items.length < 100) return null;
    }
    return null;
}

// Restituisce { action: 'created' | 'upgraded' | 'unchanged' | 'skipped', ... }
// level: PULSE | FLOW | RESONANCE (donazione) oppure null con member: true (richiesta di adesione:
// voce senza livello, rango 0; «Mitglied bis» lo imposta il Vorstand dopo il pagamento della quota).
async function upsertSupporter({ name, lastName, email, level, member }) {
    if (!RANK[level] && !member) return { action: 'skipped', reason: 'tier' };
    if (!configured()) return { action: 'skipped', reason: 'config' };
    const ref = reference(email);
    const existing = await findByReference(ref);
    if (!RANK[level]) {
        if (existing) return { action: 'unchanged', id: existing.id };
        const created = await call('POST', `/collections/${collectionId()}/items/bulk`, {
            cmsLocaleIds: localeIds(), isArchived: false, isDraft: true,
            fieldData: { name, slug: slugify(name), [F.rank]: 0, [F.surname]: String(lastName || '').trim() || name, [F.ref]: ref }
        });
        return { action: 'created', id: created && (created.id || (created.items && created.items[0] && created.items[0].id)) };
    }
    const optionId = await tierOptionId(level);

    if (existing) {
        const current = Number(existing.fieldData && existing.fieldData[F.rank]) || 0;
        if (current >= RANK[level]) return { action: 'unchanged', id: existing.id };
        await call('PATCH', `/collections/${collectionId()}/items`, {
            items: localeIds().map((cmsLocaleId) => ({
                id: existing.id, cmsLocaleId,
                fieldData: { [F.tier]: optionId, [F.rank]: RANK[level] }
            }))
        });
        return { action: 'upgraded', id: existing.id };
    }

    const created = await call('POST', `/collections/${collectionId()}/items/bulk`, {
        cmsLocaleIds: localeIds(),
        isArchived: false,
        isDraft: true,
        fieldData: {
            name, slug: slugify(name),
            [F.tier]: optionId, [F.rank]: RANK[level],
            [F.surname]: String(lastName || '').trim() || name,
            [F.ref]: ref
        }
    });
    const id = created && (created.id || (created.items && created.items[0] && created.items[0].id));
    return { action: 'created', id };
}

module.exports = { upsertSupporter, reference, configured, slugify, RANK };
