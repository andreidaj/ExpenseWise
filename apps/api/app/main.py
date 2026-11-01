from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.auth import me, router as auth_router
from app.api.io import router as io_router
from app.api.money import router as money_router
from app.api.spaces import router as spaces_router
from app.errors import AppError
from app.mcp import assistant_enabled, assistant_public_url
from app.mcp.server import attach, router as assistant_router

logging.basicConfig(level=logging.INFO)
logging.getLogger("expensewise").setLevel(logging.INFO)


def create_app() -> FastAPI:
    enabled = assistant_enabled()
    origin = assistant_public_url()
    manager = {"value": None}

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        current = manager["value"]
        if current is not None:
            async with current.run():
                yield
        else:
            yield

    app = FastAPI(title="ExpenseWise", version="1.0.0", lifespan=lifespan)

    @app.exception_handler(AppError)
    async def app_error(_request, exc: AppError):
        return JSONResponse({"detail": exc.detail}, status_code=exc.status)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    app.include_router(auth_router, prefix="/api")
    app.include_router(me, prefix="/api")
    app.include_router(spaces_router, prefix="/api")
    app.include_router(money_router, prefix="/api")
    app.include_router(io_router, prefix="/api")
    if enabled:
        app.include_router(assistant_router, prefix="/api")
        manager["value"] = attach(app, origin)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["WWW-Authenticate"],
    )
    return app


app = create_app()
