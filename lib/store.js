// lib/store.js — database Upstash Redis (via l'integrazione Vercel), tramite l'API REST.
//
// Serve a due cose:
//  1. ritrovare il token Saferpay quando arriva la notifica server-to-server (che non porta dati);
//  2. evitare doppioni: ritorno del browser e notifica arrivano quasi insieme, ma ogni email
//     deve partire una volta sola.
// Variabili (le crea Vercel quando colleghi il database): KV_REST_API_URL + KV_REST_API_TOKEN
// (anche con prefisso, es. sp_KV_REST_API_URL),
// oppure UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
// Senza database tutto funziona lo stesso, con il solo ritorno del browser (cookie di riserva).

// Vercel puo' aggiungere un prefisso scelto al momento del collegamento (es. "sp_KV_REST_API_URL"):
// si accetta qualsiasi variabile che finisce con KV_REST_API_URL / KV_REST_API_TOKEN.
function findEnv(suffix) {
    if (process.env[suffix]) return process.env[suffix];
    const key = Object.keys(process.env).sort().find((k) => k.endsWith('_' + suffix) && process.env[k]);
    return key ? process.env[key] : '';
}

function settings() {
    const url = findEnv('KV_REST_API_URL') || process.env.UPSTASH_REDIS_REST_URL || '';
    const token = findEnv('KV_REST_API_TOKEN') || process.env.UPSTASH_REDIS_REST_TOKEN || '';
    return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

function enabled() {
    return settings() !== null;
}

async function command(args) {
    const s = settings();
    if (!s) throw new Error('Database non configurato');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
        const response = await fetch(s.url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(args.map(String)),
            signal: controller.signal
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data || data.error) {
            throw new Error(`Redis ${response.status}: ${(data && data.error) || 'risposta non valida'}`);
        }
        return data.result;
    } finally {
        clearTimeout(timer);
    }
}

async function getJson(key) {
    const v = await command(['GET', key]);
    if (v == null) return null;
    try {
        return JSON.parse(v);
    } catch (e) {
        return null;
    }
}

async function setJson(key, value, ttlSeconds) {
    await command(['SET', key, JSON.stringify(value), 'EX', ttlSeconds]);
}

// true se la chiave e' stata creata adesso (nessun altro l'aveva gia' presa)
async function claim(key, ttlSeconds) {
    return (await command(['SET', key, String(Date.now()), 'EX', ttlSeconds, 'NX'])) === 'OK';
}

async function release(key) {
    await command(['DEL', key]);
}

// Contatore a finestra fissa (limite di richieste). Restituisce il valore dopo l'incremento.
async function hit(key, windowSeconds) {
    const n = Number(await command(['INCR', key]));
    if (n === 1) await command(['EXPIRE', key, windowSeconds]);
    return n;
}

module.exports = { enabled, command, getJson, setJson, claim, release, hit };
