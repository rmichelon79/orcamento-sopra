import { useEffect, useState } from "react";
import type { Empreendimento } from "../types/api";
import { useExcluirEmpreendimento } from "../hooks/useEmpreendimentos";
import { EmpreendimentoFormModal } from "./EmpreendimentoFormModal";

interface Props {
  empreendimentos: Empreendimento[];
  onClose: () => void;
}

type FormState =
  | { mode: "create" }
  | { mode: "edit"; empreendimento: Empreendimento }
  | null;

export function GerenciarEmpreendimentosModal({
  empreendimentos,
  onClose,
}: Props) {
  const [form, setForm] = useState<FormState>(null);
  const [erro, setErro] = useState<string | null>(null);
  const excluir = useExcluirEmpreendimento();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Só fecha se o form interno não estiver aberto (ele tem seu próprio handler)
      if (e.key === "Escape" && form === null) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, form]);

  const handleExcluir = async (e: Empreendimento) => {
    const ok = window.confirm(
      `Excluir empreendimento ${e.codigo} — ${e.nome}?\n\n` +
        "Não é possível desfazer. Backend bloqueia se houver orçamentos vinculados.",
    );
    if (!ok) return;
    setErro(null);
    try {
      await excluir.mutateAsync(e.id);
    } catch (err) {
      setErro(String(err).replace(/^Error: /, ""));
    }
  };

  const ordenados = [...empreendimentos].sort((a, b) =>
    a.codigo.localeCompare(b.codigo),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Empreendimentos
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {empreendimentos.length}{" "}
              {empreendimentos.length === 1 ? "cadastrado" : "cadastrados"}
              {" · "}
              {empreendimentos.filter((e) => e.ativo).length} ativos
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

        {erro && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">
            {erro}
            <button
              type="button"
              className="ml-2 text-red-600 hover:text-red-800"
              onClick={() => setErro(null)}
              aria-label="Fechar"
            >
              ×
            </button>
          </div>
        )}

        <div className="border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Código</th>
                <th className="text-left px-3 py-2 font-medium">Nome</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {ordenados.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-6 text-gray-500">
                    Nenhum empreendimento cadastrado.
                  </td>
                </tr>
              )}
              {ordenados.map((e) => (
                <tr key={e.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs">{e.codigo}</td>
                  <td className="px-3 py-2">{e.nome}</td>
                  <td className="px-3 py-2">
                    {e.ativo ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">
                        ativo
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                        inativo
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      title="Editar"
                      onClick={() => setForm({ mode: "edit", empreendimento: e })}
                      className="action-btn"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      title="Excluir"
                      onClick={() => handleExcluir(e)}
                      className="action-btn action-btn-danger"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center pt-4">
          <button
            type="button"
            onClick={() => setForm({ mode: "create" })}
            className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50"
          >
            + Novo empreendimento
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Concluir
          </button>
        </div>
      </div>

      {form?.mode === "create" && (
        <EmpreendimentoFormModal mode="create" onClose={() => setForm(null)} />
      )}
      {form?.mode === "edit" && (
        <EmpreendimentoFormModal
          mode="edit"
          empreendimento={form.empreendimento}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}
