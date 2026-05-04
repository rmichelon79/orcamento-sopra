# Orçamento Sopra — Especificação Técnica MVP Fase 1

> Documento para iniciar o desenvolvimento via Claude Code.
> Cole este arquivo no diretório raiz do projeto e oriente o Claude Code a executar fase por fase.

---

## 1. Contexto e Objetivo

A Sopra Incorporadora precisa de uma camada de **planejamento orçamentário** com hierarquia rica e ergonomia tipo planilha, que alimente posteriormente o módulo **Orçamento Empresarial do Sienge** (já contratado, plano financeiro estruturado, API disponível).

A dor atual: planilhas Excel não suportam bem hierarquia profunda com subtotais dinâmicos. O Orçamento Empresarial do Sienge resolve o operacional, mas é engessado para a fase de construção do orçamento.

Esta ferramenta é a **camada de planejamento** — onde se constrói, simula e fecha o orçamento. Depois ele é exportado para o Sienge.

---

## 2. Escopo do MVP — Fase 1

**Incluído:**
- Cadastro de plano de contas hierárquico (até 5 níveis)
- Lançamento de orçamento mês a mês (12 meses) para **um único empreendimento**
- Subtotais e totalizações automáticas em todos os níveis
- Persistência local (SQLite, single-user)
- UI tipo planilha com tree-grid (expand/collapse, edição em célula, copy-paste)

**NÃO incluído (vai para fases seguintes):**
- Multi-empreendimento e consolidação (Fase 2)
- Export para Sienge (Fase 3)
- Importação de realizado e DRE orçado x realizado (Fase 4)
- Dashboards de performance (Fase 5)
- Multi-usuário, autenticação, deploy em nuvem

---

## 3. Stack Técnica

| Camada | Tecnologia | Motivo |
|---|---|---|
| Backend | Python 3.11+ / FastAPI | Forte com Claude Code, API REST simples |
| ORM / DB | SQLAlchemy + SQLite | Zero setup, arquivo único |
| Validação | Pydantic v2 | Nativo do FastAPI |
| Frontend | React 18 + Vite + TypeScript | Padrão moderno, build rápido |
| Tree-grid | **AG Grid Community** | Hierarquia nativa, edição em célula, copy-paste — *componente crítico* |
| HTTP client | TanStack Query (React Query) | Cache e invalidação de queries |
| Estilo | Tailwind CSS | Produtividade |

---

## 4. Modelo de Dados

```sql
-- Empreendimento (Fase 1: apenas um registro fixo)
CREATE TABLE empreendimento (
  id INTEGER PRIMARY KEY,
  codigo TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  ativo BOOLEAN DEFAULT 1
);

-- Plano de Contas (árvore, até 5 níveis)
CREATE TABLE conta (
  id INTEGER PRIMARY KEY,
  codigo TEXT UNIQUE NOT NULL,           -- ex: "3.1.2.1"
  nome TEXT NOT NULL,
  parent_id INTEGER REFERENCES conta(id),
  nivel INTEGER NOT NULL,                -- 1 a 5
  tipo TEXT NOT NULL,                    -- 'receita' | 'custo' | 'despesa' | 'investimento' | 'financeiro'
  natureza TEXT NOT NULL,                -- 'sintetica' (agrupa) | 'analitica' (aceita lançamento)
  ordem INTEGER NOT NULL,
  ativo BOOLEAN DEFAULT 1,
  CHECK (nivel BETWEEN 1 AND 5),
  CHECK (natureza IN ('sintetica', 'analitica'))
);

-- Orçamento (uma versão por ano por empreendimento)
CREATE TABLE orcamento (
  id INTEGER PRIMARY KEY,
  empreendimento_id INTEGER NOT NULL REFERENCES empreendimento(id),
  ano INTEGER NOT NULL,
  versao INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'rascunho',  -- 'rascunho' | 'aprovado' | 'arquivado'
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(empreendimento_id, ano, versao)
);

-- Lançamentos mensais (apenas em contas analíticas)
CREATE TABLE lancamento (
  id INTEGER PRIMARY KEY,
  orcamento_id INTEGER NOT NULL REFERENCES orcamento(id),
  conta_id INTEGER NOT NULL REFERENCES conta(id),
  mes INTEGER NOT NULL,                  -- 1 a 12
  valor DECIMAL(15,2) NOT NULL DEFAULT 0,
  UNIQUE(orcamento_id, conta_id, mes),
  CHECK (mes BETWEEN 1 AND 12)
);
```

