const { test, expect } = require('@playwright/test');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

async function enterQuotation(page, count, longText = false) {
    await page.goto('/quotation.html');
    await page.locator('#recipient').fill('Superintendent\nExample Hospital\nHyderabad');
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

async function downloadPdf(page, testInfo, name = 'quotation.pdf') {
    await page.locator('#printQuotation').click();
    await expect(page.locator('#printStatus')).toContainText('Your quotation is ready.');
    const pending = page.waitForEvent('download');
    await page.locator('#downloadPdf').click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe('PRICE QUOTATION - C-Medics.pdf');
    const file = testInfo.outputPath(name);
    await download.saveAs(file);
    await expect(page.locator('#openPdf')).toBeVisible();
    await expect(page.locator('#printQuotation')).toBeEnabled();
    return file;
}

for (const scenario of [
    { count: 1 }, { count: 7 }, { count: 16 }, { count: 20 }, { count: 30 }, { count: 90 },
    { count: 30, longText: true }
]) {
    test(`PDF: ${scenario.count} products${scenario.longText ? ', wrapped descriptions' : ''}`, async ({ page }, testInfo) => {
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await enterQuotation(page, scenario.count, scenario.longText);
        const pdf = await downloadPdf(page, testInfo);
        const status = await page.locator('#printStatus').textContent();
        const pages = Number(status.match(/(\d+) A4/)[1]);
        if (scenario.count <= 7) expect(pages).toBe(1);
        if (scenario.count === 90) expect(pages).toBeGreaterThan(1);
        const check = spawnSync('python', [
            path.join(__dirname, 'verify_pdf.py'), pdf, String(pages), String(scenario.count)
        ], { encoding: 'utf8' });
        expect(check.status, check.stdout + check.stderr).toBe(0);
        expect(errors).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await expect(page.locator('.editor')).toBeVisible();
    });
}

test('validation, updating a PDF, and hiding stale PDF links', async ({ page }, testInfo) => {
    await page.goto('/quotation.html');
    await page.locator('#printQuotation').click();
    await expect(page.locator('#openPdf')).toBeHidden();
    await enterQuotation(page, 1);
    await downloadPdf(page, testInfo);
    await page.locator('.product-name').fill('Changed product');
    await expect(page.locator('#openPdf')).toBeHidden();
    await downloadPdf(page, testInfo, 'updated.pdf');
    await page.locator('#addProduct').click();
    await expect(page.locator('#openPdf')).toBeHidden();
});

test('oversized description produces an explicit error', async ({ page }) => {
    await enterQuotation(page, 1);
    await page.locator('.product-name').fill('Very long description '.repeat(1500));
    await page.locator('#printQuotation').click();
    await expect(page.locator('#printStatus')).toContainText('too long');
    await expect(page.locator('#openPdf')).toBeHidden();
    await expect(page.locator('#printQuotation')).toBeEnabled();
});

test('missing font fails visibly and a retry can recover', async ({ page }, testInfo) => {
    await enterQuotation(page, 1);
    await page.route('**/NotoSans-Regular.ttf', (route) => route.fulfill({ status: 503, body: 'Unavailable' }));
    await page.locator('#printQuotation').click();
    await expect(page.locator('#printStatus')).toContainText('Could not load');
    await expect(page.locator('#openPdf')).toBeHidden();
    await page.unroute('**/NotoSans-Regular.ttf');
    await downloadPdf(page, testInfo);
});

test('oversized address and unsupported characters are not silently clipped', async ({ page }) => {
    await enterQuotation(page, 1);
    await page.locator('#recipient').fill('Hospital address\n'.repeat(70));
    await page.locator('#printQuotation').click();
    await expect(page.locator('#printStatus')).toContainText('too long');
    await page.locator('#recipient').fill('Hospital \u{1f3e5}');
    await page.locator('#printQuotation').click();
    await expect(page.locator('#printStatus')).toContainText('does not support');
    await expect(page.locator('#openPdf')).toBeHidden();
});

test('creating does not download automatically and unsupported sharing stays hidden', async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
    });
    await enterQuotation(page, 1);
    const downloads = [];
    page.on('download', (download) => downloads.push(download));
    await page.locator('#printQuotation').click();
    await expect(page.locator('#pdfActions')).toBeVisible();
    await expect(page.locator('#openPdf')).toHaveAttribute('href', /^blob:/);
    await expect(page.locator('#downloadPdf')).toHaveAttribute('href', /^blob:/);
    await expect(page.locator('#sharePdf')).toBeHidden();
    expect(downloads).toHaveLength(0);
    await page.locator('#recipient').fill('Updated hospital');
    await expect(page.locator('#pdfActions')).toBeHidden();
});

