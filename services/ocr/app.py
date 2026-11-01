"""PaddleOCR local, optional. /extract accepts already-extracted text for tests."""

from __future__ import annotations

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


def parse_text(text: str) -> dict:
    lines_in = [line.strip() for line in text.splitlines() if line.strip()]
    merchant = lines_in[0] if lines_in else None
    occurred = None
    total = None
    currency = "RON"
    items: list[dict] = []
    for line in lines_in:
        iso = re.search(r"(\d{4}-\d{2}-\d{2})", line)
        dmy = re.search(r"(\d{2})[./](\d{2})[./](\d{4})", line)
        if iso:
            occurred = iso.group(1)
        elif dmy:
            occurred = f"{dmy.group(3)}-{dmy.group(2)}-{dmy.group(1)}"
        upper = line.upper()
        if "EUR" in upper:
            currency = "EUR"
        elif "USD" in upper:
            currency = "USD"
        elif "RON" in upper or "LEI" in upper:
            currency = "RON"
        amounts = re.findall(r"\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2}|\d+", line)
        parsed = _decimal(amounts[-1]) if amounts else None
        if parsed is None:
            continue
        if re.search(r"\b(total|suma|de plata|de plată)\b", line, re.I):
            total = parsed
        else:
            label = re.sub(r"\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2}|\d+", "", line).strip(" -:")
            if label and label != merchant:
                items.append({"description": label, "amount": parsed})
    if total is None and items:
        total = items[-1]["amount"]
    return {
        "merchant": merchant,
        "occurred_on": occurred or date.today().isoformat(),
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
    suffix = ".jpg" if image.startswith(b"\xff\xd8") else ".png"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
        handle.write(image)
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