**Regras de negócio:**
- Contas **sintéticas** não aceitam lançamento direto — seu valor é a soma dos filhos.
- Contas **analíticas** aceitam lançamento e não podem ter filhas.
- Subtotais são calculados em tempo real (no backend ou frontend, ver seção 6).
- Código da conta segue convenção pontuada por nível: `1`, `1.1`, `1.1.2`, etc.

---

## 5. API REST (FastAPI)

```
GET    /api/empreendimento                       # lista
GET    /api/empreendimento/{id}                  # detalhe

GET    /api/contas                               # árvore completa (recursiva)
POST   /api/contas                               # criar
PUT    /api/contas/{id}                          # editar
DELETE /api/contas/{id}                          # excluir (só se sem filhas e sem lançamentos)
POST   /api/contas/reorder                       # reordenar (drag-and-drop futuro)

GET    /api/orcamento?empreendimento_id=X&ano=Y  # busca orçamento ativo
POST   /api/orcamento                            # cria novo orçamento
PUT    /api/orcamento/{id}                       # atualiza status

GET    /api/orcamento/{id}/grade                 # RETORNA TUDO PARA RENDERIZAR A PLANILHA:
                                                 # árvore de contas + valores mês a mês + totais calculados

PUT    /api/lancamentos/bulk                     # atualização em lote (edição na grid):
                                                 # body: [{conta_id, mes, valor}, ...]
```

A rota crítica é `/api/orcamento/{id}/grade` — ela monta a estrutura completa pronta para o tree-grid, com totais já calculados em cada nível sintético.

---

## 6. Funcionalidades Detalhadas e Critérios de Aceitação

### 6.1 Plano de Contas
- [ ] Posso criar conta nível 1 sem `parent_id`
- [ ] Posso criar conta filha em qualquer nível (1 a 4) — gera filha no nível seguinte
- [ ] Sistema bloqueia criação de filha em conta de nível 5
- [ ] Sistema bloqueia conversão de conta analítica em sintética se já tem lançamentos
- [ ] Código é gerado automaticamente baseado no `parent.codigo + "." + ordem`

### 6.2 Grade Orçamentária (componente principal)
- [ ] Tree-grid mostra: Código | Conta | Jan | Fev | … | Dez | Total
- [ ] Linhas sintéticas exibem subtotal calculado, em **negrito**, **não editáveis**
- [ ] Linhas analíticas têm células editáveis em cada mês
- [ ] Expand/collapse por linha, com persistência da preferência
- [ ] Coluna "Total" mostra soma dos 12 meses por linha
- [ ] Linha de rodapé mostra total do mês (soma de todas as analíticas)
- [ ] Edição em célula com `Tab` (próximo mês), `Enter` (confirma), `Esc` (cancela)
- [ ] Suporte a **copy-paste** de uma linha de 12 valores vinda do Excel
- [ ] Ao alterar valor, subtotais recalculam **imediatamente** (otimista no front + bulk save no back)

### 6.3 Persistência
- [ ] Ao recarregar a página, tudo persiste
- [ ] Save é debounced (300ms após última edição) para não martelar a API
- [ ] Indicador visual de "salvando..." / "salvo"

### 6.4 Cálculo de subtotais
**Estratégia recomendada:** calcular no **backend** ao retornar `/api/orcamento/{id}/grade`, e recalcular **otimisticamente no frontend** durante a edição para resposta instantânea, com reconciliação após save.

Algoritmo (recursivo, bottom-up):
```python
def calcular_subtotais(no, lancamentos_por_conta):
    if no.natureza == 'analitica':
        no.valores = [lancamentos_por_conta.get((no.id, m), 0) for m in range(1,13)]
    else:
        no.valores = [0] * 12
        for filha in no.filhas:
            calcular_subtotais(filha, lancamentos_por_conta)
            for m in range(12):
                no.valores[m] += filha.valores[m]
    no.total = sum(no.valores)
```

---