for (const outcome of ['success', 'cancel', 'failure']) {
    test(`native file sharing: ${outcome}`, async ({ page }) => {
        await page.addInitScript((outcome) => {
            Object.defineProperty(navigator, 'canShare', {
                configurable: true,
                value: ({ files }) => files.length === 1 && files[0].type === 'application/pdf'
            });
            Object.defineProperty(navigator, 'share', {
                configurable: true,
                value: async ({ files }) => {
                    window.sharedPdf = { name: files[0].name, size: files[0].size, type: files[0].type };
                    if (outcome !== 'success') {
                        throw new DOMException('Sharing did not complete', outcome === 'cancel' ? 'AbortError' : 'NotAllowedError');
                    }
                }
            });
        }, outcome);
        await enterQuotation(page, 1);
        await page.locator('#printQuotation').click();
        await expect(page.locator('#sharePdf')).toBeVisible();
        await page.locator('#sharePdf').click();
        await expect(page.locator('#printStatus')).toContainText(
            outcome === 'success' ? 'Share completed' :
                outcome === 'cancel' ? 'Sharing cancelled' : 'Use Open PDF or Download PDF'
        );
        const shared = await page.evaluate(() => window.sharedPdf);
        expect(shared.name).toBe('PRICE QUOTATION - C-Medics.pdf');
        expect(shared.type).toBe('application/pdf');
        expect(shared.size).toBeGreaterThan(1000);
        await expect(page.locator('#sharePdf')).toBeEnabled();
        await expect(page.locator('#downloadPdf')).toBeVisible();
    });
}

for (const count of [1, 20, 90]) {
    test(`private signature image on final page: ${count} products`, async ({ page }, testInfo) => {
        await enterQuotation(page, count);
        const encoded = await page.evaluate(() => {
            const canvas = document.createElement('canvas');
            canvas.width = 400;
            canvas.height = 210;
            const context = canvas.getContext('2d');
            context.fillStyle = 'blue';
            context.fillRect(20, 20, 300, 150);
            return canvas.toDataURL('image/png').split(',')[1];
        });
        await page.locator('#signatureFile').setInputFiles({
            name: 'test-signature.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64')
        });
        await expect(page.locator('#signatureStatus')).toContainText('selected');
        await expect(page.locator('#previewSignature')).toBeVisible();
        const signoffLayout = await page.locator('.signoff').evaluate((element) => {
            const text = element.querySelector('.signoff-text').getBoundingClientRect();
            const image = element.querySelector('img').getBoundingClientRect();
            const footer = document.querySelector('.business-contact').getBoundingClientRect();
            const box = element.getBoundingClientRect();
            return {
                beside: image.left >= text.right,
                aligned: Math.abs(image.top - text.top) < 1,
                contained: image.right <= box.right + 1,
                aboveFooter: Math.max(image.bottom, text.bottom) < footer.top
            };
        });
        expect(signoffLayout).toEqual({ beside: true, aligned: true, contained: true, aboveFooter: true });
        const pdf = await downloadPdf(page, testInfo);
        const status = await page.locator('#printStatus').textContent();
        const pages = Number(status.match(/(\d+) A4/)[1]);
        const check = spawnSync('python', [
            path.join(__dirname, 'verify_pdf.py'), pdf, String(pages), String(count), 'signature'
        ], { encoding: 'utf8' });
        expect(check.status, check.stdout + check.stderr).toBe(0);
        if (count === 1) expect(pages).toBe(1);
        await page.locator('#removeSignature').click();
        await expect(page.locator('#previewSignature')).toBeHidden();
        await expect(page.locator('#pdfActions')).toBeHidden();
        const unsignedPdf = await downloadPdf(page, testInfo, 'without-signature.pdf');
        const unsignedPages = Number((await page.locator('#printStatus').textContent()).match(/(\d+) A4/)[1]);
        const unsignedCheck = spawnSync('python', [
            path.join(__dirname, 'verify_pdf.py'), unsignedPdf, String(unsignedPages), String(count)
        ], { encoding: 'utf8' });
        expect(unsignedCheck.status, unsignedCheck.stdout + unsignedCheck.stderr).toBe(0);
        await page.reload();
        await expect(page.locator('#signatureSelection')).toBeHidden();
    });
}

test('invalid signature blocks generation until removed', async ({ page }) => {
    await enterQuotation(page, 1);
    await page.locator('#signatureFile').setInputFiles({
        name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image')
    });
    await expect(page.locator('#signatureStatus')).toContainText('could not be read');
    await page.locator('#printQuotation').click();
    await expect(page.locator('#pdfActions')).toBeHidden();
    await page.locator('#removeSignature').click();
    await page.locator('#printQuotation').click();
    await expect(page.locator('#pdfActions')).toBeVisible();
});
