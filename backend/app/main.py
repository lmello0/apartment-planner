from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routers import public, router
from app.config import get_config
from app.services.context import Conflict, NotFound


def create_app() -> FastAPI:
    config = get_config()  # fails fast on AUTH_DISABLED in production
    app = FastAPI(title="Apartment Planner API", docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.add_middleware(
        CORSMiddleware, allow_origins=config.cors_list, allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(NotFound)
    async def _not_found(_: Request, exc: NotFound) -> JSONResponse:
        return JSONResponse({"detail": f"Not found: {exc}"}, status_code=404)

    @app.exception_handler(Conflict)
    async def _conflict(_: Request, exc: Conflict) -> JSONResponse:
        return JSONResponse({"detail": str(exc)}, status_code=409)

    app.include_router(public)
    app.include_router(router)
    return app


app = create_app()
