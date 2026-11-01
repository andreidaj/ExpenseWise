from __future__ import annotations

import os


def assistant_public_url() -> str:
    return os.environ.get("ASSISTANT_PUBLIC_URL", "").strip().rstrip("/")


def assistant_enabled() -> bool:
    return bool(assistant_public_url())
