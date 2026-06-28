import { useMemo, useState } from "react";
import { useEmpreendimentos, useGradeConsolidadaPlurianual } from "../hooks/useGrade";
import { useConsolidadoSelecionados, ConsolidadoSelectorModal } from "./ConsolidadoSelector";
import { BudgetGrid } from "./BudgetGrid";
import type { GradeNode } from "../types/api";

/** Poda a árvore para mostrar só níveis 1 e 2 (o nível 2 vira folha; níveis 3+ somem). */
function prune2(nodes: GradeNode[]): GradeNode[] {
  return nodes.map((n) => ({
    ...n,
    filhas: n.nivel >= 2 ? [] : prune2(n.filhas ?? []),
  }));
}

/**
 * Aba de Resumo para análise: empreendimentos selecionados, consolidados por ano,
 * mostrados apenas até o nível 2 do plano de contas. Somente leitura.
 */
export function ResumoAnalise({ onClose }: { onClose: () => void }) {
  const emps = useEmpreendimentos();
  const lista = emps.data ?? [];
  const consol = useConsolidadoSelecionados(lista);
  const [selOpen, setSelOpen] = useState(false);

  const anoBase = useMemo(() => {
    const bases = lista
      .filter((e) => consol.ids.includes(e.id) && e.ano_base != null)
      .map((e) => e.ano_base as number);
    return bases.length ? Math.min(...bases) : new Date().getFullYear();
  }, [lista, consol.ids]);

  const g = useGradeConsolidadaPlurianual(consol.ids, anoBase, consol.ids.length > 0);
  const arvorePodada = useMemo(() => (g.data ? prune2(g.data.arvore) : []), [g.data]);

  const codigos = consol.ids
    .map((id) => lista.find((e) => e.id === id)?.codigo ?? null)
    .filter(Boolean)
    .join(", ");

  return (
    <div className="fixed inset-0 z-40 bg-white flex flex-col">
      <header className="flex items-center gap-3 border-b px-6 py-3">
        <div className="font-semibold text-gray-800">
          📊 Resumo (análise) — nível 2 · consolidado por ano
        </div>
        <button
          type="button"
          onClick={() => setSelOpen(true)}
          className="text-sm text-blue-600 hover:underline"
        >
          Selecionar empreendimentos
        </button>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto px-3 py-1.5 text-sm border rounded bg-white hover:bg-gray-50"
        >
          ← Voltar ao orçamento
        </button>
      </header>

      {consol.ids.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          Selecione ao menos um empreendimento para o resumo.
        </div>
      ) : g.isLoading ? (
        <div className="flex-1 flex items-center justify-center text-gray-500">Carregando…</div>
      ) : g.error ? (
        <div className="flex-1 flex items-center justify-center">
          <pre className="p-4 bg-red-50 text-red-700 border border-red-200 rounded text-sm whitespace-pre-wrap max-w-2xl">
            {String(g.error)}
          </pre>
        </div>
      ) : g.data ? (
        <main className="flex-1 min-h-0">
          <BudgetGrid
            arvore={arvorePodada}
            totais_mes={g.data.totais_mes}
            total_geral={g.data.total_geral}
            orcamento_id={undefined}
            infoText={`${g.data.anos[0]}–${g.data.anos[g.data.anos.length - 1]} · nível 2 · ${g.data.empreendimentos_incluidos.length} empreendimentos${codigos ? " (" + codigos + ")" : ""}`}
            tituloExport={`Resumo consolidado por ano · ${g.data.anos[0]}–${g.data.anos[g.data.anos.length - 1]}`}
            colunas={g.data.anos.map(String)}
          />
        </main>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-500">Sem dados.</div>
      )}

      {selOpen && (
        <ConsolidadoSelectorModal
          empreendimentos={lista}
          selectedIds={consol.ids}
          onChange={consol.setIds}
          onClose={() => setSelOpen(false)}
        />
      )}
    </div>
  );
}
