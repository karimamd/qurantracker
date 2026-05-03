const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const results = [];

  async function report(step, pass, evidence = "") {
    results.push({ step, status: pass ? "PASS" : "FAIL", evidence });
    console.log(`[${pass ? "PASS" : "FAIL"}] ${step}`);
  }

  try {
    const baseUrl = 'http://localhost:3000'; // Assuming standard port, though Replit handles proxied path

    // 1. Fresh guest
    await page.goto(baseUrl);
    await page.waitForSelector('[data-testid="cta-try-guest"]');
    await page.click('[data-testid="cta-try-guest"]');
    await page.waitForURL('**/dashboard');
    await report("Fresh guest onboard", page.url().includes("/dashboard"));

    // 2. Settings sync
    await page.goto(baseUrl + '/settings');
    await page.click('[data-testid="select-language"]');
    await page.click('[data-testid="lang-option-ar"]');
    const isRtl = await page.('html', el => el.getAttribute('dir') === 'rtl');
    await report("Arabic RTL switch", isRtl);

    await page.click('[data-testid="select-language"]');
    await page.click('[data-testid="lang-option-en"]');
    
    await page.fill('[data-testid="input-telawa-pages-per-day"]', '7');
    await page.fill('[data-testid="input-reader-font-size"]', '22');
    await page.fill('[data-testid="input-ayah-view-font-size"]', '30');
    await page.click('[data-testid="btn-save-settings"]');
    await page.reload();
    const v1 = await page.('[data-testid="input-telawa-pages-per-day"]', el => el.value);
    const v2 = await page.('[data-testid="input-reader-font-size"]', el => el.value);
    const v3 = await page.('[data-testid="input-ayah-view-font-size"]', el => el.value);
    await report("Settings persistence (7, 22, 30)", v1 === "7" && v2 === "22" && v3 === "30");

    await page.goto(baseUrl + '/reader/1');
    const readerFs = await page.innerText('[data-testid="reader-font-size-value"]');
    await report("Reader font-size sync", readerFs === "22");
    await page.click('[data-testid="btn-font-size-increase"]');
    await page.click('[data-testid="btn-font-size-increase"]');
    await page.goto(baseUrl + '/settings');
    const readerFsSet = await page.('[data-testid="input-reader-font-size"]', el => el.value);
    await report("Reader font-size tweak persists to settings", readerFsSet === "26");

    // 3. Auto-assign
    await page.click('[data-testid="switch-auto-assign-page"]');
    await page.fill('[data-testid="input-mistakes-good-max"]', '2');
    await page.fill('[data-testid="input-mistakes-hard-max"]', '6');
    await page.fill('[data-testid="input-mistakes-hard-max"]', '1');
    await page.fill('[data-testid="input-mistakes-good-max"]', '3');
    await page.click('[data-testid="btn-save-settings"]');
    const toast = await page.waitForSelector('text=Hard threshold must be at least the Good threshold');
    await report("Threshold validation toast", !!toast);

    await page.fill('[data-testid="input-mistakes-good-max"]', '2');
    await page.fill('[data-testid="input-mistakes-hard-max"]', '6');
    await page.click('[data-testid="btn-save-settings"]');

    await page.goto(baseUrl + '/reader/1');
    for (let i = 1; i <= 4; i++) await page.click(`[data-testid="reader-ayah-clear-${i}"]`);
    await page.click('[data-testid="reader-ayah-mistake-5"]');
    await page.click('[data-testid="reader-ayah-mistake-6"]');
    await page.click('[data-testid="reader-ayah-link-7"]');
    await page.goto(baseUrl + '/dashboard');
    const hasHard = await page.isVisible('text=Hard');
    await report("Auto-assign Page 1 Hard (3 mistakes)", hasHard);

    // 4. Homework
    await page.goto(baseUrl + '/homework');
    await page.click('[data-testid="btn-create-homework"]');
    await page.fill('[data-testid="input-hw-title"]', 'Test Session');
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    await page.fill('[data-testid="input-hw-due"]', tomorrow.toISOString().split('T')[0]);
    await page.fill('[data-testid="input-hw-memorize"]', '1-3');
    await page.fill('[data-testid="input-hw-revise"]', '10-12');
    await page.click('[data-testid="btn-submit-homework"]');
    await page.click('text=Test Session');
    const progressLabel = await page.innerText('[data-testid^="hw-section-ayah-coverage-"]');
    await report("Homework pages progress label", progressLabel.includes("pages done"));
    await page.click('[data-testid="quick-rate-1-good"]');
    const progressUpdated = await page.innerText('[data-testid^="hw-section-ayah-coverage-"]');
    await report("Homework progress update 1/3", progressUpdated.includes("1 / 3"));

    // 5. Undo
    await page.goto(baseUrl + '/dashboard');
    const undoBtn = await page.waitForSelector('[data-testid^="undo-activity-"]');
    await undoBtn.click();
    await page.click('[data-testid="undo-confirm"]');
    await page.waitForSelector('[data-testid^="undo-activity-"]', { state: 'detached' });
    await report("Recitation undo", true);

    // 6. Bottom nav (Mobile)
    await page.setViewportSize({ width: 400, height: 800 });
    await page.goto(baseUrl + '/settings');
    await page.click('[data-testid="btn-bottom-nav-remove-homework"]');
    const hwHidden = await page.isHidden('[data-testid="bottom-nav-homework"]');
    await report("Bottom nav customization (remove)", hwHidden);

    // 7. Backup
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.click('[data-testid="btn-backup-export"]');
    const backupToast = await page.waitForSelector('text=Backup downloaded');
    await report("Backup export toast", !!backupToast);

    // 8. Arabic WBW
    await page.click('[data-testid="select-language"]');
    await page.click('[data-testid="lang-option-ar"]');
    await page.goto(baseUrl + '/ayahs/1');
    await page.click('[data-testid="ayah-detail-wbw-trigger"]');
    const arabicWord = await page.isVisible('[data-testid="ayah-detail-wbw-word-0"]');
    // English gloss check (should be hidden)
    const englishGloss = await page.('[data-testid="ayah-detail-wbw-word-0"]', el => el.innerText.includes("In the name"));
    await report("Arabic WBW (Arabic visible, English hidden)", arabicWord && !englishGloss);

    // 9. Smoke
    const paths = ['/dashboard', '/reader/1', '/ayahs/1', '/pages', '/juz', '/surah', '/mistakes', '/telawa', '/homework', '/settings'];
    for (const p of paths) {
      await page.goto(baseUrl + p);
      await report(`Smoke ${p}`, ! (await page.isVisible('text=Error')));
    }

  } catch (e) {
    console.error("Test execution failed:", e);
    results.push({ step: "CRITICAL FAILURE", status: "FAIL", evidence: e.message });
  } finally {
    await browser.close();
    fs.writeFileSync('test_results.json', JSON.stringify(results, null, 2));
  }
})();
