import { useCallback, useEffect, useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { gerarXlsx, gerarMd, baixar } from "../api/export";
import { api } from "../api/client";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type CellStyle,
  type ColDef,
  type ICellRendererParams,
  type ValueFormatterParams,
  type ValueGetterParams,
  type ValueSetterParams,
} from "ag-grid-community";
import type {
  GradeNode,
  NaturezaConta,
  TipoConta,
  TipoOrcamentario,
} from "../types/api";
import { useGradeEditor, type SaveStatus } from "../hooks/useGradeEditor";
import { useExcluirConta } from "../hooks/useContas";
import { ContaModal } from "./ContaModal";

ModuleRegistry.registerModules([AllCommunityModule]);

const MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

interface Row {
  id: number;
  codigo: string;
  nome: string;
  natureza: NaturezaConta;
  tipo: TipoConta;
  ativo: boolean;
  nivel: number;
  parent_id: number | null;
  tipo_orcamentario: TipoOrcamentario;
  depth: number;
  hasChildren: boolean;
  total: string;
  valores: string[];
}

const NIVEL_MAX = 5;

type ModalState =
  | { mode: "create"; parent: { id: number; codigo: string; nome: string; nivel: number } | null }
  | { mode: "edit"; conta: Row }
  | null;

function flatten(
  nodes: GradeNode[],
  expanded: Set<number>,
  depth = 0,
  out: Row[] = [],
): Row[] {
  for (const n of nodes) {
    out.push({
      id: n.id,
      codigo: n.codigo,
      nome: n.nome,
      natureza: n.natureza,
      tipo: n.tipo,
      ativo: n.ativo,
      nivel: n.nivel,
      parent_id: n.parent_id,
      tipo_orcamentario: n.tipo_orcamentario,
      depth,
      hasChildren: n.filhas.length > 0,
      total: n.total,
      valores: n.valores,
    });
    if (n.filhas.length > 0 && expanded.has(n.id)) {
      flatten(n.filhas, expanded, depth + 1, out);
    }
  }
  return out;
}

function collectAllIds(nodes: GradeNode[], out: Set<number> = new Set()): Set<number> {
  for (const n of nodes) {
    if (n.filhas.length > 0) {
      out.add(n.id);
      collectAllIds(n.filhas, out);
    }
  }
  return out;
}

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

