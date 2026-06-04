import { useEffect, useRef, useState } from "react";
import type { Empreendimento } from "../types/api";
import {
  useAtualizarEmpreendimento,
  useCriarEmpreendimento,
} from "../hooks/useEmpreendimentos";

type Mode =
  | { mode: "create" }
  | { mode: "edit"; empreendimento: Empreendimento };

type Props = Mode & {
  onClose: () => void;
};

export function EmpreendimentoFormModal(props: Props) {
  const { onClose } = props;
  const isEdit = props.mode === "edit";

  const [codigo, setCodigo] = useState(isEdit ? props.empreendimento.codigo : "");
  const [nome, setNome] = useState(isEdit ? props.empreendimento.nome : "");
  const [ativo, setAtivo] = useState(
    isEdit ? props.empreendimento.ativo : true,
  );
  const [anoBase, setAnoBase] = useState(
    isEdit ? (props.empreendimento.ano_base ?? 2026) : 2026,
  );
  const [erro, setErro] = useState<string | null>(null);
  const codigoRef = useRef<HTMLInputElement>(null);

  const criar = useCriarEmpreendimento();
  const atualizar = useAtualizarEmpreendimento();
  const submitting = criar.isPending || atualizar.isPending;

  useEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== codigoRef.current) {
      active.blur();
    }
    codigoRef.current?.focus();
    codigoRef.current?.select();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    const codigoTrim = codigo.trim().toUpperCase();
    const nomeTrim = nome.trim();
    if (!codigoTrim || !nomeTrim) {
      setErro("Código e nome são obrigatórios.");
      return;
    }
    try {
      if (isEdit) {
        await atualizar.mutateAsync({
          id: props.empreendimento.id,
          data: { codigo: codigoTrim, nome: nomeTrim, ativo, ano_base: anoBase },
        });
      } else {
        await criar.mutateAsync({ codigo: codigoTrim, nome: nomeTrim, ano_base: anoBase });
      }
      onClose();
    } catch (err) {
      setErro(String(err).replace(/^Error: /, ""));
    }
  };

  const titulo = isEdit ? "Editar empreendimento" : "Novo empreendimento";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-[1px]"
      onClick={onClose}
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{titulo}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Código
            </label>
            <input
              ref={codigoRef}
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              className="w-full px-3 py-2 border rounded text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={20}
              placeholder="Ex: SOPRA"
            />
            <p className="text-xs text-gray-500 mt-1">
              Identificador curto. Salvo em maiúsculas.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={200}
              placeholder="Nome completo do empreendimento"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ano-base do projeto
            </label>
            <input
              type="number"
              value={anoBase}
              onChange={(e) => setAnoBase(Number(e.target.value) || 2026)}
              className="w-32 px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              min={2000}
              max={2100}
            />
            <p className="text-xs text-gray-500 mt-1">
              Início do horizonte plurianual (5 anos: {anoBase}–{anoBase + 4}).
            </p>
          </div>

          {isEdit && (
            <div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={ativo}
                  onChange={(e) => setAtivo(e.target.checked)}
                />
                <span>Ativo</span>
                <span className="text-gray-500 text-xs">
                  (inativos não aparecem no dropdown nem entram na consolidação default)
                </span>
              </label>
            </div>
          )}

          {erro && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {erro}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Salvando…" : isEdit ? "Salvar" : "Criar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
