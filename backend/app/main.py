import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.auth import authenticate
from app.database import Base, engine
from app.routers import contas, empreendimentos, lancamentos, orcamentos
from app.seed import seed


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    seed()
    yield


app = FastAPI(
    title="Orçamento Sopra — API",
    version="0.2.0",
    description="Backend de planejamento orçamentário.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Todos os endpoints /api/* são protegidos por HTTP Basic quando ORC_USERNAME e
# ORC_PASSWORD estão setados. Em dev (sem essas envs) o auth é no-op.
auth_dep = [Depends(authenticate)]
app.include_router(empreendimentos.router, dependencies=auth_dep)
app.include_router(contas.router, dependencies=auth_dep)
app.include_router(orcamentos.router, dependencies=auth_dep)
app.include_router(lancamentos.router, dependencies=auth_dep)


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


# Em produção, servimos o build do frontend a partir de /app/static.
# Em dev, /app/static não existe → este bloco é skipado e o Vite serve o front.
STATIC_DIR = Path(os.getenv("STATIC_DIR", "/app/static"))
if STATIC_DIR.is_dir() and (STATIC_DIR / "index.html").exists():
    # Serve assets do Vite (CSS/JS hashados) em /assets
    if (STATIC_DIR / "assets").is_dir():
        app.mount(
            "/assets",
            StaticFiles(directory=STATIC_DIR / "assets"),
            name="assets",
        )

    @app.get("/favicon.svg", include_in_schema=False)
    def favicon() -> FileResponse:
        return FileResponse(STATIC_DIR / "favicon.svg")

    # SPA fallback: qualquer rota não-API serve o index.html.
    # Precisa ser declarado por último para não capturar /api ou /health.
    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str) -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")
