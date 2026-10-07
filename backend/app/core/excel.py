"""Pure Python XLSX writer generating valid OpenXML/Excel spreadsheets without external libraries."""

import html
import io
import zipfile


def build_minimal_xlsx(sheet_name: str, rows: list[list]) -> bytes:
    """Builds a basic .xlsx file from a list of rows (strings/numbers/dates)."""
    # 1. worksheet xml
    ws_lines = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
        "<sheetData>",
    ]

    for r_idx, row in enumerate(rows, start=1):
        ws_lines.append(f'<row r="{r_idx}">')
        for c_idx, val in enumerate(row, start=1):
            col_letter = _col_letter(c_idx)
            cell_ref = f"{col_letter}{r_idx}"
            if val is None:
                continue
            if isinstance(val, (int, float)):
                ws_lines.append(f'<c r="{cell_ref}"><v>{val}</v></c>')
            else:
                escaped = html.escape(str(val))
                ws_lines.append(f'<c r="{cell_ref}" t="inlineStr"><is><t>{escaped}</t></is></c>')
        ws_lines.append("</row>")

    ws_lines.append("</sheetData>")
    ws_lines.append("</worksheet>")
    ws_xml = "".join(ws_lines).encode("utf-8")

    # 2. [Content_Types].xml
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        "</Types>"
    ).encode("utf-8")

    # 3. _rels/.rels
    root_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        "</Relationships>"
    ).encode("utf-8")

    # 4. xl/workbook.xml
    safe_sheet_name = html.escape(sheet_name[:31])
    workbook_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        "<sheets>"
        f'<sheet name="{safe_sheet_name}" sheetId="1" r:id="rId1"/>'
        "</sheets>"
        "</workbook>"
    ).encode("utf-8")

    # 5. xl/_rels/workbook.xml.rels
    wb_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        "</Relationships>"
    ).encode("utf-8")

    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", root_rels)
        z.writestr("xl/workbook.xml", workbook_xml)
        z.writestr("xl/_rels/workbook.xml.rels", wb_rels)
        z.writestr("xl/worksheets/sheet1.xml", ws_xml)

    return out.getvalue()


def _col_letter(col_idx: int) -> str:
    result = ""
    while col_idx > 0:
        col_idx, remainder = divmod(col_idx - 1, 26)
        result = chr(65 + remainder) + result
    return result
