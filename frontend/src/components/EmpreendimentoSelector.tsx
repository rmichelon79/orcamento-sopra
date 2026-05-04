import type { Empreendimento } from "../types/api";

interface Props {
  empreendimentos: Empreendimento[];
  selectedCodigo: string | null;
  /** Quando true, o item "Consolidado" aparece e está selecionado */
  consolidadoSelected?: boolean;
  /** Quando true, oculta a opção "Consolidado" (usar na Etapa 2.2 antes do view existir) */
  hideConsolidado?: boolean;
  onSelect: (
    selection: { codigo: string; modo: "individual" } | { modo: "consolidado" },
  ) => void;
}

export function EmpreendimentoSelector({
  empreendimentos,
  selectedCodigo,
  consolidadoSelected,
  hideConsolidado,
  onSelect,
}: Props) {
  const ativos = empreendimentos.filter((e) => e.ativo);
  const value = consolidadoSelected ? "__consolidado__" : (selectedCodigo ?? "");

  return (
    <select
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "__consolidado__") {
          onSelect({ modo: "consolidado" });
        } else {
          onSelect({ codigo: v, modo: "individual" });
        }
      }}
      className="px-3 py-1.5 text-sm border rounded bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
      aria-label="Empreendimento"
    >
      {ativos.map((e) => (
        <option key={e.id} value={e.codigo}>
          {e.codigo} — {e.nome}
        </option>
      ))}
      {!hideConsolidado && (
        <>
          <option disabled>──────────</option>
          <option value="__consolidado__">Consolidado (todos ativos)</option>
        </>
      )}
    </select>
  );
}
