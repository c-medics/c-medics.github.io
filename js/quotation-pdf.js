(function () {
    let assets;

    async function loadFile(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Could not load ${url} (${response.status}). Reload and try again.`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 8192) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
        }
        return btoa(binary);
    }

    async function loadAssets() {
        if (!assets) {
            assets = Promise.all([
                loadFile('assets/fonts/NotoSans-Regular.ttf'),
                loadFile('assets/fonts/NotoSans-Bold.ttf'),
                loadFile('logo.jpg')
            ]);
        }
        try {
            return await assets;
        } catch (error) {
            assets = undefined;
            throw error;
        }
    }

    window.createQuotationPdf = async function ({ recipient, subject, date, products }) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            throw new Error('The PDF library could not be loaded. Reload the page and try again.');
        }
        const [regular, bold, logo] = await loadAssets();
        const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
        doc.addFileToVFS('NotoSans-Regular.ttf', regular);
        doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
        doc.addFileToVFS('NotoSans-Bold.ttf', bold);
        doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');
        doc.setFont('NotoSans', 'normal');
        const font = doc.getFont().metadata;
        const enteredText = [recipient, subject, ...products.map((product) => product.name)].join('\n');
        for (const character of enteredText) {
            if (!/\s/.test(character) && !font.characterToGlyph(character.codePointAt(0))) {
                throw new Error(`The PDF font does not support "${character}". Replace that character before downloading.`);
            }
        }
        doc.setProperties({ title: 'PRICE QUOTATION - C-Medics', creator: 'C-Medics quotation builder' });
        const numbers = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const money = (value) => numbers.format(Math.round((value + Number.EPSILON) * 100) / 100);
        const left = 14;
        const right = 196;
        const contentBottom = 267;
        const continuationTop = 49;
        const lines = (text, width, fontSize = 9) => {
            doc.setFontSize(fontSize);
            return doc.splitTextToSize(text, width);
        };

        doc.setFontSize(9);
        doc.text('TO', left, 53);
        const address = lines(recipient, right - left);
        const subjectLines = lines(`SUB: ${subject.toUpperCase()}`, right - left);
        const subjectY = 62 + address.length * 4.5 + 7;
        const tableY = subjectY + subjectLines.length * 4.5 + 5;
        if (tableY > 220) {
            throw new Error('The customer address or subject is too long. Shorten it before creating the PDF.');
        }
        doc.text(address, left, 62, { lineHeightFactor: 1.4 });
        doc.setFont('NotoSans', 'bold');
        doc.text(subjectLines, left, subjectY, { lineHeightFactor: 1.4 });

        const body = products.map((product, index) => [
            String(index + 1), product.name, String(product.quantity), money(product.offerPrice),
            money(product.gstPerUnit), `${money(product.gstRate)}%`,
            money(product.unitPrice), money(product.lineTotal)
        ]);
        // A row must fit on a continuation page, including the repeated table heading.
        doc.setFont('NotoSans', 'normal');
        for (const product of products) {
            if (lines(product.name, 40, 8).length * 4 + 8 > contentBottom - continuationTop - 16) {
                throw new Error('A product description is too long to fit on one page. Shorten it before creating the PDF.');
            }
        }
        doc.autoTable({
            startY: tableY,
            margin: { top: continuationTop, right: left, bottom: 297 - contentBottom, left },
            head: [[
                'S. No.', 'Product', 'Qty', 'Offer price\n(per unit)', 'GST\n(per unit)',
                'GST rate', 'Unit price\nincl. GST', 'Line total\nincl. GST'
            ]],
            body,
            theme: 'grid',
            styles: {
                font: 'NotoSans', fontSize: 8, cellPadding: 2, overflow: 'linebreak',
                lineColor: [100, 116, 139], lineWidth: 0.2, textColor: [31, 41, 55]
            },
            headStyles: { fillColor: [219, 234, 254], textColor: [17, 24, 39], fontStyle: 'bold' },
            columnStyles: {
                0: { cellWidth: 12, halign: 'right' },
                1: { cellWidth: 44 },
                2: { cellWidth: 12, halign: 'right' },
                3: { cellWidth: 24, halign: 'right' },
                4: { cellWidth: 22, halign: 'right' },
                5: { cellWidth: 18, halign: 'right' },
                6: { cellWidth: 25, halign: 'right' },
                7: { cellWidth: 25, halign: 'right' }
            },
            rowPageBreak: 'avoid',
            showHead: 'everyPage'
        });

        let y = doc.lastAutoTable.finalY + 10;
        if (y + 48 > contentBottom) {
            doc.addPage();
            y = continuationTop;
        }
        const subtotal = products.reduce((sum, product) => sum + product.offerPrice * product.quantity, 0);
        const gst = products.reduce((sum, product) => sum + product.lineGst, 0);
        const total = products.reduce((sum, product) => sum + product.lineTotal, 0);
        doc.setFontSize(9);
        doc.setFont('NotoSans', 'bold');
        if (![subtotal, gst, total].every((value) =>
            Number.isFinite(value) && doc.getTextWidth(`₹${money(value)}`) <= 42
        )) {
            throw new Error('The amounts are too large to fit in the PDF. Check the entered prices and quantities.');
        }
        for (const [label, value] of [
            ['Offer subtotal', subtotal], ['Total GST', gst], ['Grand total (incl. GST)', total]
        ]) {
            doc.setFont('NotoSans', label.startsWith('Grand') ? 'bold' : 'normal');
            doc.text(label, 112, y);
            doc.text(`₹${money(value)}`, right, y, { align: 'right' });
            y += 7;
        }
        doc.setFont('NotoSans', 'bold');
        doc.text('THANKS & REGARDS', left, y + 10);
        doc.text(['C-MEDICS', 'HYDERABAD'], left, y + 17);

        const pages = doc.getNumberOfPages();
        for (let page = 1; page <= pages; page++) {
            doc.setPage(page);
            doc.addImage(`data:image/jpeg;base64,${logo}`, 'JPEG', left, 14, 22, 22);
            doc.setTextColor(30, 91, 156);
            doc.setFont('NotoSans', 'bold');
            doc.setFontSize(20);
            doc.text('C-MEDICS', 42, 22);
            doc.setFontSize(10);
            doc.text(['MEDICAL & SURGICALS', 'HYDERABAD'], 42, 28);
            doc.setTextColor(31, 41, 55);
            doc.setFont('NotoSans', 'normal');
            doc.setFontSize(7);
            doc.text([
                'GST: 36ARFPB8680H1ZN',
                'DL: 20B TG/HYD/2024-127667',
                '21B TG/HYD/2024-127667'
            ], 147, 19, { lineHeightFactor: 1.6 });
            doc.setDrawColor(30, 58, 95);
            doc.setLineWidth(0.5);
            doc.line(left, 39, right, 39);
            doc.setFontSize(9);
            doc.text(date, right, 45, { align: 'right' });
            doc.line(left, 276, right, 276);
            doc.setFontSize(7);
            doc.text('ADDRESS: Shop No. 8, SMR In Style Building, Dubai Gate, Old Bowenpally, Secunderabad', left, 281);
            doc.text('EMAIL: cmedics@yahoo.com   |   MOBILE: 9177433361', left, 286);
            doc.text(`Page ${page} of ${pages}`, right, 292, { align: 'right' });
        }
        return { blob: doc.output('blob'), pages };
    };
})();
