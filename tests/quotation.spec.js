const { test, expect } = require('@playwright/test');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

async function enterQuotation(page, count, longText = false) {
    await page.goto('/quotation.html');
    await page.locator('.letterhead-logo').evaluate((image) => image.decode());
    await page.locator('#recipient').fill(longText
        ? 'Superintendent\nExample Hospital\nBuilding 12, Medical Equipment Department\nHyderabad, Telangana\n500001'
        : 'Superintendent\nExample Hospital');
    await page.evaluate(({ count, longText }) => {
        const template = document.getElementById('productRowTemplate');
        const rows = document.getElementById('productRows');
        rows.replaceChildren();
        for (let index = 1; index <= count; index++) {
            const fragment = template.content.cloneNode(true);
            fragment.querySelector('.product-name').value =
                `ITEM-${String(index).padStart(3, '0')} ` +
                (longText ? 'Surgical instrument with a long description, sterile packaging and accessories. '.repeat(3) : 'Surgical instrument');
            fragment.querySelector('.product-price').value = '875';
            fragment.querySelector('.product-quantity').value = '10';
            rows.appendChild(fragment);
        }
        rows.dispatchEvent(new Event('input', { bubbles: true }));
    }, { count, longText });
}

for (const scenario of [
    { count: 1 }, { count: 7 }, { count: 16 }, { count: 30 }, { count: 90 },
    { count: 30, longText: true }
]) {
    test(`${scenario.count} products${scenario.longText ? ', wrapped descriptions' : ''}`, async ({ page, browserName }, testInfo) => {
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await enterQuotation(page, scenario.count, scenario.longText);
        const screenWidth = await page.evaluate(() => window.innerWidth);
        // Native Ctrl+P and the button both run this preparation.
        await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
        await page.emulateMedia({ media: 'print' });
        await expect(page.locator('#printStatus')).toContainText('A4 page');
        const layout = await page.locator('.print-page').evaluateAll((pages) => pages.map((sheet) => {
            const box = sheet.getBoundingClientRect();
            const body = sheet.querySelector('.print-page-body').getBoundingClientRect();
            const contact = sheet.querySelector('.print-page-contact').getBoundingClientRect();
            const heading = sheet.querySelector('.business-name').getBoundingClientRect();
            const ids = sheet.querySelector('.business-ids').getBoundingClientRect();
            return {
                width: box.width,
                height: box.height,
                gap: contact.top - body.bottom,
                bottomGap: box.bottom - contact.bottom,
                horizontalOverflow: sheet.scrollWidth - sheet.clientWidth,
                idsOnRight: ids.left >= heading.right - 1,
                idsAtTop: ids.top < heading.bottom,
                footerCount: sheet.querySelectorAll('.business-contact').length
            };
        }));
        expect(layout.length).toBeGreaterThan(0);
        if (scenario.count <= 7) expect(layout.length).toBe(1);
        for (const entry of layout) {
            expect(entry.width).toBeCloseTo(186 * 96 / 25.4, 0);
            expect(entry.height).toBeCloseTo(272 * 96 / 25.4, 0);
            expect(entry.gap).toBeGreaterThanOrEqual(0);
            expect(Math.abs(entry.bottomGap)).toBeLessThan(1);
            expect(entry.horizontalOverflow).toBeLessThanOrEqual(1);
            expect(entry.idsOnRight).toBe(true);
            expect(entry.idsAtTop).toBe(true);
            expect(entry.footerCount).toBe(1);
        }
        await expect(page.locator('.print-document tbody tr')).toHaveCount(scenario.count);
        const last = page.locator('.print-page').last();
        await expect(last.locator('.quotation-totals')).toHaveCount(1);
        await expect(last.locator('.signoff')).toHaveCount(1);
        await expect(last.locator('.grand-total strong')).toHaveText(
            `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(scenario.count * 9187.5)}`
        );
        expect(errors).toEqual([]);
        // Chromium/Edge expose PDF output; WebKit/Firefox only expose print-media layout.
        if (browserName === 'chromium') {
            const pdf = testInfo.outputPath('quotation.pdf');
            await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
            const check = spawnSync('python', [
                path.join(__dirname, 'verify_pdf.py'), pdf, String(layout.length), String(scenario.count)
            ], { encoding: 'utf8' });
            expect(check.status, check.stdout + check.stderr).toBe(0);
        }
        await page.emulateMedia({ media: 'screen' });
        expect(await page.evaluate(() => window.innerWidth)).toBe(screenWidth);
        await expect(page.locator('.editor')).toBeVisible();
    });
}

test('print button validates input and prepares the document', async ({ page }) => {
    await page.goto('/quotation.html');
    await page.evaluate(() => {
        window.printCalls = 0;
        window.print = () => {
            window.printCalls++;
            window.dispatchEvent(new Event('beforeprint'));
        };
    });
    await page.locator('#printQuotation').click();
    expect(await page.evaluate(() => window.printCalls)).toBe(0);
    await page.locator('#recipient').fill('Hospital');
    await page.locator('.product-name').fill('Catheter');
    await page.locator('#printQuotation').click();
    await expect(page.locator('#printStatus')).toContainText('1 A4 page');
    expect(await page.evaluate(() => window.printCalls)).toBe(1);
    await expect(page.locator('#printQuotation')).toBeEnabled();
    await page.locator('.product-name').fill('Changed product');
    await page.locator('#printQuotation').click();
    await expect(page.locator('.print-document tbody tr')).toHaveCount(1);
    await expect(page.locator('.print-document tbody')).toContainText('Changed product');
});

test('oversized product is rejected rather than clipped', async ({ page }) => {
    await enterQuotation(page, 1);
    await page.locator('.product-name').fill('Very long description '.repeat(1500));
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await expect(page.locator('#printStatus')).toContainText('too long');
    await expect(page.locator('.print-page')).toHaveCount(0);
    await expect(page.locator('#printDocument')).toContainText('could not be printed');
});
