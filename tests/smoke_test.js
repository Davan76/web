// 冒煙測試：node smoke_test.js [index.html 路徑]
// 版本號、字數、各級距字數都「從 index.html 本身讀出來」，改版後不用改這支測試。
// 需要 Playwright（npm i playwright && npx playwright install chromium）。
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const FILE = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
const html = fs.readFileSync(FILE, 'utf8');

// ---- 從檔案讀出預期值 ----
const ver = /const APP_VERSION = "([^"]+)"/.exec(html)[1];
const feat = /const APP_FEATURES = "([^"]+)"/.exec(html)[1];
const cards = JSON.parse(/const BUILTIN_CARDS = (\[\[.*\]\]);/.exec(html)[1]);
const N = cards.length;
const by = f => cards.filter(f).length;
const exp = {
  all: N,
  'score_0-400': by(c => c[2] === '0-400'), 'score_400-600': by(c => c[2] === '400-600'),
  'score_600-780': by(c => c[2] === '600-780'), 'score_780-900': by(c => c[2] === '780-900'),
  'score_900+': by(c => c[2] === '900+'),
  star_5: by(c => c[3] === 5), star_4: by(c => c[3] === 4), star_3: by(c => c[3] === 3),
  spoken: by(c => c[2] === '口語'),
};
let fail = 0;
const ok = (name, cond, extra = '') => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  -> ' + extra : '')); };

(async () => {
  console.log(`檔案：${FILE}\n版本：${ver}｜卡片：${N}｜口語：${exp.spoken}\n`);
  const b = await chromium.launch();

  // ================= 電腦 =================
  let p = await b.newPage({ viewport: { width: 1280, height: 850 } }); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + FILE); await p.waitForTimeout(1500);
  const S = () => p.evaluate(() => ({ f: state.isFlipped, q: state.queue.length, head: state.queue[0].word, second: state.queue[1] && state.queue[1].word, last: state.queue[state.queue.length - 1].word, s: { ...state.stats } }));

  let s = await S();
  ok(`全庫 ${N} 張、第一張是 ${cards[0][0]}`, s.q === N && s.head === cards[0][0]);
  const line = await p.evaluate(() => document.getElementById('appVersion').textContent);
  ok('版本行 = 「版本 ' + ver + '｜' + N.toLocaleString() + ' 字｜」', line === `版本 ${ver}｜${N.toLocaleString()} 字｜`, line);
  ok('分頁標題帶有版本號', (await p.title()).endsWith(`(${ver})`));
  ok('更新內容預設收起', await p.evaluate(() => getComputedStyle(document.getElementById('verNotes')).display === 'none'));
  await p.click('#verInfoBtn');
  ok('點 ℹ️ 展開「版本更新內容：…。」', (await p.evaluate(() => document.getElementById('verNotes').textContent)) === `版本更新內容：${feat}。`);

  const labels = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#rankSelect option')].map(o => [o.value, o.text])));
  for (const [k, v] of Object.entries(exp)) {
    if (k === 'all') continue;
    ok(`選單「${k}」字數 ${v}`, (labels[k] || '').includes(`${v}字`), labels[k]);
  }
  for (const [k, v] of Object.entries(exp)) {
    await p.selectOption('#rankSelect', k); await p.waitForTimeout(250);
    ok(`切到「${k}」佇列 = ${v}`, (await S()).q === v);
  }
  await p.selectOption('#rankSelect', 'all'); await p.waitForTimeout(300);

  const ipa = await p.evaluate(() => document.getElementById('frontIpa').textContent);
  ok('正面有音標（若第一張卡有音標）', !cards[0][1].includes('音標：') || ipa.startsWith('/'), ipa);
  await p.keyboard.press('Space'); await p.waitForTimeout(300); ok('Space 翻面', (await S()).f);
  let h0 = (await S()).head; await p.keyboard.press('1'); await p.waitForTimeout(300); s = await S(); ok('Again → 插到第 2 位', s.second === h0 && s.s.again === 1);
  h0 = s.head; await p.keyboard.press('Space'); await p.waitForTimeout(250); await p.keyboard.press('3'); await p.waitForTimeout(300); s = await S(); ok('Good → 移到最後', s.last === h0);
  const n0 = s.q; await p.keyboard.press('Space'); await p.waitForTimeout(250); await p.keyboard.press('4'); await p.waitForTimeout(300); s = await S(); ok('Easy → 移出佇列', s.q === n0 - 1);
  const before = await p.evaluate(() => state.queue.slice(0, 8).map(c => c.word).join());
  await p.keyboard.press('s'); await p.waitForTimeout(300);
  ok('S 洗牌', before !== await p.evaluate(() => state.queue.slice(0, 8).map(c => c.word).join()));
  ok('桌機：鍵盤提示顯示', await p.evaluate(() => getComputedStyle(document.querySelector('.key-hint')).display !== 'none'));
  ok('沒有 JavaScript 錯誤（電腦）', errs.length === 0, JSON.stringify(errs));
  await p.close();

  // ================= 手機 =================
  const ctx = await b.newContext({ ...devices['iPhone 13'] }); p = await ctx.newPage(); const e2 = [];
  p.on('pageerror', e => e2.push(e.message));
  await p.goto('file://' + FILE); await p.waitForTimeout(1500);
  ok('手機：鍵盤提示隱藏', await p.evaluate(() => [...document.querySelectorAll('.key-hint,.hint-key,.srs-key-hint')].every(e => getComputedStyle(e).display === 'none')));
  ok('手機：三個按鈕高度 ≥ 44px', await p.evaluate(() => [...document.querySelectorAll('.ctl-btn')].every(e => e.getBoundingClientRect().height >= 44)));
  ok('手機：沒有橫向溢出', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.tap('#ctlFlip'); await p.waitForTimeout(400); ok('手機：點「翻面」', await p.evaluate(() => state.isFlipped));
  await p.tap('#btnGood'); await p.waitForTimeout(400); ok('手機：點 Good 計數 +1', await p.evaluate(() => state.stats.good === 1));
  const w = await p.evaluate(() => state.queue.slice(0, 6).map(c => c.word).join());
  await p.tap('#ctlShuffle'); await p.waitForTimeout(400); ok('手機：點「洗牌」', w !== await p.evaluate(() => state.queue.slice(0, 6).map(c => c.word).join()));
  await p.tap('#ctlSpeak'); await p.waitForTimeout(200); ok('手機：點「發音」不出錯', true);
  ok('沒有 JavaScript 錯誤（手機）', e2.length === 0, JSON.stringify(e2));

  await b.close();
  console.log(fail ? `\n有 ${fail} 項失敗` : '\n全部通過');
  process.exit(fail ? 1 : 0);
})();
