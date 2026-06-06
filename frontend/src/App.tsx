import { useEffect, useMemo, useState } from "react";
import { BudgetGrid } from "./components/BudgetGrid";
import { EmpreendimentoSelector } from "./components/EmpreendimentoSelector";
import {
  ConsolidadoSelectorModal,
  useConsolidadoSelecionados,
} from "./components/ConsolidadoSelector";
import { GerenciarEmpreendimentosModal } from "./components/GerenciarEmpreendimentosModal";
import { VersaoSelector } from "./components/VersaoSelector";
import {
  useEmpreendimentos,
  useGrade,
  useGradeConsolidada,
  useGradeConsolidadaPlurianual,
  useGradePlurianual,
  useOrcamento,
} from "./hooks/useGrade";
import { useVersoes } from "./hooks/useOrcamentoMutations";
import { useSelection } from "./hooks/useSelection";
import { supabase } from "./api/supabase";

export default function App() {
  const { selection, update } = useSelection();
  const empreendimentos = useEmpreendimentos();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [gerenciarOpen, setGerenciarOpen] = useState(false);

  const empreendimentoAtivo = useMemo(() => {
    if (!empreendimentos.data) return undefined;
    const ativos = empreendimentos.data.filter((e) => e.ativo);
    if (selection.empreendimento) {
      return (
        ativos.find((e) => e.codigo === selection.empreendimento) ?? ativos[0]
      );
    }
    return ativos[0];
  }, [empreendimentos.data, selection.empreendimento]);

  // Auto-corrige a URL no modo individual
  useEffect(() => {
    if (
      selection.modo === "individual" &&
      empreendimentoAtivo &&
      selection.empreendimento !== empreendimentoAtivo.codigo
    ) {
      update({ empreendimento: empreendimentoAtivo.codigo });
    }
  }, [empreendimentoAtivo, selection.empreendimento, selection.modo, update]);

  const versoes = useVersoes(
    selection.modo === "individual" ? empreendimentoAtivo?.id : undefined,
    selection.ano,
  );
  const orcamento = useOrcamento(
    empreendimentoAtivo?.id,
    selection.ano,
    selection.versao,
  );
  const grade = useGrade(
    selection.modo === "individual" ? orcamento.data?.id : undefined,
  );

  const consolidado = useConsolidadoSelecionados(empreendimentos.data ?? []);
  const gradeConsolidada = useGradeConsolidada(
    selection.ano,
    consolidado.ids,
    selection.modo === "consolidado" && selection.vista !== "plurianual",
  );

  const isPlurianual = selection.vista === "plurianual";
  const isPlurianualInd = selection.modo === "individual" && isPlurianual;
  const isPlurianualCons = selection.modo === "consolidado" && isPlurianual;
  const plurianual = useGradePlurianual(
    empreendimentoAtivo?.id,
    empreendimentoAtivo?.ano_base ?? undefined,
    isPlurianualInd,
  );
  const anoBaseConsol = (() => {
    const bases = (empreendimentos.data ?? [])
      .filter((e) => consolidado.ids.includes(e.id) && e.ano_base != null)
      .map((e) => e.ano_base as number);
    return bases.length ? Math.min(...bases) : selection.ano;
  })();
  const consolPlurianual = useGradeConsolidadaPlurianual(
    consolidado.ids,
    anoBaseConsol,
    isPlurianualCons,
  );

  // estados de loading separados por modo
  const isLoadingIndividual =
    selection.modo === "individual" &&
    (empreendimentos.isLoading ||
      (isPlurianual
        ? plurianual.isLoading
        : orcamento.isLoading || grade.isLoading));
  const isLoadingConsolidado =
    selection.modo === "consolidado" &&
    (empreendimentos.isLoading ||
      (isPlurianualCons ? consolPlurianual.isLoading : gradeConsolidada.isLoading));

  if (isLoadingIndividual || isLoadingConsolidado) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        Carregando…
      </div>
    );
  }

  const erro =
    selection.modo === "individual"
      ? (empreendimentos.error ??
        (isPlurianualInd ? plurianual.error : (orcamento.error ?? grade.error)))
      : (empreendimentos.error ??
        (isPlurianualCons ? consolPlurianual.error : gradeConsolidada.error));
  if (erro) {
    return (
      <div className="h-full flex items-center justify-center">
        <pre className="p-4 bg-red-50 text-red-700 border border-red-200 rounded text-sm whitespace-pre-wrap max-w-2xl">
          {String(erro)}
        </pre>
      </div>
    );
  }

  // Resolução do dataset que vai pro grid
  const isConsolidado = selection.modo === "consolidado";
  const empreendimentosLista = empreendimentos.data ?? [];
  const ativos = empreendimentosLista.filter((e) => e.ativo);

  let gridArvore;
  let gridTotaisMes;
  let gridTotalGeral;
  let gridOrcamentoId: number | undefined;
  let infoText = "";
  let tituloHeader = "";
  let tituloExport = "";
  let notasOrcamentoId: number | undefined;
  let colunas: string[] | undefined;

  if (isConsolidado && isPlurianualCons) {
    if (!consolPlurianual.data) {
      return (
        <div className="h-full flex items-center justify-center text-gray-500">
          Sem dados.
        </div>
      );
    }
    const gc = consolPlurianual.data;
    gridArvore = gc.arvore;
    gridTotaisMes = gc.totais_mes;
    gridTotalGeral = gc.total_geral;
    gridOrcamentoId = undefined;
    colunas = gc.anos.map(String);
    infoText = `${gc.anos[0]}–${gc.anos[gc.anos.length - 1]} · consolidado plurianual · ${gc.empreendimentos_incluidos.length} empreendimentos`;
    tituloHeader = "Consolidado";
    tituloExport = `Consolidado plurianual · ${gc.anos[0]}–${gc.anos[gc.anos.length - 1]}`;
  } else if (isConsolidado) {
    if (!gradeConsolidada.data) {
      return (
        <div className="h-full flex items-center justify-center text-gray-500">
          Sem dados.
        </div>
      );
    }
    const g = gradeConsolidada.data;
    gridArvore = g.arvore;
    gridTotaisMes = g.totais_mes;
    gridTotalGeral = g.total_geral;
    gridOrcamentoId = undefined; // readonly
    infoText = `${g.ano} · soma de ${g.empreendimentos_incluidos.length} empreendimentos`;
    tituloHeader = "Consolidado";
    tituloExport = `Orçamento Consolidado · ${g.ano} · soma de ${g.empreendimentos_incluidos.length} empreendimentos`;
  } else if (isPlurianualInd) {
    if (!plurianual.data || !empreendimentoAtivo) {
      return (
        <div className="h-full flex items-center justify-center text-gray-500">
          Sem dados.
        </div>
      );
    }
    const gp = plurianual.data;
    gridArvore = gp.arvore;
    gridTotaisMes = gp.totais_mes;
    gridTotalGeral = gp.total_geral;
    gridOrcamentoId = undefined;
    colunas = gp.anos.map(String);
    infoText = `${gp.anos[0]}–${gp.anos[gp.anos.length - 1]} · visão plurianual (7 anos) · só leitura`;
    tituloHeader = empreendimentoAtivo.nome;
    tituloExport = `Orçamento plurianual — ${empreendimentoAtivo.codigo} ${empreendimentoAtivo.nome} · ${gp.anos[0]}–${gp.anos[gp.anos.length - 1]}`;
  } else {
    if (!grade.data || !empreendimentoAtivo) {
      return (
        <div className="h-full flex items-center justify-center text-gray-500">
          Sem dados.
        </div>
      );
    }
    gridArvore = grade.data.arvore;
    gridTotaisMes = grade.data.totais_mes;
    gridTotalGeral = grade.data.total_geral;
    // Editável só em rascunho. Aprovado/arquivado viram readonly.
    gridOrcamentoId =
      grade.data.orcamento.status === "rascunho"
        ? grade.data.orcamento.id
        : undefined;
    infoText = `${grade.data.orcamento.ano}/v${grade.data.orcamento.versao} · ${grade.data.orcamento.status}`;
    tituloHeader = empreendimentoAtivo.nome;
    tituloExport = `Orçamento — ${empreendimentoAtivo.codigo} ${empreendimentoAtivo.nome} · ${grade.data.orcamento.ano}/v${grade.data.orcamento.versao} · ${grade.data.orcamento.status}`;
    notasOrcamentoId = grade.data.orcamento.id;
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b bg-white px-6 py-3 flex items-center gap-4">
        <h1 className="text-lg font-semibold text-gray-900">Orçamento</h1>
        <EmpreendimentoSelector
          empreendimentos={empreendimentosLista}
          selectedCodigo={empreendimentoAtivo?.codigo ?? null}
          consolidadoSelected={isConsolidado}
          onSelect={(sel) => {
            if (sel.modo === "consolidado") {
              update({ modo: "consolidado", empreendimento: null, versao: null });
            } else {
              update({
                modo: "individual",
                empreendimento: sel.codigo,
                versao: null,
              });
            }
          }}
        />
        <span className="text-sm text-gray-500">{tituloHeader}</span>
        {(empreendimentoAtivo || isConsolidado) && (
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded border overflow-hidden text-sm">
              <button
                type="button"
                className={`px-3 py-1 ${!isPlurianual ? "bg-blue-600 text-white" : "bg-white hover:bg-gray-50"}`}
                onClick={() => {
                  const base = empreendimentoAtivo?.ano_base;
                  const ano =
                    !isConsolidado && base != null && (selection.ano < base || selection.ano > base + 6)
                      ? base
                      : selection.ano;
                  update({ vista: "ano", ano });
                }}
              >
                Ano
              </button>
              <button
                type="button"
                className={`px-3 py-1 ${isPlurianual ? "bg-blue-600 text-white" : "bg-white hover:bg-gray-50"}`}
                onClick={() => update({ vista: "plurianual" })}
              >
                7 Anos
              </button>
            </div>
            {!isPlurianual && !isConsolidado && empreendimentoAtivo?.ano_base != null && (
              <select
                className="text-sm border rounded px-2 py-1 bg-white"
                value={selection.ano}
                onChange={(e) => update({ ano: Number(e.target.value), versao: null })}
              >
                {Array.from({ length: 7 }, (_, i) => empreendimentoAtivo.ano_base! + i).map(
                  (a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ),
                )}
              </select>
            )}
          </div>
        )}
        {!isConsolidado && !isPlurianual && versoes.data && versoes.data.length > 0 && orcamento.data && (
          <VersaoSelector
            versoes={versoes.data}
            selectedId={orcamento.data.id}
            onChangeVersao={(versao) => update({ versao })}
            onClonado={(versao) => update({ versao })}
          />
        )}
        {isConsolidado && (
          <button
            type="button"
            onClick={() => setSelectorOpen(true)}
            className="text-sm text-blue-600 hover:underline"
          >
            Selecionar empreendimentos
          </button>
        )}
        <button
          type="button"
          onClick={() => setGerenciarOpen(true)}
          className="ml-auto px-3 py-1.5 text-sm border rounded bg-white hover:bg-gray-50"
          title="Gerenciar empreendimentos"
        >
          ⚙ Empreendimentos
        </button>
        <button
          type="button"
          onClick={() => { location.href = 'https://rmichelon79.github.io/sopra-portal/'; }}
          className="px-3 py-1.5 text-sm border rounded bg-white hover:bg-gray-50"
          title="Voltar ao Portal (continua logado)"
        >
          ⌂ Portal
        </button>
        <button
          type="button"
          onClick={async () => {
            await supabase.auth.signOut();
            location.href = 'https://rmichelon79.github.io/sopra-portal/';
          }}
          className="px-3 py-1.5 text-sm border rounded bg-white hover:bg-gray-50 text-gray-500"
          title="Sair"
        >
          🔒 Sair
        </button>
      </header>

      {isConsolidado && gradeConsolidada.data && (
        <div className="bg-blue-50 border-b border-blue-200 px-6 py-2 text-sm text-blue-800 flex items-center gap-2">
          <span>📊</span>
          <span>
            <strong>Modo consolidado</strong> — somando{" "}
            {gradeConsolidada.data.empreendimentos_incluidos.length}{" "}
            {gradeConsolidada.data.empreendimentos_incluidos.length === 1
              ? "empreendimento"
              : "empreendimentos"}
            :{" "}
            {gradeConsolidada.data.empreendimentos_incluidos
              .map((id) => ativos.find((e) => e.id === id)?.codigo ?? `#${id}`)
              .join(", ")}
            . Edição desabilitada.
          </span>
        </div>
      )}

      <main className="flex-1 min-h-0">
        <BudgetGrid
          arvore={gridArvore}
          totais_mes={gridTotaisMes}
          total_geral={gridTotalGeral}
          orcamento_id={gridOrcamentoId}
          infoText={infoText}
          tituloExport={tituloExport}
          notasOrcamentoId={notasOrcamentoId}
          colunas={colunas}
        />
      </main>

      {selectorOpen && (
        <ConsolidadoSelectorModal
          empreendimentos={empreendimentosLista}
          selectedIds={consolidado.ids}
          onChange={consolidado.setIds}
          onClose={() => setSelectorOpen(false)}
        />
      )}
      {gerenciarOpen && (
        <GerenciarEmpreendimentosModal
          empreendimentos={empreendimentosLista}
          onClose={() => setGerenciarOpen(false)}
        />
      )}
    </div>
  );
}
