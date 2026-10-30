// test/e2e.browser.js — prova nel browser (Chromium) del form soci, del form donazioni
// e del form newsletter del footer, con le function vere e Saferpay/Brevo finti.
//   node test/e2e.browser.js   (serve Playwright; crea gli screenshot in test/screens/)

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { start } = require('./e2e-server');

const SHOTS = path.join(__dirname, 'screens');
fs.mkdirSync(SHOTS, { recursive: true });

async function fillMember(page, over = {}) {
    const v = Object.assign({
        firstName: 'Anna', lastName: 'Muster', address: 'Bahnhofstrasse 1', postalCode: '6003', city: 'Luzern',
        day: '23', month: '4', year: '1958', email: 'anna@example.ch', phone: '079 123 45 67'
    }, over);
    await page.fill('#oa-firstName', v.firstName);
    await page.fill('#oa-lastName', v.lastName);
    await page.fill('#oa-address', v.address);
    await page.fill('#oa-postalCode', v.postalCode);
    await page.fill('#oa-city', v.city);
    await page.fill('#oa-bdDay', v.day);
    await page.fill('#oa-bdMonth', v.month);
    await page.fill('#oa-bdYear', v.year);
    await page.fill('#oa-email', v.email);
    await page.fill('#oa-phone', v.phone);
}

