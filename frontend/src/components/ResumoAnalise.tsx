import { useEffect, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { useEmpreendimentos, useGradeConsolidadaPlurianual } from "../hooks/useGrade";
import { useConsolidadoSelecionados, ConsolidadoSelectorModal } from "./ConsolidadoSelector";
import { api } from "../api/client";
import type { GradeNode } from "../types/api";

const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const fmt = (v: string | number | null | undefined): string => {
  const n = Number(v);
  return Number.isFinite(n) ? nf.format(Math.round(n)) : "";
};

/** Mapa id -> nó (achatando a árvore). */
function buildById(nodes: GradeNode[], map: Map<number, GradeNode> = new Map()): Map<number, GradeNode> {
  for (const n of nodes) {
    map.set(n.id, n);
    buildById(n.filhas ?? [], map);
  }
  return map;
}

type Linha = { node: GradeNode; nivel: number };

/**
 * Resumo (análise) por ano: empreendimentos nas colunas, contas nas linhas.
 * Só a raiz de despesas (saída) é detalhada em nível 2; as demais raízes em nível 1.
 */
export function ResumoAnalise({ onClose }: { onClose: () => void }) {
  const emps = useEmpreendimentos();
  const lista = emps.data ?? [];
  const consol = useConsolidadoSelecionados(lista);
  const [selOpen, setSelOpen] = useState(false);
  const [anoIdx, setAnoIdx] = useState(0);

  const anoBase = useMemo(() => {
    const bases = lista
      .filter((e) => consol.ids.includes(e.id) && e.ano_base != null)
      .map((e) => e.ano_base as number);
    return bases.length ? Math.min(...bases) : new Date().getFullYear();
  }, [lista, consol.ids]);

  const cons = useGradeConsolidadaPlurianual(consol.ids, anoBase, consol.ids.length > 0);

  const porEmp = useQueries({
    queries: consol.ids.map((id) => ({
      queryKey: ["gradePlurianual", id, anoBase],
      queryFn: () => api.gradePlurianual(id, anoBase),
      enabled: consol.ids.length > 0,
    })),
  });

  const anos = cons.data?.anos ?? Array.from({ length: 7 }, (_, i) => anoBase + i);
  useEffect(() => {
    if (anoIdx > anos.length - 1) setAnoIdx(0);
  }, [anos.length, anoIdx]);

  const carregando = cons.isLoading || porEmp.some((q) => q.isLoading);

  // Linhas: cada raiz (nível 1); a raiz de saída (despesas) detalha o nível 2.
  const linhas: Linha[] = useMemo(() => {
    if (!cons.data) return [];
    const out: Linha[] = [];
    for (const root of cons.data.arvore) {
      out.push({ node: root, nivel: 1 });
      if (root.tipo_orcamentario === "saida") {
        for (const c of root.filhas ?? []) out.push({ node: c, nivel: 2 });
      }
    }
    return out;
  }, [cons.data]);

  const consById = useMemo(() => (cons.data ? buildById(cons.data.arvore) : new Map()), [cons.data]);
  const empById = useMemo(
    () => porEmp.map((q) => (q.data ? buildById(q.data.arvore) : new Map<number, GradeNode>())),
    [porEmp],
  );

  const nomeEmp = (id: string) => lista.find((x) => x.id === id)?.codigo ?? id;
  const cell = (map: Map<number, GradeNode>, id: number) => fmt(map.get(id)?.valores[anoIdx]);

  return (
    <div className="fixed inset-0 z-40 bg-white flex flex-col">
      <header className="flex items-center gap-3 border-b px-6 py-3 shrink-0">
        <div className="font-semibold text-gray-800">📊 Resumo (análise) — por ano</div>
        <button type="button" onClick={() => setSelOpen(true)} className="text-sm text-blue-600 hover:underline">
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
      ) : carregando ? (
        <div className="flex-1 flex items-center justify-center text-gray-500">Carregando…</div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto p-6">
          {/* seletor de ano */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-sm text-gray-500">Ano:</span>
            {anos.map((a, i) => (
              <button
                key={a}
                type="button"
                onClick={() => setAnoIdx(i)}
                className={`px-3 py-1 text-sm rounded border ${
                  i === anoIdx ? "bg-blue-600 text-white border-blue-600" : "bg-white hover:bg-gray-50"
                }`}
              >
                {a}
              </button>
            ))}
          </div>

          <table className="text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-xs uppercase">
                <th className="text-left p-2 sticky left-0 bg-gray-100">Conta ({anos[anoIdx]})</th>
                {consol.ids.map((id) => (
                  <th key={id} className="text-right p-2 min-w-28">{nomeEmp(id)}</th>
                ))}
                <th className="text-right p-2 min-w-28 border-l">Consolidado</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ node, nivel }) => (
                <tr key={node.id} className={nivel === 1 ? "font-bold border-t border-gray-300" : "text-gray-700"}>
                  <td className="p-2 sticky left-0 bg-white" style={{ paddingLeft: (nivel - 1) * 18 + 8 }}>
                    {node.nome}
                  </td>
                  {consol.ids.map((id, i) => (
                    <td key={id} className="text-right p-2 tabular-nums">{cell(empById[i], node.id)}</td>
                  ))}
                  <td className="text-right p-2 tabular-nums border-l">{cell(consById, node.id)}</td>
                </tr>
              ))}
              <tr style={{ background: "#000", color: "#fff", fontWeight: 700 }}>
                <td className="p-2 sticky left-0" style={{ background: "#000" }}>Total geral</td>
                {consol.ids.map((id, i) => (
                  <td key={id} className="text-right p-2 tabular-nums">
                    {fmt(porEmp[i]?.data?.totais_mes[anoIdx])}
                  </td>
                ))}
                <td className="text-right p-2 tabular-nums border-l">{fmt(cons.data?.totais_mes[anoIdx])}</td>
              </tr>
            </tbody>
          </table>
        </div>
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
