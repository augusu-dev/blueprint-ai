const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));
    console.log('Navigating to Home...');
    await page.goto('http://localhost:5175');
    await page.waitForTimeout(2000);
    console.log('Clicking button...');
    try {
        await page.click('h3:has-text("新規スペースを開く")');
    } catch (e) {
        console.log('Click failed:', e.message);
    }
    await page.waitForTimeout(2000);
    console.log('URL:', page.url());
    await browser.close();
})();
