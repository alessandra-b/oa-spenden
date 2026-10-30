// scripts/preview-emails.js — anteprima di tutte le email e delle pagine della newsletter,
// senza inviare niente. Usa gli stessi testi e lo stesso layout di lib/mails.js con dati di prova.
//
//   node scripts/preview-emails.js
//   -> apri email-preview/index.html nel browser (doppio clic)
//
// Ogni modifica a lib/mails.js si vede rilanciando lo script e ricaricando la pagina.

const fs = require('fs');
const path = require('path');

// Indirizzi come in produzione (i link nelle email puntano al sito vero)
process.env.SITE_URL = process.env.SITE_URL || 'https://www.orchestra-aurea.ch';
process.env.STATUTEN_URL = process.env.STATUTEN_URL || 'https://spenden.orchestra-aurea.ch/statuten-orchestra-aurea.pdf';

const mails = require('../lib/mails');
const config = require('../lib/config');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'email-preview');
fs.mkdirSync(OUT, { recursive: true });

// Il logo viene incluso nella pagina, cosi' l'anteprima funziona anche senza internet
// e prima che il file sia pubblicato su Vercel.
const logoPng = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'public', mails.LOGO.file)).toString('base64');
const logoSvg = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(ROOT, 'public', 'email', 'orchestra-aurea-logo.svg')).toString('base64');
const localLogos = (html) => html
    .split(`${config.assetsUrl()}/${mails.LOGO.file}`).join(logoPng)
    .split(`${config.assetsUrl()}/email/orchestra-aurea-logo.svg`).join(logoSvg);

const paidAt = new Date('2026-10-30T14:35:00Z');
const tx = (brand) => ({ PaymentMeans: { Brand: { Name: brand } }, Transaction: { Id: 'GIIz3xAS9KvtvA3MGOrfAQxj31AA' } });

const people = {
    de: { firstName: 'Anna', lastName: 'Muster', address: 'Bahnhofstrasse 1', postalCode: '6003', city: 'Luzern', country: 'CH', birthDate: '1958-04-23', email: 'anna.muster@example.ch', phone: '079 123 45 67' },
    en: { firstName: 'Jane', lastName: 'Smith', address: '12 High Street', postalCode: 'OX1 4AR', city: 'Oxford', country: 'GB', birthDate: '1962-11-05', email: 'jane.smith@example.com', phone: '' },
    it: { firstName: 'Carla', lastName: 'Bianchi', address: 'Via Nassa 5', postalCode: '6900', city: 'Lugano', country: 'CH', birthDate: '1955-06-15', email: 'carla.bianchi@example.ch', phone: '+41 91 123 45 67' }
};

const items = [];
const add = (group, label, subject, html) => items.push({ group, label, subject, html: localLogos(html) });

for (const lang of ['de', 'en', 'it']) {
    const person = people[lang];
    const memberCtx = { type: 'member', lang, amount: 100, year: 2026, person, newsletter: true, orderId: 'OAM-20261030-E9CC6A14' };
    const m = mails.memberEmail({ ctx: memberCtx, tx: tx('TWINT'), paidAt, statutesUrl: config.statutesUrl(lang) });
    add('Soci', `Conferma socio (${lang.toUpperCase()})`, m.subject, m.html);
}
{
    const ctx = { type: 'member', lang: 'it', amount: 100, year: 2026, person: people.it, newsletter: true, orderId: 'OAM-20261030-E9CC6A14' };
    const a = mails.adminEmail({ ctx, tx: tx('TWINT'), paidAt, statutesUrl: config.statutesUrl('it'), newsletterRequested: true });
    add('Soci', 'Avviso a info@ (sempre DE)', a.subject, a.html);
}

for (const lang of ['de', 'en', 'it']) {
    const person = people[lang];
    const ctx = { type: 'donation', lang, amount: 520, level: 'FLOW', person, newsletter: false, orderId: 'OAD-20261030-7697667D' };
    const d = mails.donationEmail({ ctx, tx: tx('VISA'), paidAt });
    add('Donazioni', `Ringraziamento FLOW (${lang.toUpperCase()})`, d.subject, d.html);
}
{
    const ctx = { type: 'donation', lang: 'de', amount: 25, level: 'ECHO', person: people.de, newsletter: false, orderId: 'OAD-20261030-1A2B3C4D' };
    const d = mails.donationEmail({ ctx, tx: tx('TWINT'), paidAt });
    add('Donazioni', 'Ringraziamento ECHO (DE)', d.subject, d.html);
    const ctx2 = { type: 'donation', lang: 'de', amount: 520, level: 'FLOW', person: people.de, newsletter: false, orderId: 'OAD-20261030-7697667D' };
    const a = mails.adminEmail({ ctx: ctx2, tx: tx('VISA'), paidAt, newsletterRequested: false });
    add('Donazioni', 'Avviso a info@ (sempre DE)', a.subject, a.html);
}

