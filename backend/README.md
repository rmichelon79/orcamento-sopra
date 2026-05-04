# Orçamento Sopra — Backend (Etapa 1)

API base em FastAPI + SQLAlchemy + SQLite.

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Popular banco com dados iniciais

```bash
python -m app.seed
```

Cria `orcamento.db` na raiz do `backend/`, com a Sopra como empreendimento e ~15 contas em 3 níveis.

## Rodar a API

```bash
uvicorn app.main:app --reload
```

- Swagger UI: http://127.0.0.1:8000/docs
- Health: http://127.0.0.1:8000/health

## Endpoints

**Empreendimento (Etapa 1)**
- `GET    /api/empreendimento`
- `GET    /api/empreendimento/{id}`

**Plano de Contas (Etapa 1)**
- `GET    /api/contas`            — árvore completa
- `POST   /api/contas`
- `PUT    /api/contas/{id}`
- `DELETE /api/contas/{id}`
- `POST   /api/contas/reorder`

**Orçamento e Grade (Etapa 2)**
- `GET    /api/orcamento?empreendimento_id=X&ano=Y[&versao=Z]`
- `POST   /api/orcamento`
- `PUT    /api/orcamento/{id}` — atualiza status (rascunho/aprovado/arquivado)
- `GET    /api/orcamento/{id}/grade` — árvore + valores 12 meses + totais

**Lançamentos (Etapa 2)**
- `PUT    /api/lancamentos/bulk` — upsert em lote (valor 0 remove o lançamento)

## Testes

```bash
.venv/bin/pip install pytest
.venv/bin/pytest
```
