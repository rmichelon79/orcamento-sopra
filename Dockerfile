# syntax=docker/dockerfile:1

# Stage 1 — build do frontend
FROM node:20-alpine AS frontend
WORKDIR /build

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY frontend/ ./
RUN npm run build


# Stage 2 — backend Python servindo API + estático do frontend
FROM python:3.12-slim
WORKDIR /app

# Dependências Python primeiro (camada cacheável)
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Código da app
COPY backend/app ./app

# Frontend buildado vai pra /app/static — main.py monta como SPA fallback
COPY --from=frontend /build/dist ./static

# Volume persistente do Fly fica em /data
ENV DB_PATH=/data/orcamento.db \
    STATIC_DIR=/app/static \
    PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
