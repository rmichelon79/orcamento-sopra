# Orçamento Sopra — Fase 2: Multi-empreendimento, Consolidação e Versionamento

> Continuação da Fase 1 (ver [spec-mvp-fase-1.md](spec-mvp-fase-1.md)).
> Este documento descreve o que foi entregue na Fase 2 e por quê.

---

## 1. Escopo

Adicionar à plataforma da Fase 1:

- **Multi-empreendimento** — operar a Sopra junto de Altana, Aria, Bororo etc., todos no mesmo plano de contas
- **Consolidação** — visualizar a soma de N empreendimentos como se fosse um único orçamento (read-only)
- **Versionamento de orçamento** — manter v1 / v2 / v3 do orçamento de um empreendimento dentro do mesmo ano, com status `rascunho` / `aprovado` / `arquivado` e bloqueio automático de edição em versões fora de rascunho

**Fora de escopo (Fase 3+):** export Sienge, importação de realizado, dashboards de performance, multi-usuário e auth.

---

## 2. Decisões de design fechadas com o usuário

| # | Decisão | Por quê |
|---|---|---|
| 1 | **Plano de contas único e compartilhado** entre todos os empreendimentos | Soma direta na consolidação (mesma `conta_id` agrega valores). Operacionalmente simples. |
| 2 | **Consolidado configurável** — usuário escolhe quais incluir via modal de checkboxes | Flexibilidade. Default = todos ativos. Persistido em localStorage (`consolidado_empreendimento_ids`). |
| 3 | **Consolidado read-only** | Editar uma soma é semanticamente errado: cada lançamento pertence a um empreendimento. |
| 4 | **Banco resetado** ao começar a Fase 2 | Estado limpo. 4 empreendimentos sem lançamentos. |
| 5 | **Versionamento exposto na UI** (dropdown de versão + status) | Critério explícito do usuário. Versões `aprovado`/`arquivado` ficam read-only. |

---

## 3. Modelo de dados — sem mudanças

O schema da Fase 1 já suportava tudo: `empreendimento` independente, `orcamento` único por `(empreendimento_id, ano, versao)`, `lancamento` ligado a `orcamento` e `conta`. Plano de contas é global.

A única mudança relevante: o **seed** agora cria 4 empreendimentos (`ALTANA`, `ARIA`, `BORORO`, `SOPRA`), cada um com orçamento `2026/v1` em rascunho.

---

## 4. API REST — novos endpoints

```
# CRUD de empreendimento (antes só GET listar/detalhar)
POST   /api/empreendimento                              # criar
PUT    /api/empreendimento/{id}                         # editar (codigo, nome, ativo)
DELETE /api/empreendimento/{id}                         # bloqueia se tem orçamento

# Consolidação
GET    /api/orcamento/consolidado?ano=Y                 # soma todos os ativos
GET    /api/orcamento/consolidado?ano=Y
        &empreendimento_ids=1&empreendimento_ids=2      # subset escolhido

# Versionamento
GET    /api/orcamento/versoes?empreendimento_id=X&ano=Y # lista versões
POST   /api/orcamento/{id}/clonar                       # cria versão N+1 em rascunho
                                                         # com lançamentos copiados
```

`PUT /api/orcamento/{id}` (já existente) muda o status entre `rascunho` / `aprovado` / `arquivado`.

---

## 5. Frontend — componentes novos

```
src/
├── hooks/
│   ├── useEmpreendimentos.ts          mutations CRUD de empreendimento
│   ├── useOrcamentoMutations.ts       useVersoes, useClonar, useAtualizarStatus
│   ├── useSelection.ts                estado URL (empreendimento, ano, versão, modo)
│   └── useGrade.ts                    + useGradeConsolidada
├── components/
│   ├── EmpreendimentoSelector.tsx     dropdown principal (4 emp + Consolidado)
│   ├── VersaoSelector.tsx             dropdown de versão + badge + botões
│   ├── EmpreendimentoFormModal.tsx    create/edit
│   ├── GerenciarEmpreendimentosModal.tsx  tabela + ações
│   └── ConsolidadoSelector.tsx        modal de checkboxes + hook localStorage
```

`BudgetGrid.tsx` foi refatorado para receber `arvore / totais_mes / total_geral / orcamento_id / infoText` em vez de `data: GradeResponse`. Modo readonly é deduzido de `orcamento_id === undefined`.

---

## 6. UX dos modos

### 6.1 Modo individual

URL: `?empreendimento=SOPRA&ano=2026&versao=2`

