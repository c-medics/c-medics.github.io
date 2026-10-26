(function () {
    const form = document.getElementById('quotationForm');
    const productRows = document.getElementById('productRows');
    const rowTemplate = document.getElementById('productRowTemplate');
    const formatter = new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    function roundMoney(value) {
        return Math.round((value + Number.EPSILON) * 100) / 100;
    }

    function formatCurrency(value) {
        return `₹${formatter.format(value)}`;
    }

    function formatDate(value) {
        if (!value) return '';
        const [year, month, day] = value.split('-');
        return `${day}/${month}/${year}`;
    }

    function addProductRow() {
        productRows.appendChild(rowTemplate.content.cloneNode(true));
        updatePreview();
    }

    function getProducts() {
        return Array.from(productRows.querySelectorAll('.product-row')).map((row) => {
            const name = row.querySelector('.product-name').value.trim();
            const quantity = Math.max(1, Number(row.querySelector('.product-quantity').value) || 1);
            const offerPrice = Math.max(0, Number(row.querySelector('.product-price').value) || 0);
            const gstRate = Math.max(0, Number(row.querySelector('.product-gst').value) || 0);
            const gstPerUnit = roundMoney(offerPrice * gstRate / 100);
            const unitPrice = roundMoney(offerPrice + gstPerUnit);

            return {
                name,
                quantity,
                offerPrice,
                gstRate,
                gstPerUnit,
                unitPrice,
                lineGst: roundMoney(gstPerUnit * quantity),
                lineTotal: roundMoney(unitPrice * quantity)
            };
        });
    }

    function addCell(row, text, className) {
        const cell = document.createElement('td');
        cell.textContent = text;
        if (className) cell.className = className;
        row.appendChild(cell);
    }

    function updatePreview() {
        document.getElementById('previewDate').textContent =
            formatDate(document.getElementById('quotationDate').value);
        document.getElementById('previewRecipient').textContent =
            document.getElementById('recipient').value.trim();
        document.getElementById('previewSubject').textContent =
            document.getElementById('subject').value.trim();

        const previewProducts = document.getElementById('previewProducts');
        previewProducts.replaceChildren();

        let subtotal = 0;
        let totalGst = 0;
        let grandTotal = 0;

        getProducts().forEach((product, index) => {
            const row = document.createElement('tr');
            addCell(row, String(index + 1));
            addCell(row, product.name || '\u00a0');
            addCell(row, String(product.quantity));
            addCell(row, formatter.format(product.offerPrice));
            addCell(row, formatter.format(product.gstPerUnit));
            addCell(row, `${formatter.format(product.gstRate)}%`);
            addCell(row, formatter.format(product.unitPrice));
            addCell(row, formatter.format(product.lineTotal));
            previewProducts.appendChild(row);

            subtotal += product.offerPrice * product.quantity;
            totalGst += product.lineGst;
            grandTotal += product.lineTotal;
        });

        document.getElementById('previewSubtotal').textContent = formatCurrency(roundMoney(subtotal));
        document.getElementById('previewGst').textContent = formatCurrency(roundMoney(totalGst));
        document.getElementById('previewTotal').textContent = formatCurrency(roundMoney(grandTotal));

        productRows.querySelectorAll('.remove-product').forEach((button) => {
            button.disabled = productRows.querySelectorAll('.product-row').length === 1;
        });
    }

    document.getElementById('addProduct').addEventListener('click', addProductRow);

    productRows.addEventListener('input', updatePreview);
    productRows.addEventListener('change', updatePreview);
    productRows.addEventListener('click', (event) => {
        const button = event.target.closest('.remove-product');
        if (!button || productRows.querySelectorAll('.product-row').length === 1) return;
        button.closest('.product-row').remove();
        updatePreview();
    });

    form.addEventListener('input', updatePreview);
    const printDocument = document.getElementById('printDocument');
    const printStatus = document.getElementById('printStatus');

    function cloneForPrint(element) {
        const clone = element.cloneNode(true);
        clone.removeAttribute('id');
        clone.querySelectorAll('[id]').forEach((child) => child.removeAttribute('id'));
        return clone;
    }

    function paginateQuotation() {
        printDocument.replaceChildren();
        const source = document.getElementById('quotationPreview');
        const pages = [];

        function newPage(firstPage) {
            const page = document.createElement('section');
            page.className = 'print-page';
            const body = document.createElement('div');
            body.className = 'print-page-body';
            for (const selector of ['.letterhead', '.quotation-date']) {
                body.appendChild(cloneForPrint(source.querySelector(selector)));
            }
            if (firstPage) {
                body.appendChild(cloneForPrint(source.querySelector('.recipient-block')));
                body.appendChild(cloneForPrint(source.querySelector('.quotation-subject')));
            }
            const table = cloneForPrint(source.querySelector('.quotation-table'));
            const rows = table.querySelector('tbody');
            rows.replaceChildren();
            body.appendChild(table);
            const contact = document.createElement('footer');
            contact.className = 'print-page-contact';
            contact.appendChild(cloneForPrint(source.querySelector('.business-contact')));
            const number = document.createElement('p');
            number.className = 'print-page-number';
            // Reserve the page-number line before measuring.
            number.textContent = 'Page 1 of 1';
            contact.appendChild(number);
            page.append(body, contact);
            printDocument.appendChild(page);
            const result = { page, body, rows, contact, number };
            pages.push(result);
            return result;
        }

        function fits(current) {
            // Leave 1 mm for differences in fractional print-unit rounding.
            return current.body.getBoundingClientRect().height +
                current.contact.getBoundingClientRect().height + 4 <=
                current.page.getBoundingClientRect().height;
        }

        let current = newPage(true);
        if (!fits(current)) {
            throw new Error('The customer address or subject is too long to fit on one page. Shorten it before printing.');
        }
        for (const row of source.querySelectorAll('.quotation-table tbody tr')) {
            const clone = cloneForPrint(row);
            current.rows.appendChild(clone);
            if (!fits(current)) {
                clone.remove();
                // An unusually long address may leave no room for products on page one.
                if (!current.rows.children.length) {
                    current.body.querySelector('.quotation-table').remove();
                }
                current = newPage(false);
                current.rows.appendChild(clone);
                if (!fits(current)) {
                    throw new Error('A product description is too long to fit on one page. Shorten it before printing.');
                }
            }
        }

        const closing = document.createElement('div');
        closing.append(
            cloneForPrint(source.querySelector('.quotation-totals')),
            cloneForPrint(source.querySelector('.quotation-footer'))
        );
        current.body.appendChild(closing);
        if (!fits(current)) {
            closing.remove();
            current = newPage(false);
            current.body.querySelector('.quotation-table').remove();
            current.body.appendChild(closing);
            if (!fits(current)) {
                throw new Error('The totals do not fit on a page. Reduce the size of the entered values.');
            }
        }
        pages.forEach((entry, index) => {
            entry.number.textContent = `Page ${index + 1} of ${pages.length}`;
        });
        return pages.length;
    }

    function preparePrint() {
        try {
            updatePreview();
            const count = paginateQuotation();
            printStatus.textContent = `${count} A4 page${count === 1 ? '' : 's'} prepared. Choose A4, portrait, 100% scale, and turn off browser headers and footers.`;
            return true;
        } catch (error) {
            console.error('Unable to prepare quotation for printing:', error);
            printStatus.textContent = error.message;
            printDocument.replaceChildren();
            const message = document.createElement('p');
            message.textContent = `Quotation could not be printed: ${error.message}`;
            printDocument.appendChild(message);
            return false;
        }
    }

    window.addEventListener('beforeprint', preparePrint);
    document.getElementById('printQuotation').addEventListener('click', async () => {
        if (!form.reportValidity()) return;
        const button = document.getElementById('printQuotation');
        button.disabled = true;
        try {
            await document.fonts.ready;
            const logo = document.querySelector('.letterhead-logo');
            await logo.decode();
            if (preparePrint()) window.print();
        } catch (error) {
            console.error('Unable to load quotation assets:', error);
            printStatus.textContent = 'The letterhead logo could not be loaded. Reload the page before printing.';
        } finally {
            button.disabled = false;
        }
    });

    const today = new Date();
    document.getElementById('quotationDate').value = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0')
    ].join('-');
    addProductRow();
})();
