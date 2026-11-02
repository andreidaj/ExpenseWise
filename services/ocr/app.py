"""PaddleOCR local, optional. /extract accepts already-extracted text for tests."""

from __future__ import annotations

import io
import logging
import os
import re
import tempfile
from datetime import date
from decimal import Decimal, InvalidOperation

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("expensewise.ocr")

app = FastAPI(title="ExpenseWise OCR")

_ENGINE = None
_MAX_EDGE = 1600


def _prepare_image(image: bytes) -> bytes:
    from PIL import Image, ImageOps

    opened = Image.open(io.BytesIO(image))
    try:
        frame = ImageOps.exif_transpose(opened)
        if frame.mode not in {"RGB", "L"}:
            frame = frame.convert("RGB")
        frame.thumbnail((_MAX_EDGE, _MAX_EDGE))
        output = io.BytesIO()
        frame.save(output, format="JPEG", quality=85)
        return output.getvalue()
    finally:
        opened.close()


_MONEY = re.compile(r"(?<!\d)(\d{1,3}(?:[.\s]\d{3})*[.,]\d{2}|\d+[.,]\d{2})(?!\d)")
_ISO_DATE = re.compile(r"(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)")
_DMY_DATE = re.compile(r"(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?!\d)")
_CLOCK = re.compile(r"\d{1,2}:\d{2}")
_SUBTOTAL = re.compile(r"\bsub\s*total\b")
_VAT = re.compile(r"\b(?:tva|taxa|vat)\b")
_FOLD = str.maketrans("ăâîșşțţĂÂÎȘŞȚŢ", "aaissttAAISSTT")


def _fold(value: str) -> str:
    return value.translate(_FOLD).casefold()


def _decimal(raw: str) -> str | None:
    text = raw.strip().replace(" ", "")
    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        text = text.replace(",", ".")
    try:
        value = Decimal(text)
    except InvalidOperation:
        return None
    if value <= 0:
        return None
    return f"{value.quantize(Decimal('0.0001')):.4f}"


def _money_values(line: str) -> list[str]:
    found: list[str] = []
    for match in _MONEY.finditer(line):
        if re.match(r"[./-]\d", line[match.end() :]):
            continue
        parsed = _decimal(match.group(1))
        if parsed:
            found.append(parsed)
    return found


def _calendar(year: int, month: int, day: int) -> str | None:
    if year < 100:
        year += 2000 if year < 70 else 1900
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def _dates_in(line: str) -> list[tuple[str, bool]]:
    found: list[tuple[str, bool]] = []
    covered: list[tuple[int, int]] = []
    for match in _ISO_DATE.finditer(line):
        iso = _calendar(int(match.group(1)), int(match.group(2)), int(match.group(3)))
        if iso is None:
            continue
        covered.append(match.span())
        found.append((iso, bool(_CLOCK.match(line[match.end() :].lstrip()))))
    for match in _DMY_DATE.finditer(line):
        if any(start <= match.start() < end for start, end in covered):
            continue
        iso = _calendar(int(match.group(3)), int(match.group(2)), int(match.group(1)))
        if iso is None:
            continue
        found.append((iso, bool(_CLOCK.match(line[match.end() :].lstrip()))))
    return found


def _is_vat(line: str) -> bool:
    folded = _fold(line)
    return "din care" in folded or bool(_VAT.search(folded))


def _total_rank(line: str) -> int:
    folded = _fold(line)
    if _is_vat(line) or _SUBTOTAL.search(folded):
        return 0
    if re.search(r"\btotal\s*lei\b|\btotal\s*de\s*plata\b|\bde\s*plata\b", folded):
        return 3
    if re.search(r"\btotal\b", folded):
        return 2
    if re.search(r"\bsuma\b", folded):
        return 1
    return 0


