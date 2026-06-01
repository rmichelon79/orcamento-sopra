import { useEffect, useState } from "react";
import type { Empreendimento } from "../types/api";

const STORAGE_KEY = "consolidado_empreendimento_ids";

function loadFromStorage(): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function saveToStorage(ids: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

/**
 * Hook que mantém a lista de empreendimentos a consolidar.
 * - Inicializa do localStorage; se não houver, usa todos ativos.
 * - Filtra automaticamente IDs que não existem mais ou ficaram inativos.
 */
export function useConsolidadoSelecionados(empreendimentos: Empreendimento[]) {
  const [ids, setIdsState] = useState<string[]>([]);

  useEffect(() => {
    const ativos = empreendimentos.filter((e) => e.ativo).map((e) => e.id);
    if (ativos.length === 0) {
      setIdsState([]);
      return;
    }
    const stored = loadFromStorage();
    const validos = stored
      ? stored.filter((id) => ativos.includes(id))
      : ativos;
    // Se nada do storage é válido, default = todos ativos
    setIdsState(validos.length > 0 ? validos : ativos);
  }, [empreendimentos]);

  const setIds = (next: string[]) => {
    setIdsState(next);
    saveToStorage(next);
  };

  return { ids, setIds };
}

interface Props {
  empreendimentos: Empreendimento[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
}

export function ConsolidadoSelectorModal({
  empreendimentos,
  selectedIds,
  onChange,
  onClose,
}: Props) {
  const ativos = empreendimentos.filter((e) => e.ativo);
  const [draft, setDraft] = useState<string[]>(selectedIds);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (id: string) => {
    setDraft((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const selectAll = () => setDraft(ativos.map((e) => e.id));
  const clear = () => setDraft([]);

  const handleApply = () => {
    onChange(draft);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Empreendimentos a consolidar
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Selecione quais somar no modo consolidado.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="flex gap-2 mb-3 text-xs">
          <button
            type="button"
            onClick={selectAll}
            className="text-blue-600 hover:underline"
          >
            Marcar todos
          </button>
          <span className="text-gray-300">·</span>
          <button
            type="button"
            onClick={clear}
            className="text-blue-600 hover:underline"
          >
            Limpar
          </button>
        </div>

        <div className="space-y-1 max-h-72 overflow-y-auto border rounded p-2">
          {ativos.length === 0 && (
            <p className="text-sm text-gray-500 px-2 py-1">
              Nenhum empreendimento ativo.
            </p>
          )}
          {ativos.map((e) => (
            <label
              key={e.id}
              className="flex items-center gap-2 text-sm cursor-pointer px-2 py-1 hover:bg-gray-50 rounded"
            >
              <input
                type="checkbox"
                checked={draft.includes(e.id)}
                onChange={() => toggle(e.id)}
              />
              <span className="font-mono text-xs text-gray-500 w-16 inline-block">
                {e.codigo}
              </span>
              <span>{e.nome}</span>
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={draft.length === 0}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Aplicar ({draft.length})
          </button>
        </div>
      </div>
    </div>
  );
}
