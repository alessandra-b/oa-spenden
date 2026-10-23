// Genera dist/embed-spenden.html: il form per intero, da incollare in un Code Embed di Webflow
// (alternativa al <script src>). Uso:  node scripts/build-embed.js
// Limite Webflow per un Code Embed: 50.000 caratteri.
const fs = require('fs');
const path = require('path');

const js = fs.readFileSync(path.join(__dirname, '../public/donation-form.js'), 'utf8')
    // via il commento di intestazione (pesa e non serve nell'embed)
    .replace(/^\/\*[\s\S]*?\*\/\s*/, '')
    .replace(/<\/script/gi, '<\\/script');

const embed =
`<div data-oa-donation-form
     data-endpoint="https://spenden.orchestra-aurea.ch/api/session"
     data-terms-de="/de/agb"
     data-terms-en="/en/agb"
     data-terms-it="/it/agb"></div>
<script>
${js}</script>
`;

fs.mkdirSync(path.join(__dirname, '../dist'), { recursive: true });
const out = path.join(__dirname, '../dist/embed-spenden.html');
fs.writeFileSync(out, embed);
const n = embed.length;
console.log(`dist/embed-spenden.html: ${n} caratteri (limite Webflow 50000)${n > 50000 ? '  -> TROPPO LUNGO' : '  OK'}`);
process.exit(n > 50000 ? 1 : 0);
