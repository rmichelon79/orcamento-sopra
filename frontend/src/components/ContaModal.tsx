import { useEffect, useRef, useState } from "react";
import type { NaturezaConta, TipoConta } from "../types/api";
import { useAtualizarConta, useCriarConta } from "../hooks/useContas";

const TIPOS: { value: TipoConta; label: string }[] = [
  { value: "receita", label: "Receita" },
  { value: "custo", label: "Custo" },
  { value: "despesa", label: "Despesa" },
  { value: "investimento", label: "Investimento" },
  { value: "financeiro", label: "Financeiro" },
];

const NATUREZAS: { value: NaturezaConta; label: string; hint: string }[] = [
  {
    value: "sintetica",
    label: "Sintética",
    hint: "agrupa filhas, não aceita lançamento",
  },
  {
    value: "analitica",
    label: "Analítica",
    hint: "aceita lançamento, não pode ter filhas",
  },
];

interface BaseProps {
  onClose: () => void;
}

interface CreateProps extends BaseProps {
  mode: "create";
  parent?: { id: number; codigo: string; nome: string; nivel: number } | null;
}

interface EditProps extends BaseProps {
  mode: "edit";
  conta: {
    id: number;
    codigo: string;
    nome: string;
    tipo: TipoConta;
    natureza: NaturezaConta;
    ativo: boolean;
    nivel: number;
  };
}

type Props = CreateProps | EditProps;

export function ContaModal(props: Props) {
  const { onClose } = props;
  const isEdit = props.mode === "edit";
  const initialNome = isEdit ? props.conta.nome : "";
  const initialTipo: TipoConta = isEdit
    ? props.conta.tipo
    : props.mode === "create" && props.parent
      ? // herda tipo do pai por padrão? deixa o usuário escolher; default = receita
        "receita"
      : "receita";
  const initialNatureza: NaturezaConta = isEdit
    ? props.conta.natureza
    : "analitica";
  const initialAtivo = isEdit ? props.conta.ativo : true;

  const [nome, setNome] = useState(initialNome);
  const [tipo, setTipo] = useState<TipoConta>(initialTipo);
  const [natureza, setNatureza] = useState<NaturezaConta>(initialNatureza);
  const [ativo, setAtivo] = useState(initialAtivo);
  const [codigo, setCodigo] = useState(isEdit ? props.conta.codigo : "");
  const [erro, setErro] = useState<string | null>(null);
  const nomeRef = useRef<HTMLInputElement>(null);

  const CODIGO_RE = /^\d+(\.\d+)*$/;

  const criar = useCriarConta();
  const atualizar = useAtualizarConta();
  const submitting = criar.isPending || atualizar.isPending;

  // Foca o input após montar — explicitamente, depois de tirar foco da grade.
  useEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== nomeRef.current) {
      active.blur();
    }
    nomeRef.current?.focus();
    nomeRef.current?.select();
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
    const trimmed = nome.trim();
    if (!trimmed) {
      setErro("Nome é obrigatório.");
      return;
    }
    const codigoTrim = codigo.trim();
    if (codigoTrim && !CODIGO_RE.test(codigoTrim)) {
      setErro("Código inválido. Use só dígitos separados por pontos (ex: 2.30.01).");
      return;
    }
    try {
      if (isEdit) {
        const dataUpdate: {
          nome: string;
          tipo: TipoConta;
          natureza: NaturezaConta;
          ativo: boolean;
          codigo?: string;
        } = { nome: trimmed, tipo, natureza, ativo };
        // Só envia código se mudou (evita disparar cascade desnecessário)
        if (codigoTrim && codigoTrim !== props.conta.codigo) {
          dataUpdate.codigo = codigoTrim;
        }
        await atualizar.mutateAsync({ id: props.conta.id, data: dataUpdate });
      } else {
        await criar.mutateAsync({
          nome: trimmed,
          tipo,
          natureza,
          parent_id: props.parent?.id ?? null,
          ...(codigoTrim ? { codigo: codigoTrim } : {}),
        });
      }
      onClose();
    } catch (err) {
      setErro(String(err).replace(/^Error: /, ""));
    }
  };

  const titulo = isEdit
    ? `Editar conta ${props.conta.codigo}`
    : props.parent
      ? `Nova conta filha de ${props.parent.codigo} ${props.parent.nome}`
      : "Nova conta raiz";

  const nivelInfo = isEdit
    ? `nível ${props.conta.nivel}`
    : props.parent
      ? `nível ${props.parent.nivel + 1}`
      : "nível 1";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[1px]"
      onClick={onClose}
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{titulo}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{nivelInfo}</p>
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome
            </label>
            <input
              ref={nomeRef}
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={200}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Código
            </label>
            <input
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              className="w-full px-3 py-2 border rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={50}
              placeholder={isEdit ? "" : "deixe vazio para auto-gerar"}
            />
            <p className="text-xs text-gray-500 mt-1">
              {isEdit
                ? "Mudar o código move a conta no plano (e suas filhas re-prefixam automaticamente)."
                : "Opcional. Em branco gera próximo na sequência. Ex: 2.30.99 cria gap intencional."}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo
            </label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoConta)}
              className="w-full px-3 py-2 border rounded text-sm bg-white"
            >
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Natureza
            </label>
            <div className="space-y-1">
              {NATUREZAS.map((n) => (
                <label
                  key={n.value}
                  className="flex items-start gap-2 text-sm cursor-pointer"
                >
                  <input
                    type="radio"
                    name="natureza"
                    value={n.value}
                    checked={natureza === n.value}
                    onChange={() => setNatureza(n.value)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">{n.label}</span>
                    <span className="text-gray-500"> — {n.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {isEdit && (
            <div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={ativo}
                  onChange={(e) => setAtivo(e.target.checked)}
                />
                <span>Ativa</span>
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
