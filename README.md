# C-Medics

Static website for C-Medics medical equipment and surgical supplies.

- [Website](https://c-medics.github.io/)
- [Quotation builder](https://c-medics.github.io/quotation.html) — enter products and customer details, calculate GST (5% default, editable), and create an A4 PDF to open, download or share.

PDFs are generated on your device, with embedded fonts and per-page letterhead and contact details. Open the downloaded PDF to share or print it; customer data is not uploaded.

Optionally select a PNG/JPG stamp and signature (up to 5 MB) for the final PDF page. The image stays in memory; select it again after reloading.

**Local preview:** `node tests/serve.cjs`, then open <http://127.0.0.1:8766/quotation.html>.

**Tests:** `npm ci`, `npx playwright install chromium firefox webkit`, `python -m pip install -r tests/requirements.txt`, then `npm test`. Use `npm run build` after updating PDF dependencies to refresh the vendored scripts. PDF libraries and Noto Sans fonts are bundled with their licences.
