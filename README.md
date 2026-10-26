# C-Medics

Static website for C-Medics medical equipment and surgical supplies.

- [Website](https://c-medics.github.io/)
- [Quotation builder](https://c-medics.github.io/quotation.html) — enter products and customer details, calculate GST (5% default, editable), and print or save as PDF.

For quotations, use A4 portrait and turn off browser headers and footers.

**Local preview:** `node tests/serve.cjs`, then open <http://127.0.0.1:8766/quotation.html>.

**Tests:** `npm ci`, `npx playwright install chromium firefox webkit`, `python -m pip install -r tests/requirements.txt`, then `npm test`. Real iPhone Safari print/PDF review is required before publishing.
