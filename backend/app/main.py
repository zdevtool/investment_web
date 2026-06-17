from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .routes import router


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Investment Hub API", version="0.2.0")
    origins = (
        ["*"]
        if settings.cors_allow_origin == "*"
        else [o.strip() for o in settings.cors_allow_origin.split(",")]
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*", "X-Auth-Token"],
        expose_headers=["X-Auth-Token"],
    )

    @app.middleware("http")
    async def auth_gate(request: Request, call_next):
        s = get_settings()
        # Public: docs, openapi, OPTIONS preflight, /api/health
        path = request.url.path
        is_public = (
            request.method == "OPTIONS"
            or path in {"/api/health", "/docs", "/openapi.json", "/redoc"}
            or path.startswith("/docs/")
        )
        if s.auth_token and not is_public:
            tok = request.headers.get("x-auth-token") or request.query_params.get("token")
            if tok != s.auth_token:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Invalid or missing X-Auth-Token"},
                )
        return await call_next(request)

    app.include_router(router, prefix="/api")
    return app


app = create_app()
