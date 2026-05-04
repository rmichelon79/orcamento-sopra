# Orçamento Sopra — Backend (Fases 1 + 2)

API FastAPI + SQLAlchemy + SQLite. Single-user, sem auth (por design da Fase 1/2).

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

Cria `orcamento.db` na raiz do `backend/`. Idempotente — só cria o que ainda não existe.

Seed atual:
- 4 empreendimentos: `ALTANA`, `ARIA`, `BORORO`, `SOPRA` (todos ativos)
- Plano de contas com 23 contas em 3 níveis (compartilhado)
- 4 orçamentos `(empreendimento, 2026, v1)` em status `rascunho`, sem lançamentos

## Rodar a API

```bash
uvicorn app.main:app --reload
```

- Swagger UI: http://127.0.0.1:8000/docs
- Health: http://127.0.0.1:8000/health

## Endpoints

**Empreendimento — Fase 1 (read), Fase 2 (CRUD completo)**
- `GET    /api/empreendimento[?ativos=true]`
- `GET    /api/empreendimento/{id}`
- `POST   /api/empreendimento` — cria
- `PUT    /api/empreendimento/{id}` — edita codigo/nome/ativo
- `DELETE /api/empreendimento/{id}` — bloqueia se houver orçamento

**Plano de Contas — Fase 1**
- `GET    /api/contas` — árvore completa
- `POST   /api/contas`
- `PUT    /api/contas/{id}`
- `DELETE /api/contas/{id}`
- `POST   /api/contas/reorder`

**Orçamento — Fase 1 (CRUD + grade), Fase 2 (versões + consolidado)**
- `GET    /api/orcamento?empreendimento_id=X&ano=Y[&versao=Z]`
- `POST   /api/orcamento`
- `PUT    /api/orcamento/{id}` — atualiza status (rascunho/aprovado/arquivado)
- `GET    /api/orcamento/{id}/grade` — árvore + 12 meses + totais
- `POST   /api/orcamento/{id}/clonar` — **Fase 2** — cria nova versão clonando
- `GET    /api/orcamento/versoes?empreendimento_id&ano` — **Fase 2** — lista versões
- `GET    /api/orcamento/consolidado?ano[&empreendimento_ids=&...]` — **Fase 2** — soma N empreendimentos

**Lançamentos — Fase 1**
- `PUT    /api/lancamentos/bulk` — upsert em lote (valor 0 remove)

## Testes

```bash
.venv/bin/pytest
```

29 testes:
- 5 do cálculo recursivo de grade (Fase 1)
- 6 do bulk upsert de lançamentos (Fase 1)
- 6 da consolidação multi-empreendimento (Fase 2)
- 7 do CRUD de empreendimento (Fase 2)
- 5 do versionamento de orçamento (Fase 2)