(async () => {
    const { server, state, port } = await start(4173);
    const base = `http://localhost:${port}`;
    const browser = await chromium.launch();
    const results = [];
    const check = async (name, fn) => {
        try { await fn(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', name, e.message]); }
    };

    try {
        // ---- Form soci: aspetto e controlli ------------------------------------------
        await check('form soci DE: quota dal server, paesi, screenshot desktop e mobile', async () => {
            const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
            await page.goto(`${base}/test-member.html?lang=de`);
            await page.waitForFunction(() => document.querySelector('#oa-fee-amount') && document.querySelector('#oa-fee-amount').textContent === 'CHF 100');
            const year = String(new Date().getFullYear());
            assert.equal(await page.textContent('#oa-fee-line'), `Mitgliedschaft ${year}`);
            assert.equal(await page.inputValue('#oa-country'), 'CH');
            const first = await page.$$eval('#oa-country option', (o) => o.slice(0, 6).map((x) => x.textContent));
            assert.deepEqual(first, ['Schweiz', 'Liechtenstein', 'Deutschland', 'Österreich', 'Italien', 'Frankreich']);
            assert.equal(await page.getAttribute('#oa-statutes-link', 'href'), `${base}/statuten.pdf`);
            assert.match(await page.textContent('#oa-pay'), /Zur Zahlung fortfahren CHF 100/);
            await page.screenshot({ path: path.join(SHOTS, 'member-de-desktop.png'), fullPage: true });
            await page.setViewportSize({ width: 390, height: 844 });
            await page.screenshot({ path: path.join(SHOTS, 'member-de-mobile.png'), fullPage: true });
            // nessun testo sotto 16px
            const small = await page.$$eval('.oa-root *', (els) => els.filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.id || e.className));
            assert.deepEqual(small, []);
            await page.close();
        });

        await check('form soci: messaggi di errore nell\'ordine giusto', async () => {
            const page = await browser.newPage();
            await page.goto(`${base}/test-member.html?lang=de`);
            await page.waitForSelector('#oa-pay');
            await page.click('#oa-pay');
            assert.match(await page.textContent('#oa-error'), /Pflichtfelder/);
            assert.equal(await page.evaluate(() => document.activeElement.id), 'oa-firstName');
            await fillMember(page, { day: '31', month: '2' });
            await page.click('#oa-pay');
            assert.match(await page.textContent('#oa-error'), /gültiges Geburtsdatum/);
            await page.fill('#oa-bdDay', '28');
            await page.fill('#oa-phone', 'abc');
            await page.click('#oa-pay');
            assert.match(await page.textContent('#oa-error'), /Telefonnummer/);
            await page.fill('#oa-phone', '');
            await page.click('#oa-pay');
            assert.match(await page.textContent('#oa-error'), /Statuten/);
            await page.check('#oa-statutes');
            await page.click('#oa-pay');
            assert.match(await page.textContent('#oa-error'), /Allgemeinen Geschäftsbedingungen/);
            await page.close();
        });

        await check('form soci IT: iscrizione completa con newsletter -> pagina successo, 3 email', async () => {
            const before = state.brevo.emails.length;
            const page = await browser.newPage();
            await page.goto(`${base}/test-member.html?lang=it`);
            await page.waitForFunction(() => document.querySelector('#oa-fee-amount').textContent === 'CHF 100');
            assert.equal(await page.textContent('#oa-subtitle'), 'Diventa socio');
            await fillMember(page, { email: 'carla@example.it', firstName: 'Carla', lastName: 'Bianchi' });
            await page.selectOption('#oa-country', 'IT');
            await page.check('#oa-newsletter');
            await page.check('#oa-statutes');
            await page.check('#oa-terms');
            await Promise.all([page.waitForURL(/__saferpay/), page.click('#oa-pay')]);
            await Promise.all([page.waitForURL(/test-danke/), page.click('#pay')]);
            assert.match(page.url(), /lang=it&status=success$/);
            const draft = await page.evaluate(() => sessionStorage.getItem('oa_member_draft'));
            assert.equal(draft, null, 'bozza cancellata dopo il successo');
            const mails = state.brevo.emails.slice(before);
            assert.equal(mails.length, 3);
            const m = mails.find((e) => e.tags.includes('oa-member'));
            assert.match(m.htmlContent, /Ciao Carla,/);
            assert.match(m.htmlContent, /Italia/);
            assert.match(m.htmlContent, /23 aprile 1958/);
            assert.ok(m.attachment && m.attachment[0].url.endsWith('/statuten.pdf'));
            const tx = Object.values(state.saferpay.tx).pop();
            assert.equal(tx.status, 'CAPTURED');
            assert.equal(tx.init.Payer.BillingAddress.CountryCode, 'IT');
            assert.equal(tx.init.Payment.Amount.Value, '10000');
            fs.writeFileSync(path.join(SHOTS, 'email-member-it.html'), m.htmlContent);
            fs.writeFileSync(path.join(SHOTS, 'email-admin-member.html'), mails.find((e) => e.tags.includes('oa-member-admin')).htmlContent);
            fs.writeFileSync(path.join(SHOTS, 'email-optin-it.html'), mails.find((e) => e.tags.includes('oa-newsletter-optin')).htmlContent);
            await page.close();
        });

        await check('form soci: pagamento annullato -> incomplete, nessuna email, dati ancora nel form', async () => {
            const before = state.brevo.emails.length;
            const page = await browser.newPage();
            await page.goto(`${base}/test-member.html?lang=en`);
            await page.waitForSelector('#oa-pay');
            await fillMember(page, { email: 'zed@example.com' });
            await page.check('#oa-statutes');
            await page.check('#oa-terms');
            await Promise.all([page.waitForURL(/__saferpay/), page.click('#oa-pay')]);
            await Promise.all([page.waitForURL(/test-danke/), page.click('#cancel')]);
            assert.match(page.url(), /status=incomplete$/);
            assert.equal(state.brevo.emails.length, before);
            await page.goto(`${base}/test-member.html?lang=en`);
            await page.waitForSelector('#oa-pay');
            assert.equal(await page.inputValue('#oa-email'), 'zed@example.com', 'bozza ripresa');
            assert.equal(await page.isChecked('#oa-terms'), false, 'termini da riaccettare');
            await page.close();
        });

        // ---- Form donazioni (regressione) ---------------------------------------------
        await check('form donazioni: FLOW 520 CHF -> successo, email donatore + info@', async () => {
            const before = state.brevo.emails.length;
            const page = await browser.newPage();
            await page.goto(`${base}/test-form.html?level=PULSE&lang=de`);
            await page.waitForSelector('#oa-amount');
            await page.fill('#oa-amount', '520');
            await page.fill('#oa-firstName', 'Bruno');
            await page.fill('#oa-lastName', 'Rossi');
            await page.fill('#oa-address', 'Via Roma 2');
            await page.fill('#oa-postalCode', '6900');
            await page.fill('#oa-city', 'Lugano');
            await page.fill('#oa-email', 'bruno@example.ch');
            await page.check('#oa-terms');
            await Promise.all([page.waitForURL(/__saferpay/), page.click('#oa-pay')]);
            await Promise.all([page.waitForURL(/test-danke/), page.click('#pay')]);
            assert.match(page.url(), /lang=de&status=success$/);
            const mails = state.brevo.emails.slice(before);
            assert.equal(mails.length, 2);
            const d = mails.find((e) => e.tags.includes('oa-donation'));
            assert.match(d.subject, /Vielen Dank für Ihre Spende/);
            assert.match(d.htmlContent, /Stufe FLOW/);
            fs.writeFileSync(path.join(SHOTS, 'email-donation-de.html'), d.htmlContent);
            fs.writeFileSync(path.join(SHOTS, 'email-admin-donation.html'), mails.find((e) => e.tags.includes('oa-donation-admin')).htmlContent);
            await page.close();
        });

        // ---- Footer newsletter ---------------------------------------------------------
        await check('footer newsletter: blocca l\'invio a Webflow, chiama l\'API, mostra il messaggio', async () => {
            const before = state.brevo.emails.length;
            const page = await browser.newPage();
            await page.goto(`${base}/footer-test.html`);
            await page.waitForTimeout(500);
            assert.equal(await page.isDisabled('input[type=submit]'), false, 'bottone attivo anche senza Turnstile');
            await page.fill('#email', 'dora@example.ch');
            await page.click('input[type=submit]');
            await page.waitForSelector('.w-form-done', { state: 'visible' });
            assert.equal(await page.evaluate(() => window.webflowSubmitted), 0, 'gestore Webflow non chiamato');
            assert.equal(await page.isVisible('form'), false);
            const mail = state.brevo.emails[before];
            assert.equal(mail.to[0].email, 'dora@example.ch');
            assert.match(mail.subject, /Conferma la tua iscrizione/, 'lingua della pagina (it)');
            // il link di conferma funziona fino in fondo
            const link = mail.htmlContent.match(/href="([^"]*\/api\/newsletter\?t=[^"]+)"/)[1].replace(/&amp;/g, '&')
                .replace(/^https?:\/\/[^/]+/, base);
            await page.goto(link);
            await page.screenshot({ path: path.join(SHOTS, 'newsletter-confirm-page.png') });
            await page.click('button[type=submit]');
            await page.waitForSelector('text=Grazie!');
            await page.screenshot({ path: path.join(SHOTS, 'newsletter-done-page.png') });
            assert.equal(state.brevo.contacts.at(-1).email, 'dora@example.ch');
            await page.close();
        });

        // ---- Screenshot delle email ----------------------------------------------------
        await check('screenshot delle email', async () => {
            const page = await browser.newPage({ viewport: { width: 700, height: 900 } });
            for (const f of ['email-member-it', 'email-admin-member', 'email-optin-it', 'email-donation-de', 'email-admin-donation']) {
                await page.goto('file://' + path.join(SHOTS, f + '.html'));
                await page.screenshot({ path: path.join(SHOTS, f + '.png'), fullPage: true });
            }
            await page.close();
        });
    } finally {
        await browser.close();
        server.close();
    }

    results.forEach((r) => console.log(r[0] === 'ok' ? 'ok  ' : 'FAIL', r[1], r[2] || ''));
    const failed = results.filter((r) => r[0] !== 'ok').length;
    console.log(`\n${results.length - failed}/${results.length} ok`);
    process.exit(failed ? 1 : 0);
})();
