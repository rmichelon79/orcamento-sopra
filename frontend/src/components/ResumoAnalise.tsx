import { useMemo, useState } from "react";
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

/** Achata a árvore mantendo apenas níveis 1 e 2, na ordem da hierarquia. */
function flatNivel2(nodes: GradeNode[], out: GradeNode[] = []): GradeNode[] {
  for (const n of nodes) {
    if (n.nivel <= 2) out.push(n);
    if (n.nivel < 2) flatNivel2(n.filhas ?? [], out);
  }
  return out;
}

function ResumoTabela({
  titulo,
  subtitulo,
  arvore,
  anos,
  totais,
  totalGeral,
}: {
  titulo: string;
  subtitulo?: string;
  arvore: GradeNode[];
  anos: number[];
  totais: string[];
  totalGeral: string;
}) {
  const rows = flatNivel2(arvore);
  return (
    <div className="mb-10">
      <div className="text-base font-bold text-gray-900">{titulo}</div>
      {subtitulo && <div className="text-xs text-gray-500 mb-2">{subtitulo}</div>}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-100 text-gray-600 text-xs uppercase">
            <th className="text-left p-2">Conta</th>
            {anos.map((a) => (
              <th key={a} className="text-right p-2">{a}</th>
            ))}
            <th className="text-right p-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((n) => {
            const isRoot = n.nivel === 1;
            const total = n.valores.reduce((s, v) => s + Number(v || 0), 0);
            return (
              <tr key={n.id} className={isRoot ? "font-bold border-t border-gray-300" : "text-gray-700"}>
                <td className="p-2" style={{ paddingLeft: (n.nivel - 1) * 18 + 8 }}>
                  {n.nome}
                </td>
                {n.valores.map((v, i) => (
                  <td key={i} className="text-right p-2 tabular-nums">{fmt(v)}</td>
                ))}
                <td className="text-right p-2 tabular-nums">{fmt(total)}</td>
              </tr>
            );
          })}
          <tr style={{ background: "#000", color: "#fff", fontWeight: 700 }}>
            <td className="p-2">Total geral</td>
            {totais.map((v, i) => (
              <td key={i} className="text-right p-2 tabular-nums">{fmt(v)}</td>
            ))}
            <td className="text-right p-2 tabular-nums">{fmt(totalGeral)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * Aba de Resumo (análise): consolidado + detalhamento por empreendimento,
 * todos em nível 2, por ano. Somente leitura.
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

  const cons = useGradeConsolidadaPlurianual(consol.ids, anoBase, consol.ids.length > 0);

  // Grade plurianual de cada empreendimento selecionado, alinhada ao mesmo ano-base
  const porEmp = useQueries({
    queries: consol.ids.map((id) => ({
      queryKey: ["gradePlurianual", id, anoBase],
      queryFn: () => api.gradePlurianual(id, anoBase),
      enabled: consol.ids.length > 0,
    })),
  });

  const anos = cons.data?.anos ?? Array.from({ length: 7 }, (_, i) => anoBase + i);
  const carregando = cons.isLoading || porEmp.some((q) => q.isLoading);

  const nomeEmp = (id: string) => {
    const e = lista.find((x) => x.id === id);
    return e ? `${e.codigo} — ${e.nome}` : id;
  };

  return (
    <div className="fixed inset-0 z-40 bg-white flex flex-col">
      <header className="flex items-center gap-3 border-b px-6 py-3 shrink-0">
        <div className="font-semibold text-gray-800">
          📊 Resumo (análise) — nível 2 · por ano
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

      <div className="flex-1 min-h-0 overflow-auto p-6">
        {consol.ids.length === 0 ? (
          <div className="text-gray-500">Selecione ao menos um empreendimento para o resumo.</div>
        ) : carregando ? (
          <div className="text-gray-500">Carregando…</div>
        ) : (
          <>
            {cons.data && (
              <ResumoTabela
                titulo={`Consolidado — ${consol.ids.length} empreendimento${consol.ids.length > 1 ? "s" : ""}`}
                subtitulo={`${anos[0]}–${anos[anos.length - 1]} · soma de ${consol.ids.map(nomeEmp).join(", ")}`}
                arvore={cons.data.arvore}
                anos={anos}
                totais={cons.data.totais_mes}
                totalGeral={cons.data.total_geral}
              />
            )}
            {consol.ids.map((id, i) => {
              const d = porEmp[i]?.data;
              if (!d) return null;
              return (
                <ResumoTabela
                  key={id}
                  titulo={nomeEmp(id)}
                  arvore={d.arvore}
                  anos={d.anos ?? anos}
                  totais={d.totais_mes}
                  totalGeral={d.total_geral}
                />
              );
            })}
          </>
        )}
      </div>

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