def parse_text(text: str) -> dict:
    lines_in = [line.strip() for line in text.splitlines() if line.strip()]
    merchant = next((line for line in lines_in if not _dates_in(line) or _money_values(line)), None)
    occurred = None
    stamped: str | None = None
    total = None
    total_rank = 0
    currency = "RON"
    items: list[dict] = []
    waiting_rank = 0
    for line in lines_in:
        for iso, has_time in _dates_in(line):
            if stamped is None and has_time:
                stamped = iso
            elif occurred is None:
                occurred = iso
        folded = _fold(line)
        if "eur" in folded:
            currency = "EUR"
        elif "usd" in folded:
            currency = "USD"
        elif "ron" in folded or re.search(r"\blei\b", folded):
            currency = "RON"
        amounts = _money_values(line)
        rank = _total_rank(line)
        if rank:
            if amounts and rank >= total_rank:
                total = amounts[-1]
                total_rank = rank
            waiting_rank = rank if not amounts and rank >= total_rank else 0
            continue
        if waiting_rank and amounts and not _is_vat(line):
            total = amounts[-1]
            total_rank = waiting_rank
            waiting_rank = 0
            continue
        if waiting_rank and _is_vat(line):
            continue
        if not amounts:
            continue
        label = _MONEY.sub("", line).strip(" -:")
        if label and label != merchant:
            items.append({"description": label, "amount": amounts[-1]})
    return {
        "merchant": merchant,
        "occurred_on": stamped or occurred,
        "total_amount": total,
        "currency": currency,
        "lines": items,
        "text": text,
    }


def _engine():
    global _ENGINE
    if _ENGINE is not None:
        return _ENGINE
    from paddleocr import PaddleOCR

    attempts = (
        {"use_angle_cls": True, "lang": "latin", "show_log": False},
        {"use_angle_cls": True, "lang": "en", "show_log": False},
        {"lang": "en"},
    )
    for kwargs in attempts:
        try:
            _ENGINE = PaddleOCR(**kwargs)
            return _ENGINE
        except Exception:
            continue
    _ENGINE = PaddleOCR()
    return _ENGINE


def _lines_from_result(result) -> list[str]:
    lines: list[str] = []
    if result is None:
        return lines
    texts = result.get("rec_texts") if isinstance(result, dict) else getattr(result, "rec_texts", None)
    if isinstance(texts, list):
        lines.extend(str(item) for item in texts if str(item).strip())
        return lines
    if not isinstance(result, list):
        return lines
    for block in result:
        if isinstance(block, dict) or getattr(block, "rec_texts", None):
            lines.extend(_lines_from_result(block))
            continue
        if not isinstance(block, list):
            continue
        for item in block:
            if isinstance(item, (list, tuple)) and len(item) >= 2:
                text_part = item[1]
                if isinstance(text_part, (list, tuple)):
                    lines.append(str(text_part[0]))
                else:
                    lines.append(str(text_part))
    return lines


def _paddle_text(image: bytes) -> str | None:
    try:
        from paddleocr import PaddleOCR  # noqa: F401
    except ImportError:
        return None
    engine = _engine()
    prepared = image
    suffix = ".jpg" if image.startswith(b"\xff\xd8") else ".png"
    try:
        prepared = _prepare_image(image)
        suffix = ".jpg"
    except Exception:
        log.exception("Nu am putut pregăti poza bonului")
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
        handle.write(prepared)
        path = handle.name
    try:
        try:
            result = engine.ocr(path, cls=True)
        except TypeError:
            result = engine.ocr(path)
    except Exception:
        log.exception("PaddleOCR nu a putut citi imaginea")
        return ""
    finally:
        os.remove(path)
    return "\n".join(_lines_from_result(result))


@app.get("/health")
def health() -> dict:
    try:
        import paddleocr  # noqa: F401

        engine = "paddleocr"
    except ImportError:
        engine = "text"
    return {"ok": True, "engine": engine}


@app.post("/extract")
async def extract(request: Request):
    content_type = request.headers.get("content-type", "")
    text = None
    image = None
    if "application/json" in content_type:
        body = await request.json()
        text = body.get("text")
    else:
        form = await request.form()
        raw_text = form.get("text")
        if isinstance(raw_text, str):
            text = raw_text
        upload = form.get("file")
        if upload is not None and hasattr(upload, "read"):
            image = await upload.read()
    if text:
        return parse_text(text)
    if image:
        try:
            extracted = _paddle_text(image)
        except Exception:
            log.exception("Citirea bonului a eșuat")
            return JSONResponse({"detail": "Nu am putut citi bonul. Încearcă o poză mai clară."}, status_code=503)
        if extracted is None:
            return JSONResponse(
                {
                    "detail": (
                        "PaddleOCR nu este instalat în container. "
                        "Trimite text deja extras în câmpul text al /extract."
                    )
                },
                status_code=503,
            )
        if not extracted.strip():
            return JSONResponse(
                {"detail": "Nu am putut citi text de pe bon. Încearcă o poză mai luminoasă, cu tot bonul în cadru."},
                status_code=422,
            )
        return parse_text(extracted)
    return JSONResponse({"detail": "Lipsește fișierul sau textul."}, status_code=422)