- Dropdown de empreendimento à esquerda
- Dropdown de versão + badge de status (rascunho/aprovado/arquivado) + botões "+ Nova versão" / "Aprovar" / "Reabrir" / "Arquivar"
- Versão `rascunho` → editável (edição em célula, CRUD de contas, etc.)
- Versão `aprovado` ou `arquivado` → **read-only** (mesmo modo do consolidado)

### 6.2 Modo consolidado

URL: `?modo=consolidado&ano=2026`

- Dropdown mostra "Consolidado (todos ativos)" selecionado
- Banner azul: "📊 Modo consolidado — somando N empreendimentos: X, Y, Z. Edição desabilitada."
- Link "Selecionar empreendimentos" → modal de checkboxes
- Backend retorna `empreendimentos_incluidos` + `versoes_usadas` (mapa id → versão usada)
- Versão usada por padrão = mais recente do ano (qualquer status)

### 6.3 Botão "⚙ Empreendimentos" (canto superior direito)

Abre `GerenciarEmpreendimentosModal` com tabela de todos os empreendimentos. Cada linha tem editar (✎) e excluir (×). Modal aninhado para criar/editar (`z-[60]` por cima de `z-50`).

---

## 7. Algoritmos críticos

### 7.1 Consolidação — backend (`services/grade.py::calcular_consolidado`)

1. Resolve a versão mais recente de cada empreendimento solicitado para o ano dado
2. Pega todos os `lancamento` desses orçamentos
3. **Soma por (conta_id, mes)** através das versões
4. Roda o mesmo `calcular_subtotais` recursivo da Fase 1

```python
lancamentos_por_conta: dict[tuple[int, int], Decimal] = {}
for l in lancs:
    chave = (l.conta_id, l.mes)
    lancamentos_por_conta[chave] = lancamentos_por_conta.get(chave, ZERO) + l.valor
```

### 7.2 Clonagem — backend (`services/orcamento.py::clonar`)

```python
proxima_versao = max(versao) + 1  # por (empreendimento_id, ano)
novo = Orcamento(empreendimento_id, ano, proxima_versao, status="rascunho")
db.add(novo)
db.flush()
for l in lancs_fonte:
    db.add(Lancamento(orcamento_id=novo.id, conta_id=l.conta_id, mes=l.mes, valor=l.valor))
db.commit()
```

Versão nova nasce em rascunho; cliente do API recebe o objeto e navega para ela.

### 7.3 Readonly automático — frontend (`App.tsx`)

```tsx
gridOrcamentoId =
  grade.data.orcamento.status === "rascunho"
    ? grade.data.orcamento.id
    : undefined;  // ← undefined = BudgetGrid em readonly
```

Aproveita a refatoração do `BudgetGrid` (que já tinha `readonly = orcamento_id === undefined` para o modo consolidado).

---

## 8. Testes

29 testes pytest no total (11 Fase 1 + 18 novos da Fase 2):

- `test_consolidado.py` — 6 testes (soma, subset, default, versão mais recente, ignore sem orçamento, propagação)
- `test_empreendimento_crud.py` — 7 testes (criar, código duplicado, atualizar, code clash, excluir, bloqueio com orçamento, listar filtro)
- `test_orcamento_versionamento.py` — 5 testes (clonar próxima versão, copia lançamentos, versões sucessivas, isolamento, atualizar status)

Todos os testes da Fase 1 continuam passando.

---

## 9. O que ficou pendente para possível polimento futuro

- **Confirmação ao trocar de empreendimento/versão com edits pendentes** — atualmente o `useGradeEditor` faz `void flush()` no cleanup (fire-and-forget). Funciona em 99% dos casos. Idealmente: lift `useGradeEditor` pro App e fazer `await flushNow()` antes de chamar `update()` da seleção.
- **Aprovar exigir validação** — hoje qualquer rascunho pode ser aprovado. No futuro pode ter regras: mínimo de N lançamentos, status anterior ≠ arquivado, etc.
- **Histórico/auditoria** — quem aprovou/arquivou, quando, comentário. Schema atual não tem `usuario`/`atualizado_em`/`atualizado_por` — entra com auth na Fase de cloud.
- **Comparação entre versões** — diff visual entre v1 e v2 do mesmo orçamento. Útil para revisão.

---

## 10. Como rodar

Sem mudanças desde a Fase 1 — ver [README.md](README.md). Banco foi resetado: o primeiro `python -m app.seed` cria os 4 empreendimentos.