for (const lang of ['de', 'en', 'it']) {
    const n = mails.newsletterEmail({ lang, name: `${people[lang].firstName} ${people[lang].lastName}`, firstName: people[lang].firstName, confirmUrl: 'https://spenden.orchestra-aurea.ch/api/newsletter?t=ESEMPIO' });
    add('Newsletter', `Email di conferma (${lang.toUpperCase()})`, n.subject, n.html);
}
{
    const n = mails.newsletterEmail({ lang: 'de', name: '', firstName: '', confirmUrl: 'https://spenden.orchestra-aurea.ch/api/newsletter?t=ESEMPIO' });
    add('Newsletter', 'Email di conferma senza nome (dal footer, DE)', n.subject, n.html);
}
for (const lang of ['de', 'en', 'it']) {
    const P = mails.texts(lang).pages;
    add('Pagine newsletter', `Conferma (${lang.toUpperCase()})`, '', mails.page(lang, { title: P.confirmTitle, text: P.confirmText('anna.muster@example.ch'), form: { action: '#', token: 'x', button: P.confirmButton } }));
    add('Pagine newsletter', `Fatto (${lang.toUpperCase()})`, '', mails.page(lang, { title: P.doneTitle, text: P.doneText, siteLink: true }));
}
{
    const P = mails.texts('de').pages;
    add('Pagine newsletter', 'Link scaduto (DE)', '', mails.page('de', { title: P.invalidTitle, text: P.invalidText, siteLink: true }));
    add('Pagine newsletter', 'Errore (DE)', '', mails.page('de', { title: P.errorTitle, text: P.errorText, siteLink: true }));
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nav = [...new Set(items.map((i) => i.group))].map((g) =>
    `<p class="g">${esc(g)}</p>` + items.map((it, i) => it.group === g ? `<button data-i="${i}">${esc(it.label)}</button>` : '').join('')).join('');

const page = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Anteprima email Orchestra Aurea</title>
<style>
:root{--bg:#f4f1ea;--panel:#fff;--ink:#1c1a17;--muted:#6b6458;--gold:#8a6a2a;--line:#e4dccb}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
.app{display:grid;grid-template-columns:280px 1fr;min-height:100vh}
nav{background:var(--panel);border-right:1px solid var(--line);padding:16px;overflow:auto;max-height:100vh;position:sticky;top:0}
nav h1{font-size:16px;margin:0 0 4px}nav .note{color:var(--muted);font-size:14px;margin:0 0 12px}
.g{margin:16px 0 6px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--gold)}
nav button{display:block;width:100%;text-align:left;padding:8px 10px;margin:2px 0;border:1px solid transparent;border-radius:6px;background:none;font:inherit;color:inherit;cursor:pointer}
nav button:hover{background:var(--bg)}nav button.on{border-color:var(--gold);background:#faf6ee}
main{padding:16px 24px}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}
.bar .subj{flex:1 1 300px;font-size:15px}.bar .subj b{color:var(--muted);font-weight:500}
.bar button{padding:6px 12px;border:1px solid var(--line);border-radius:6px;background:var(--panel);font:inherit;font-size:14px;cursor:pointer}
.bar button.on{border-color:var(--ink);background:var(--ink);color:#fff}
.frame{margin:0 auto;transition:width .2s;border:1px solid var(--line);background:#fff}
iframe{display:block;width:100%;height:1400px;border:0}
@media (max-width:800px){.app{grid-template-columns:1fr}nav{position:static;max-height:none}}
</style></head><body><div class="app">
<nav><h1>Anteprima email</h1><p class="note">Dati di prova. Nessuna email viene inviata.</p>${nav}</nav>
<main><div class="bar"><div class="subj"><b>Oggetto:</b> <span id="subj"></span></div>
<button data-w="760" class="on">Desktop</button><button data-w="390">Telefono 390 px</button></div>
<div class="frame" id="frame" style="width:760px;max-width:100%"><iframe id="view" title="Anteprima"></iframe></div></main></div>
<script>
const items=${JSON.stringify(items.map((i) => ({ label: i.label, subject: i.subject, html: i.html }))).replace(/<\//g, "<\\/")};
const view=document.getElementById('view'),subj=document.getElementById('subj');
function show(i){view.srcdoc=items[i].html;subj.textContent=items[i].subject||'(pagina web, non email)';
document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',+b.dataset.i===i));try{history.replaceState(null,'','#'+i)}catch(e){}}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>show(+b.dataset.i));
document.querySelectorAll('.bar button').forEach(b=>b.onclick=()=>{document.getElementById('frame').style.width=b.dataset.w+'px';
document.querySelectorAll('.bar button').forEach(x=>x.classList.toggle('on',x===b))});
view.onload=()=>{try{view.style.height=Math.max(600,view.contentDocument.documentElement.scrollHeight+20)+'px'}catch(e){}};
show(+(location.hash.slice(1))||0);
</script></body></html>`;

fs.writeFileSync(path.join(OUT, 'index.html'), page);
console.log(`Anteprima creata: ${path.relative(process.cwd(), path.join(OUT, 'index.html'))} (${items.length} elementi)`);
