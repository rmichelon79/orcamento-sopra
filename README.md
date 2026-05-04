# Orçamento Sopra — MVP Fase 1

Camada de planejamento orçamentário para a Sopra Incorporadora: hierarquia de
contas até 5 níveis, lançamentos mês a mês para um empreendimento, subtotais
calculados em tempo real, edição com debounce, paste do Excel.

A spec completa está em [`spec-mvp-fase-1.md`](spec-mvp-fase-1.md).

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
- Empreendimento `SOPRA`
- Plano de contas com 23 contas (5 níveis 1, 7 níveis 2, 11 níveis 3)
- Orçamento default `(SOPRA, 2026, v1)` em status `rascunho`

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

11 testes cobrindo o cálculo recursivo de grade e o bulk upsert de lançamentos.

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
GET    /api/empreendimento
GET    /api/empreendimento/{id}

GET    /api/contas                      # árvore completa (recursiva)
POST   /api/contas
PUT    /api/contas/{id}
DELETE /api/contas/{id}                 # 400 se tem filhas ou lançamentos
POST   /api/contas/reorder

GET    /api/orcamento?empreendimento_id&ano[&versao]
POST   /api/orcamento
PUT    /api/orcamento/{id}              # atualiza status
GET    /api/orcamento/{id}/grade        # árvore + 12 meses + totais

PUT    /api/lancamentos/bulk            # upsert em lote (valor 0 remove)
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

- Multi-empreendimento e consolidação (Fase 2)
- Export para Sienge (Fase 3)
- Importação de realizado e DRE orçado x realizado (Fase 4)
- Dashboards de performance (Fase 5)
- Auth / multi-usuário / deploy em nuvem

## Backup do banco

`backend/orcamento.db` é o seu orçamento. Versionar com `git` ou cópia diária
para Drive desde o dia 1 (gitignored hoje — descomente em `backend/.gitignore`
quando quiser commitar).
