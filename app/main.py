import os
from dotenv import load_dotenv, find_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Load .env before importing modules that consume env vars
_dotenv_path = find_dotenv()
if _dotenv_path:
    load_dotenv(_dotenv_path, override=False)
    print(f"[ENV] Loaded .env: {_dotenv_path}")
else:
    print("[ENV] .env not found; using OS environment")

from .routers import api


def create_app() -> FastAPI:
    app = FastAPI(title="TurtleSoupDuel API", version="0.1")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api.router, prefix="/api/v1")
    static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
    static_dir = os.path.abspath(static_dir)
    if os.path.isdir(static_dir):
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
    return app


app = create_app()
