"""Check actual PDF pagination and text placement, not just browser layout."""
import re
import sys

import fitz

filename, expected_pages, expected_products = sys.argv[1:]
document = fitz.open(filename)
assert len(document) == int(expected_pages), f"Unexpected PDF page count: {len(document)}"
items = []
for index, page in enumerate(document):
    assert abs(page.rect.width - 595.28) < 1
    assert abs(page.rect.height - 841.89) < 1
    text = page.get_text()
    assert text.count("ADDRESS:") == 1, f"Missing/repeated address on page {index + 1}"
    assert text.count("EMAIL:") == 1
    assert "36ARFPB8680H1ZN" in text
    assert f"Page {index + 1} of {len(document)}" in text
    address = page.search_for("ADDRESS:")[0]
    email = page.search_for("EMAIL:")[0]
    assert 10 <= (page.rect.height - email.y1) * 25.4 / 72 <= 20
    ids = page.search_for("GST:")[0]
    name = page.search_for("C-MEDICS")[0]
    assert ids.x0 > name.x1, "Business IDs moved left"
    assert ids.y0 < name.y1 + 10, "Business IDs wrapped below name"
    for block in page.get_text("blocks"):
        if "ADDRESS:" not in block[4] and "EMAIL:" not in block[4] and not block[4].startswith("Page "):
            assert block[3] < address.y0, "Content overlaps footer"
    items.extend(re.findall(r"ITEM-\d{3}", text))
assert items == [f"ITEM-{number:03}" for number in range(1, int(expected_products) + 1)], items
assert document[-1].get_text().count("Grand total") == 1
print(f"Verified {len(document)} A4 pages, {len(items)} products, footers and letterheads")
