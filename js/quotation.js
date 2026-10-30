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
        document.getElementById('pdfActions').hidden = true;
        document.getElementById('printStatus').textContent = '';
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
    const printStatus = document.getElementById('printStatus');
    const pdfLink = document.getElementById('openPdf');
    const pdfActions = document.getElementById('pdfActions');
    const downloadLink = document.getElementById('downloadPdf');
    const shareButton = document.getElementById('sharePdf');
    let pdfUrl;
    let pdfFile;
    const signatureInput = document.getElementById('signatureFile');
    const signatureStatus = document.getElementById('signatureStatus');
    let signature;
    let signatureVersion = 0;

    function clearSignature(resetInput = true) {
        signatureVersion++;
        signature = undefined;
        if (resetInput) signatureInput.value = '';
        signatureInput.setCustomValidity('');
        signatureStatus.textContent = '';
        document.getElementById('signatureSelection').hidden = true;
        for (const id of ['signaturePreview', 'previewSignature']) {
            const image = document.getElementById(id);
            image.removeAttribute('src');
            image.hidden = true;
        }
        updatePreview();
    }

    document.getElementById('removeSignature').addEventListener('click', () => clearSignature());
    signatureInput.addEventListener('change', async () => {
        const file = signatureInput.files[0];
        clearSignature(false);
        if (!file) return;
        const version = signatureVersion;
        signatureInput.setCustomValidity('Wait for the stamp and signature image to finish loading.');
        signatureStatus.textContent = 'Loading image...';
        let url;
        try {
            if (!['image/png', 'image/jpeg'].includes(file.type)) {
                throw new Error('Choose a PNG or JPG image.');
            }
            if (file.size > 5 * 1024 * 1024) throw new Error('Choose an image smaller than 5 MB.');
            url = URL.createObjectURL(file);
            const image = new Image();
            image.src = url;
            await image.decode();
            if (version !== signatureVersion) return;
            if (image.naturalWidth * image.naturalHeight > 24000000) {
                throw new Error('The image is too large. Resize it to at most 24 megapixels.');
            }
            const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            const context = canvas.getContext('2d');
            if (!context) throw new Error('This browser could not prepare the image.');
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            signature = { data: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
            for (const id of ['signaturePreview', 'previewSignature']) {
                document.getElementById(id).src = signature.data;
                document.getElementById(id).hidden = false;
            }
            document.getElementById('signatureSelection').hidden = false;
            signatureInput.setCustomValidity('');
            signatureStatus.textContent = `${file.name} selected. Included on the final PDF page only.`;
        } catch (error) {
            if (version !== signatureVersion) return;
            console.error('Unable to prepare stamp and signature:', error);
            const message = error.name === 'EncodingError' ? 'The image could not be read. Choose a valid PNG or JPG.' : error.message;
            signatureInput.setCustomValidity(message);
            signatureStatus.textContent = message;
            document.getElementById('signatureSelection').hidden = false;
        } finally {
            if (url) URL.revokeObjectURL(url);
        }
    });

    shareButton.addEventListener('click', async () => {
        if (!pdfFile) return;
        shareButton.disabled = true;
        try {
            await navigator.share({ files: [pdfFile], title: 'PRICE QUOTATION - C-Medics' });
            printStatus.textContent = 'Share completed. You can still open or download your PDF.';
        } catch (error) {
            if (error.name === 'AbortError') {
                printStatus.textContent = 'Sharing cancelled. Your PDF is still ready.';
            } else {
                console.error('Unable to share quotation PDF:', error);
                printStatus.textContent = 'Sharing is unavailable right now. Use Open PDF or Download PDF instead.';
            }
        } finally {
            shareButton.disabled = false;
        }
    });

    document.getElementById('printQuotation').addEventListener('click', async () => {
        if (!form.reportValidity()) return;
        const button = document.getElementById('printQuotation');
        button.disabled = true;
        const fieldsets = form.querySelectorAll('fieldset');
        try {
            updatePreview();
            fieldsets.forEach((fieldset) => { fieldset.disabled = true; });
            printStatus.textContent = 'Creating PDF...';
            const { blob, pages } = await window.createQuotationPdf({
                recipient: document.getElementById('recipient').value.trim(),
                subject: document.getElementById('subject').value.trim(),
                date: formatDate(document.getElementById('quotationDate').value),
                products: getProducts(),
                signature
            });
            if (pdfUrl) URL.revokeObjectURL(pdfUrl);
            pdfUrl = URL.createObjectURL(blob);
            pdfLink.href = pdfUrl;
            downloadLink.href = pdfUrl;
            pdfFile = new File([blob], downloadLink.download, { type: 'application/pdf' });
            shareButton.hidden = !(typeof navigator.share === 'function' &&
                typeof navigator.canShare === 'function' && navigator.canShare({ files: [pdfFile] }));
            pdfActions.hidden = false;
            printStatus.textContent = `Your quotation is ready. ${pages} A4 page${pages === 1 ? '' : 's'}. Open the PDF to review or print it.`;
        } catch (error) {
            console.error('Unable to create quotation PDF:', error);
            printStatus.textContent = `PDF could not be created: ${error.message}`;
        } finally {
            fieldsets.forEach((fieldset) => { fieldset.disabled = false; });
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