const numBR = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function toNumber(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Total / linha de rodapé: prefixado com R$. */
function formatBRL(v: string | number | null | undefined): string {
  const n = toNumber(v);
  if (n === null) return "";
  if (n === 0) return "—";
  return brl.format(n);
}

/** Células de mês: sem "R$ " (a coluna inteira é monetária). */
function formatCell(v: string | number | null | undefined): string {
  const n = toNumber(v);
  if (n === null) return "";
  if (n === 0) return "—";
  return numBR.format(n);
}

/** Aceita "1000", "1000.50", "1.000,50", "1000,50". Devolve NaN se não parseável. */
function parseNumber(input: unknown): number {
  if (typeof input === "number") return input;
  if (input == null) return NaN;
  const t = String(input).trim();
  if (!t) return 0;
  // Se tem vírgula, assume formato BR (pontos = milhar, vírgula = decimal)
  if (t.includes(",")) {
    return Number(t.replace(/\./g, "").replace(",", "."));
  }
  return Number(t);
}

/** Status indicator pill */
function StatusBadge({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  const map: Record<Exclude<SaveStatus, "idle">, { label: string; cls: string }> = {
    pending: { label: "editando…", cls: "bg-gray-100 text-gray-700" },
    saving: { label: "salvando…", cls: "bg-blue-100 text-blue-700" },
    saved: { label: "salvo ✓", cls: "bg-green-100 text-green-700" },
    error: { label: "erro ao salvar", cls: "bg-red-100 text-red-700" },
  };
  const cfg = map[status];
  return (
    <span className={`text-xs px-2 py-1 rounded ${cfg.cls}`}>{cfg.label}</span>
  );
}

interface Props {
  arvore: GradeNode[];
  totais_mes: string[];
  total_geral: string;
  /** Quando undefined, a grade fica em modo readonly (sem edits, sem CRUD). */
  orcamento_id?: number;
  /** Texto livre exibido na toolbar (ex: "2026/v1 · rascunho" ou "Soma de 4 emp."). */
  infoText: string;
  /** Título usado nos arquivos exportados (XLSX/MD). */
  tituloExport: string;
  /** Orçamento das anotações (sempre o individual; undefined no consolidado). */
  notasOrcamentoId?: number;
  /** Cabeçalhos das colunas de valor (default: 12 meses; 5 anos no modo plurianual). */
  colunas?: string[];
}

export function BudgetGrid({
  arvore,
  totais_mes,
  total_geral,
  orcamento_id,
  infoText,
  tituloExport,
  notasOrcamentoId,
  colunas = MESES,
}: Props) {
  const readonly = orcamento_id === undefined;
  const { editCell, editCells, status, erroMsg } = useGradeEditor(orcamento_id);
  const excluir = useExcluirConta();
  const [modal, setModal] = useState<ModalState>(null);
  const [erroCrud, setErroCrud] = useState<string | null>(null);

  // Anotações por conta (somente leitura quando readonly)
  const [notas, setNotas] = useState<Record<number, string>>({});
  const [notaModal, setNotaModal] = useState<{ contaId: number; codigo: string; nome: string } | null>(null);
  const [notaText, setNotaText] = useState("");
  const [notaSaving, setNotaSaving] = useState(false);
  useEffect(() => {
    if (notasOrcamentoId === undefined) { setNotas({}); return; }
    let alive = true;
    api.getNotas(notasOrcamentoId).then((n) => { if (alive) setNotas(n); }).catch(() => {});
    return () => { alive = false; };
  }, [notasOrcamentoId]);

  const salvarNota = async () => {
    if (!notaModal || notasOrcamentoId === undefined) return;
    setNotaSaving(true);
    try {
      await api.setNota(notasOrcamentoId, notaModal.contaId, notaText);
      setNotas((prev) => {
        const next = { ...prev };
        if (notaText.trim()) next[notaModal.contaId] = notaText.trim();
        else delete next[notaModal.contaId];
        return next;
      });
      setNotaModal(null);
    } catch (err) {
      setErroCrud(String(err).replace(/^Error: /, ""));
    } finally {
      setNotaSaving(false);
    }
  };

  const [expanded, setExpanded] = useState<Set<number>>(() =>
    collectAllIds(arvore),
  );

  const rows = useMemo(() => flatten(arvore, expanded), [arvore, expanded]);

  /** Exports gerados no cliente (sem backend). */
  const baixarXlsx = () => {
    baixar(gerarXlsx(arvore, totais_mes, total_geral, tituloExport), "orcamento.xlsx");
  };
  const baixarMd = () => {
    baixar(gerarMd(arvore, tituloExport), "orcamento.md", "text/markdown");
  };

  const handleExcluir = useCallback(
    async (row: Row) => {
      const ok = window.confirm(
        `Excluir conta ${row.codigo} ${row.nome}?\n\n` +
          "Não é possível desfazer. Backend bloqueia se houver filhas ou lançamentos.",
      );
      if (!ok) return;
      setErroCrud(null);
      try {
        await excluir.mutateAsync(row.id);
      } catch (err) {
        setErroCrud(String(err).replace(/^Error: /, ""));
      }
    },
    [excluir],
  );

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpanded(collectAllIds(arvore));
  const collapseAll = () => setExpanded(new Set());

  const columnDefs = useMemo<ColDef<Row>[]>(() => {
    const mesCols: ColDef<Row>[] = colunas.map((m, i) => ({
      headerName: m,
      colId: `mes_${i + 1}`,
      valueGetter: (p: ValueGetterParams<Row>) => {
        const v = p.data?.valores[i];
        if (v === undefined) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      },
      valueSetter: (p: ValueSetterParams<Row>) => {
        if (!p.data || p.data.natureza !== "analitica") return false;
        const novo = parseNumber(p.newValue);
        if (!Number.isFinite(novo)) return false;
        editCell(p.data.id, i + 1, novo);
        return true;
      },
      valueFormatter: (p: ValueFormatterParams<Row>) => formatCell(p.value),
      tooltipValueGetter: (p) => formatBRL(p.value),
      type: "rightAligned",
      width: 130,
      editable: (p) => !readonly && p.data?.natureza === "analitica",
      cellStyle: (p): CellStyle | undefined => {
        if (p.data?.natureza === "sintetica") {
          return { fontWeight: 600, background: "#f3f4f6" };
        }
        return undefined;
      },
    }));

    return [
      {
        headerName: "Código",
        field: "codigo",
        pinned: "left",
        width: 110,
        editable: false,
        cellStyle: (p): CellStyle | undefined =>
          p.data?.natureza === "sintetica" ? { fontWeight: 600 } : undefined,
      },
      {
        headerName: "Conta",
        field: "nome",
        pinned: "left",
        width: 380,
        editable: false,
        cellRenderer: (p: ICellRendererParams<Row>) => {
          const row = p.data;
          if (!row) return null;
          const isPinned = !!p.node.rowPinned;
          const isOpen = expanded.has(row.id);
          const padding = row.depth * 18;
          // Sintética + nivel<5 → pode ter filha
          const podeAdicionarFilha =
            row.natureza === "sintetica" && row.nivel < NIVEL_MAX;
          return (
            <span
              className="row-conta-cell"
              style={{
                paddingLeft: padding,
                display: "flex",
                alignItems: "center",
                gap: 4,
                width: "100%",
              }}
            >
              {row.hasChildren ? (
                <button
                  type="button"
                  onClick={() => toggle(row.id)}
                  style={{
                    width: 18,
                    height: 18,
                    border: 0,
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: 10,
                    color: "#6b7280",
                  }}
                  aria-label={isOpen ? "Recolher" : "Expandir"}
                >
                  {isOpen ? "▼" : "▶"}
                </button>
              ) : (
                <span style={{ width: 18, display: "inline-block" }} />
              )}
              <span
                style={{
                  fontWeight: row.natureza === "sintetica" ? 600 : 400,
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={row.nome}
              >
                {row.nome}
                {row.parent_id === null && row.id !== -1 && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 10,
                      fontWeight: 600,
                      color:
                        row.tipo_orcamentario === "entrada"
                          ? "#15803d"
                          : "#b91c1c",
                    }}
                  >
                    {row.tipo_orcamentario === "entrada" ? "⬆ entrada" : "⬇ saída"}
                  </span>
                )}
                {!row.ativo && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 10,
                      color: "#9ca3af",
                      fontWeight: 400,
                    }}
                  >
                    (inativa)
                  </span>
                )}
              </span>
              {notasOrcamentoId !== undefined && !isPinned && (
                <button
                  type="button"
                  title={notas[row.id] ? notas[row.id] : "Adicionar nota"}
                  onClick={() => {
                    setNotaText(notas[row.id] ?? "");
                    setNotaModal({ contaId: row.id, codigo: row.codigo, nome: row.nome });
                  }}
                  className="action-btn"
                  style={{ opacity: notas[row.id] ? 1 : 0.3 }}
                >
                  📝
                </button>
              )}
              {!isPinned && !readonly && (
                <span className="row-actions" style={{ display: "inline-flex", gap: 2 }}>
                  {podeAdicionarFilha && (
                    <button
                      type="button"
                      title="Adicionar conta filha"
                      onClick={() =>
                        setModal({
                          mode: "create",
                          parent: {
                            id: row.id,
                            codigo: row.codigo,
                            nome: row.nome,
                            nivel: row.nivel,
                          },
                        })
                      }
                      className="action-btn"
                    >
                      +
                    </button>
                  )}
                  <button
                    type="button"
                    title="Editar conta"
                    onClick={() => setModal({ mode: "edit", conta: row })}
                    className="action-btn"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    title="Excluir conta"
                    onClick={() => handleExcluir(row)}
                    className="action-btn action-btn-danger"
                  >
                    ×
                  </button>
                </span>
              )}
            </span>
          );
        },
      },
      ...mesCols,
      {
        headerName: "Total",
        colId: "total",
        valueGetter: (p) => p.data?.total ?? "",
        valueFormatter: (p) => formatBRL(p.value),
        type: "rightAligned",
        pinned: "right",
        width: 170,
        editable: false,
        cellStyle: (p): CellStyle =>
          p.data?.natureza === "sintetica"
            ? { fontWeight: 700, background: "#e5e7eb" }
            : { fontWeight: 600 },
      },
    ];
  }, [expanded, editCell, notas, notasOrcamentoId, colunas]);

  const totaisMesRow: Row = useMemo(
    () => ({
      id: -1,
      codigo: "",
      nome: "Total geral",
      natureza: "sintetica",
      tipo: "receita",
      ativo: true,
      nivel: 0,
      parent_id: null,
      tipo_orcamentario: "entrada",
      depth: 0,
      hasChildren: false,
      total: total_geral,
      valores: totais_mes,
    }),
    [total_geral, totais_mes],
  );

  /**
   * Paste do Excel sem prompt de permissão.
   *
   * Em vez de chamar `navigator.clipboard.readText()` (que requer permissão e
   * abre o pop-up "Permitir colar?"), escutamos o evento `paste` nativo. O
   * browser fornece `event.clipboardData` direto porque o gesto Cmd/Ctrl+V já
   * é uma autorização implícita — sem prompt.
   *
   * AG Grid v32+ tirou Range Selection / Clipboard pra Enterprise, então essa
   * camada manual é necessária. Quando a célula focada é de mês e a grade não
   * está em modo de edição, parseamos a matriz tab-separada e aplicamos
   * via `editCells` (passa pelo mesmo path otimista do single-edit).
   */
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      // Ignora paste dentro de input/textarea (modo de edição da célula
      // ou outros inputs como modais)
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;

      const focused = document.querySelector(".ag-cell-focus");
      if (!focused) return;
      const colId = focused.getAttribute("col-id") ?? "";
      const m = colId.match(/^mes_(\d+)$/);
      if (!m) return;

      const text = e.clipboardData?.getData("text/plain");
      if (!text) return;

      e.preventDefault();

      const startMes = Number(m[1]);
      const rowEl = focused.closest("[row-index]");
      const startRowIdx = rowEl
        ? Number(rowEl.getAttribute("row-index"))
        : 0;

      const matrix = text
        .replace(/\r/g, "")
        .split("\n")
        .filter((l) => l.length > 0)
        .map((l) => (l.includes("\t") ? l.split("\t") : l.split(/\s+/)));

      const edits: Array<{ conta_id: number; mes: number; valor: number }> = [];
      for (let r = 0; r < matrix.length; r++) {
        const row = rows[startRowIdx + r];
        if (!row || row.natureza !== "analitica") continue;
        for (let c = 0; c < matrix[r].length; c++) {
          const mes = startMes + c;
          if (mes < 1 || mes > 12) continue;
          const valor = parseNumber(matrix[r][c]);
          if (!Number.isFinite(valor)) continue;
          edits.push({ conta_id: row.id, mes, valor });
        }
      }
      if (edits.length > 0) editCells(edits);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [rows, editCells]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-white">
        <button
          onClick={expandAll}
          className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
        >
          Expandir tudo
        </button>
        <button
          onClick={collapseAll}
          className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
        >
          Recolher tudo
        </button>
        {!readonly && (
          <button
            onClick={() => setModal({ mode: "create", parent: null })}
            className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
            title="Adicionar conta de nível 1"
          >
            + Conta raiz
          </button>
        )}
        <button
          onClick={baixarXlsx}
          className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
          title="Baixar XLSX"
        >
          ⬇ XLSX
        </button>
        <button
          onClick={baixarMd}
          className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
          title="Baixar Markdown (importável no XMind)"
        >
          📝 MD
        </button>
        {!readonly && <StatusBadge status={status} />}
        {!readonly && erroMsg && (
          <span className="text-xs text-red-600 truncate max-w-md" title={erroMsg}>
            {erroMsg}
          </span>
        )}
        {!readonly && erroCrud && (
          <span
            className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1"
            title={erroCrud}
          >
            {erroCrud}
            <button
              type="button"
              className="ml-2 text-red-600 hover:text-red-800"
              onClick={() => setErroCrud(null)}
              aria-label="Fechar"
            >
              ×
            </button>
          </span>
        )}
        <span className="ml-auto text-sm text-gray-500">
          {rows.length} linhas visíveis · {infoText}
        </span>
      </div>
      <div className="flex-1 min-h-0">
        <AgGridReact<Row>
          theme={themeQuartz}
          rowData={rows}
          columnDefs={columnDefs}
          getRowId={(p) => String(p.data.id)}
          headerHeight={36}
          rowHeight={32}
          suppressMovableColumns
          stopEditingWhenCellsLoseFocus
          singleClickEdit={false}
          pinnedBottomRowData={[totaisMesRow]}
          getRowStyle={(p) =>
            p.node.rowPinned === "bottom"
              ? { fontWeight: 700, background: "#1f2937", color: "#fff" }
              : undefined
          }
        />
      </div>
      {modal && modal.mode === "create" && (
        <ContaModal
          mode="create"
          parent={modal.parent}
          onClose={() => setModal(null)}
        />
      )}
      {modal && modal.mode === "edit" && (
        <ContaModal
          mode="edit"
          conta={{
            id: modal.conta.id,
            codigo: modal.conta.codigo,
            nome: modal.conta.nome,
            tipo: modal.conta.tipo,
            natureza: modal.conta.natureza,
            ativo: modal.conta.ativo,
            nivel: modal.conta.nivel,
            parent_id: modal.conta.parent_id,
            tipo_orcamentario: modal.conta.tipo_orcamentario,
          }}
          onClose={() => setModal(null)}
        />
      )}
      {notaModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500 }}
          onClick={() => setNotaModal(null)}
        >
          <div
            style={{ background: "#fff", borderRadius: 12, padding: 24, width: 460, maxWidth: "95vw", boxShadow: "0 8px 32px rgba(0,0,0,.2)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>
              Nota — {notaModal.codigo} {notaModal.nome}
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
              {readonly
                ? "Somente leitura (orçamento não está em rascunho)."
                : "Anotação visível para a equipe neste orçamento."}
            </div>
            <textarea
              value={notaText}
              onChange={(e) => setNotaText(e.target.value)}
              readOnly={readonly}
              rows={5}
              placeholder="Ex: premissa usada, fonte do número, pendência…"
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: 10, fontSize: 14, outline: "none", resize: "vertical", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button
                type="button"
                onClick={() => setNotaModal(null)}
                style={{ padding: "8px 14px", fontSize: 14, border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", cursor: "pointer" }}
              >
                Fechar
              </button>
              {!readonly && (
                <button
                  type="button"
                  disabled={notaSaving}
                  onClick={salvarNota}
                  style={{ padding: "8px 16px", fontSize: 14, border: 0, borderRadius: 8, background: "#2563eb", color: "#fff", fontWeight: 600, cursor: "pointer", opacity: notaSaving ? 0.6 : 1 }}
                >
                  {notaSaving ? "Salvando…" : "Salvar nota"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

