from __future__ import annotations

import hashlib
import ipaddress
import os
import threading
import time
from collections import defaultdict
from datetime import datetime, timedelta
from uuid import UUID

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.errors import AppError
from app.money import now_utc

# Parametrii recomandați de OWASP pentru un procesor mic. Valorile implicite
# țineau înregistrarea zeci de secunde pe Railway.
_hasher = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)
_lock = threading.Lock()
_register_hits: dict[str, list[float]] = defaultdict(list)
_login_failures: dict[str, list[float]] = defaultdict(list)
_LOGIN_WINDOW = 15 * 60
_LOGIN_LIMIT = 10


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _secret() -> str:
    return os.environ.get("SECRET_KEY", "dev-secret-change-me")


def _algorithm() -> str:
    return os.environ.get("JWT_ALGORITHM", "HS256")


def access_ttl() -> timedelta:
    minutes = int(os.environ.get("ACCESS_TOKEN_TTL_MINUTES", "15"))
    return timedelta(minutes=minutes)


def refresh_ttl() -> timedelta:
    days = int(os.environ.get("REFRESH_TOKEN_TTL_DAYS", "30"))
    return timedelta(days=days)


def make_access_token(user_id: UUID) -> str:
    expire = now_utc() + access_ttl()
    return jwt.encode(
        {"sub": str(user_id), "type": "access", "exp": expire},
        _secret(),
        algorithm=_algorithm(),
    )


def read_access_token(token: str) -> UUID:
    try:
        payload = jwt.decode(token, _secret(), algorithms=[_algorithm()])
    except jwt.PyJWTError as exc:
        raise AppError(401, "Neautentificat.") from exc
    if payload.get("type") != "access" or not payload.get("sub"):
        raise AppError(401, "Neautentificat.")
    try:
        return UUID(payload["sub"])
    except ValueError as exc:
        raise AppError(401, "Neautentificat.") from exc


def _normalize_ip(value: str) -> str | None:
    text = value.strip().strip("[]")
    if text.lower().startswith("::ffff:"):
        text = text[7:]
    if not text:
        return None
    try:
        addr = ipaddress.ip_address(text)
    except ValueError:
        return None
    mapped = getattr(addr, "ipv4_mapped", None)
    return str(mapped or addr)


def _trusted_networks() -> list[ipaddress.IPv4Network | ipaddress.IPv6Network]:
    raw = os.environ.get("TRUSTED_PROXIES", "127.0.0.1,::1")
    networks: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = []
    for item in raw.split(","):
        item = item.strip()
        if not item:
            continue
        try:
            if "/" in item:
                networks.append(ipaddress.ip_network(item, strict=False))
            else:
                addr = ipaddress.ip_address(item)
                networks.append(ipaddress.ip_network(f"{addr}/{addr.max_prefixlen}", strict=False))
        except ValueError:
            continue
    return networks


def _peer_is_trusted(peer: str) -> bool:
    try:
        addr = ipaddress.ip_address(peer)
    except ValueError:
        return False
    return any(addr in network for network in _trusted_networks())


def client_ip(peer: str | None, forwarded_for: str | None) -> str:
    """Use the proxy header only when the TCP peer is a proxy we run ourselves."""
    normalized_peer = _normalize_ip(peer or "")
    label = normalized_peer or (peer or "").strip() or "unknown"
    if not normalized_peer or not _peer_is_trusted(normalized_peer) or not forwarded_for:
        return label
    forwarded = _normalize_ip(forwarded_for.split(",")[0])
    return forwarded or label


def check_register_ip(ip: str) -> None:
    now = time.time()
    with _lock:
        recent = [stamp for stamp in _register_hits[ip] if now - stamp < 3600]
        if len(recent) >= 5:
            _register_hits[ip] = recent
            raise AppError(429, "Prea multe înregistrări de la această adresă. Încearcă mai târziu.")
        recent.append(now)
        _register_hits[ip] = recent


def check_login_ip(ip: str) -> None:
    now = time.time()
    with _lock:
        recent = [stamp for stamp in _login_failures[ip] if now - stamp < _LOGIN_WINDOW]
        _login_failures[ip] = recent
        if len(recent) >= _LOGIN_LIMIT:
            raise AppError(429, "Prea multe încercări de autentificare. Încearcă mai târziu.")


def record_login_failure(ip: str) -> None:
    now = time.time()
    with _lock:
        recent = [stamp for stamp in _login_failures[ip] if now - stamp < _LOGIN_WINDOW]
        recent.append(now)
        _login_failures[ip] = recent


def clear_login_failures(ip: str) -> None:
    with _lock:
        _login_failures.pop(ip, None)


def clear_register_limits() -> None:
    with _lock:
        _register_hits.clear()
        _login_failures.clear()


def expires_at(delta: timedelta) -> datetime:
    return now_utc() + delta