## 7. Estrutura de Projeto

```
orcamento-sopra/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entry
│   │   ├── database.py          # SQLAlchemy setup
│   │   ├── models/              # ORM models
│   │   ├── schemas/             # Pydantic
│   │   ├── routers/             # endpoints
│   │   ├── services/            # lógica de negócio (cálculo de árvore)
│   │   └── seed.py              # dados iniciais
│   ├── requirements.txt
│   └── orcamento.db             # SQLite (gitignored)
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── BudgetGrid.tsx   # AG Grid wrapper — componente crítico
│   │   │   ├── ContaModal.tsx
│   │   │   └── Toolbar.tsx
│   │   ├── api/                 # fetch wrappers
│   │   ├── hooks/               # useBudget, useContas
│   │   └── types/
│   ├── package.json
│   └── vite.config.ts
├── README.md
└── orcamento-sopra-spec-mvp-fase-1.md  (este arquivo)
```

---

## 8. Roadmap de Implementação — Passo a Passo para o Claude Code

Execute uma etapa por vez. Valide cada uma antes de seguir.

**Etapa 1 — Backend base** (1-2 sessões)
1. Criar estrutura `backend/`, FastAPI, SQLAlchemy, SQLite
2. Criar models e migrations conforme schema da seção 4
3. Criar seed com Sopra como empreendimento e ~15 contas exemplo (3 níveis)
4. Implementar endpoints de contas (CRUD)
5. Testar via Swagger UI (`/docs`)

**Etapa 2 — Cálculo de árvore** (1 sessão)
1. Implementar service `calcular_grade(orcamento_id)` que retorna árvore com subtotais
2. Endpoint `GET /api/orcamento/{id}/grade`
3. Endpoint `PUT /api/lancamentos/bulk`
4. Testes unitários do cálculo recursivo

**Etapa 3 — Frontend base** (1-2 sessões)
1. Criar Vite + React + TS + Tailwind
2. Instalar AG Grid Community
3. Tela única: tabela hierárquica básica lendo da API, sem edição ainda
4. Validar visualmente que árvore e subtotais aparecem certos

**Etapa 4 — Edição** (2-3 sessões — *etapa crítica*)
1. Habilitar edição apenas em células de meses de linhas analíticas
2. Recálculo otimista no frontend ao editar
3. Save em bulk com debounce
4. Atalhos de teclado e copy-paste

**Etapa 5 — CRUD de contas** (1 sessão)
1. Modal de adicionar/editar conta
2. Botão de excluir com validação
3. Refresh da grade após mudança

**Etapa 6 — Polimento** (1 sessão)
1. Indicador "salvando..." / "salvo"
2. Formatação de moeda BRL
3. Confirmação ao sair com mudanças não salvas
4. README com instruções de execução local

---

## 9. Como Começar com Claude Code

```bash
# 1. Crie a pasta do projeto
mkdir orcamento-sopra && cd orcamento-sopra

# 2. Coloque este arquivo aqui dentro
mv ~/Downloads/orcamento-sopra-spec-mvp-fase-1.md .

# 3. Inicie o Claude Code
claude

# 4. Primeiro prompt:
```

> Leia o arquivo `orcamento-sopra-spec-mvp-fase-1.md`. Vamos executar a **Etapa 1 — Backend base** do roadmap (seção 8). Antes de começar, me confirme que entendeu o escopo e me diga o que vai criar. Não escreva código ainda.

A partir daí, conduza etapa por etapa.

---

## 10. Sinalizadores de Cuidado

- **AG Grid**: a versão Community atende. Não cair na licença Enterprise sem necessidade.
- **Performance da grade**: com plano de contas pequeno (até ~200 contas) não há gargalo. Acima disso, considerar virtualização.
- **Sem auth no MVP**: rodando localmente, sem rede. Quando virar multi-usuário (Fase 2+), adicionar autenticação.
- **Backup do SQLite**: o arquivo `orcamento.db` é o seu orçamento. Versionar com `git` (ou cópia diária para Drive) desde o dia 1.
- **Antes da Fase 3 (export Sienge)**: pegar o **layout XLS padrão do Orçamento Empresarial** com o suporte do Sienge — ele é o contrato que define a estrutura de exportação.
