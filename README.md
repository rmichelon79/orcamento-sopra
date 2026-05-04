# Orçamento Sopra — Fases 1 + 2

Camada de planejamento orçamentário com hierarquia de contas até 5 níveis,
lançamentos mês a mês, multi-empreendimento, consolidação e versionamento.

- [`spec-mvp-fase-1.md`](spec-mvp-fase-1.md) — fundação (1 empreendimento, edição, CRUD de contas)
- [`spec-mvp-fase-2.md`](spec-mvp-fase-2.md) — multi-empreendimento, consolidação, versionamento

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Python 3.14 · FastAPI · SQLAlchemy 2 · Pydantic 2 · SQLite |
| Frontend | React 19 · TypeScript · Vite · Tailwind · TanStack Query · AG Grid Community 35 |
| Testes | pytest (backend) |

## Como rodar local

Pré-requisitos:
- Python 3.11+ (testado com 3.14.4)
- Node.js 18+ (testado com 24.15)

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

A primeira execução cria `orcamento.db` e popula automaticamente:
- 4 empreendimentos: `ALTANA`, `ARIA`, `BORORO`, `SOPRA`
- Plano de contas com 23 contas (5 níveis 1, 7 níveis 2, 11 níveis 3) — compartilhado
- 4 orçamentos `(empreendimento, 2026, v1)` em status `rascunho`, sem lançamentos

API disponível em <http://127.0.0.1:8000> · Swagger em `/docs`.

### Frontend

Em outro terminal:

```bash
cd frontend
npm install
npm run dev
```

UI em <http://localhost:5173>. O Vite faz proxy de `/api/*` para o backend.

## Testes

```bash
cd backend
.venv/bin/pytest -v
```

29 testes cobrindo o cálculo recursivo de grade, o bulk upsert de lançamentos,
o consolidador, o CRUD de empreendimentos e o versionamento (clonagem + status).

## Arquitetura — visão rápida

```
backend/app/
├── main.py              FastAPI + CORS + lifespan (cria tabelas + roda seed)
├── database.py          engine SQLite, SessionLocal, Base
├── models/              Empreendimento, Conta, Orcamento, Lancamento
├── schemas/             Pydantic (entrada/saída da API)
├── routers/             contas, empreendimentos, orcamentos, lancamentos
├── services/
│   ├── contas.py        CRUD com geração de código + validações de hierarquia
│   ├── orcamento.py     create / find / update status
│   ├── grade.py         calcular_grade — recursão bottom-up (algoritmo crítico)
│   └── lancamentos.py   bulk upsert (valor=0 remove)
└── seed.py              dados iniciais idempotentes

frontend/src/
├── App.tsx              shell + estado de carregamento/erro
├── api/client.ts        wrapper fetch tipado
├── types/api.ts         tipos espelhando os schemas Pydantic
├── hooks/
│   ├── useGrade.ts      queries (empreendimentos, orcamento, grade)
│   ├── useGradeEditor.ts  edits otimistas + debounce 300ms + status save
│   └── useContas.ts     mutations CRUD
├── lib/gradeEdit.ts     recálculo otimista bottom-up (espelha o backend)
└── components/
    ├── BudgetGrid.tsx   AG Grid + flatten manual + paste handler + ações inline
    └── ContaModal.tsx   create/edit de conta
```

## Endpoints

```
# Empreendimentos
GET    /api/empreendimento[?ativos=true]
GET    /api/empreendimento/{id}
POST   /api/empreendimento
PUT    /api/empreendimento/{id}
DELETE /api/empreendimento/{id}                 # 400 se tem orçamentos

# Plano de contas
GET    /api/contas                              # árvore completa (recursiva)
POST   /api/contas
PUT    /api/contas/{id}
DELETE /api/contas/{id}                         # 400 se tem filhas ou lançamentos
POST   /api/contas/reorder

# Orçamento
GET    /api/orcamento?empreendimento_id&ano[&versao]
POST   /api/orcamento
PUT    /api/orcamento/{id}                      # atualiza status
POST   /api/orcamento/{id}/clonar               # cria nova versão (Fase 2)
GET    /api/orcamento/{id}/grade                # árvore + 12 meses + totais
GET    /api/orcamento/versoes
        ?empreendimento_id&ano                  # lista versões (Fase 2)
GET    /api/orcamento/consolidado
        ?ano[&empreendimento_ids=&...]          # soma de N empreendimentos (Fase 2)

# Lançamentos
PUT    /api/lancamentos/bulk                    # upsert em lote (valor 0 remove)
```

## Decisões de design

**1. AG Grid Community sem features Enterprise.**
Tree data nativo e clipboard são Enterprise no AG Grid v32+. Implementamos
manualmente:
- **Árvore:** `flatten(arvore, expanded)` produz lista plana com depth e chevron
  custom no cell renderer da coluna "Conta".
- **Paste do Excel:** `onCellKeyDown` intercepta Cmd/Ctrl+V, lê
  `navigator.clipboard.readText()`, parseia matriz `\t`/`\n` e aplica via
  `editCells` (mesmo path que single-edit).

**2. Edits otimistas via TanStack Query cache.**
Cada edit chama `queryClient.setQueryData(['grade', id], applyEdit(...))`.
`applyEdit` clona a árvore e roda o mesmo algoritmo recursivo do backend
(`services/grade.py`). Em erro, `invalidateQueries` força refetch do servidor.

**3. Save em bulk com debounce 300ms + last-write-wins.**
`Map<"conta-mes", PendingEdit>` acumula edits. Editar a mesma célula 3x antes
do flush dispara um único save com a versão final.

**4. Valor 0 remove o lançamento.**
Backend deleta a linha em vez de armazenar zeros. Simplifica a reconciliação
e mantém a tabela enxuta.

**5. Parser flexível BR/US** para edição manual.
`parseNumber("1.000,50") = 1000.5`, `parseNumber("1000.50") = 1000.5`.
Heurística: tem vírgula → BR; senão → US.

**6. SQLite + `create_all` no startup.**
Sem Alembic no MVP — single-user, banco como arquivo. Quando virar
multi-usuário (Fase 2+), trocar por Postgres + Alembic.

## O que NÃO está aqui (próximas fases)

- Export para Sienge (Fase 3)
- Importação de realizado e DRE orçado x realizado (Fase 4)
- Dashboards de performance (Fase 5)
- Auth / multi-usuário / deploy em nuvem

## Backup do banco

`backend/orcamento.db` é o seu orçamento. Versionar com `git` ou cópia diária
para Drive desde o dia 1 (gitignored hoje — descomente em `backend/.gitignore`
quando quiser commitar).
