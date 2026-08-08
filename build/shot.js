/* Full-page screenshots of every tab, into shots/. Requires: npm i playwright
   and (once) npx playwright install chromium. */
const fs = require('fs');
const PT = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const SANDBOX_CHROME = '/opt/pw-browsers/chromium';
const LAUNCH = fs.existsSync(SANDBOX_CHROME) ? { executablePath: SANDBOX_CHROME } : {};
const SITE = PT.join(__dirname, '..');
const TABS = ['changed', 'doors', 'crowded', 'bands', 'bench', 'school'];

(async () => {
  fs.mkdirSync(PT.join(__dirname, 'shots'), { recursive: true });
  const browser = await chromium.launch(LAUNCH);
  const url = pathToFileURL(PT.join(SITE, 'index.html')).href;
  const errors = [];
  for (const [tag, vp] of [['', { width: 1360, height: 900 }],
                           ['_390', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport: vp });
    page.on('pageerror', e => errors.push(String(e)));
    for (const t of TABS) {
      await page.goto(url + '#' + t, { waitUntil: 'load' });
      await page.evaluate(h => { location.hash = h; window.__tabs.show(); }, '#' + t);
      await page.waitForTimeout(300);
      await page.screenshot({ path: PT.join(__dirname, 'shots', 'tab_' + t + tag + '.png'), fullPage: true });
      console.log('shot tab_' + t + tag + '.png');
    }
    await page.goto(pathToFileURL(PT.join(SITE, 'methods.html')).href, { waitUntil: 'load' });
    await page.screenshot({ path: PT.join(__dirname, 'shots', 'methods' + tag + '.png'), fullPage: true });
    console.log('shot methods' + tag + '.png');
    await page.close();
  }
  await browser.close();
  if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('no page errors');
})();
