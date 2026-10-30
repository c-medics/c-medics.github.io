"""Check actual PDF pagination and text placement, not just browser layout."""
import re
import sys

import fitz

filename, expected_pages, expected_products = sys.argv[1:4]
with_signature = len(sys.argv) > 4 and sys.argv[4] == "signature"
document = fitz.open(filename)
assert document.metadata["creator"] == "C-Medics quotation builder"
assert len(document) == int(expected_pages), f"Unexpected PDF page count: {len(document)}"
items = []
for index, page in enumerate(document):
    assert abs(page.rect.width - 595.28) < 1
    assert abs(page.rect.height - 841.89) < 1
    text = page.get_text()
    assert text.count("ADDRESS:") == 1, f"Missing/repeated address on page {index + 1}"
    assert text.count("EMAIL:") == 1
    assert len(page.get_images()) >= 1, "Missing letterhead logo"
    if not with_signature:
        assert len([image for image in page.get_images(full=True) if page.get_image_rects(image[0])]) == 1, "Unexpected signature image"
    if with_signature:
        images = [image for image in page.get_images(full=True) if page.get_image_rects(image[0])]
        assert len(images) == (2 if index == len(document) - 1 else 1)
        if index == len(document) - 1:
            stamp = next(image for image in images if image[2:4] != (635, 630))
            rectangle = page.get_image_rects(stamp[0])[0]
            assert rectangle.y1 < 267 * 72 / 25.4, "Signature overlaps footer area"
            assert abs(rectangle.width / rectangle.height - stamp[2] / stamp[3]) < 0.02
    assert "36ARFPB8680H1ZN" in text
    assert f"Page {index + 1} of {len(document)}" in text
    address = page.search_for("ADDRESS:")[0]
    email = page.search_for("EMAIL:")[0]
    assert 8 <= (page.rect.height - email.y1) * 25.4 / 72 <= 14
    ids = page.search_for("GST:")[0]
    name = page.search_for("C-MEDICS")[0]
    assert ids.x0 > name.x1, "Business IDs moved left"
    assert ids.y0 < name.y1 + 10, "Business IDs wrapped below name"
    for block in page.get_text("blocks"):
        if "ADDRESS:" not in block[4] and "EMAIL:" not in block[4] and not block[4].startswith("Page "):
            assert block[3] < address.y0, "Content overlaps footer"
        assert block[0] >= 0 and block[2] <= page.rect.width + 1, "Text outside page width"
        assert block[1] >= 0 and block[3] <= page.rect.height, "Text outside page height"
    items.extend(re.findall(r"ITEM-\d{3}", text))
assert items == [f"ITEM-{number:03}" for number in range(1, int(expected_products) + 1)], items
assert document[-1].get_text().count("Grand total") == 1
assert sum(page.get_text().count("Grand total") for page in document) == 1
assert sum(page.get_text().count("THANKS & REGARDS") for page in document) == 1
total = int(expected_products) * 9187.5
assert f"{total:,.2f}".replace(",", "") in document[-1].get_text().replace(",", "")
assert "\u20b9" in document[-1].get_text(), "Missing rupee glyph"
print(f"Verified {len(document)} A4 pages, {len(items)} products, footers and letterheads")
