import type { StatusOrcamento, VersaoOrcamento } from "../types/api";
import {
  useAtualizarStatusOrcamento,
  useClonarOrcamento,
} from "../hooks/useOrcamentoMutations";

interface Props {
  versoes: VersaoOrcamento[];
  selectedId: number | null;
  onChangeVersao: (versaoNumero: number) => void;
  onClonado: (novaVersaoNumero: number) => void;
}

const STATUS_BADGE: Record<StatusOrcamento, { label: string; cls: string }> = {
  rascunho: { label: "rascunho", cls: "bg-gray-100 text-gray-700" },
  aprovado: { label: "aprovado", cls: "bg-green-100 text-green-700" },
  arquivado: { label: "arquivado", cls: "bg-yellow-100 text-yellow-700" },
};

export function VersaoSelector({
  versoes,
  selectedId,
  onChangeVersao,
  onClonado,
}: Props) {
  const clonar = useClonarOrcamento();
  const atualizarStatus = useAtualizarStatusOrcamento();
  const selecionada = versoes.find((v) => v.id === selectedId) ?? null;

  if (versoes.length === 0) return null;

  const handleClonar = async () => {
    if (!selecionada) return;
    try {
      const nova = await clonar.mutateAsync(selecionada.id);
      onClonado(nova.versao);
    } catch (err) {
      window.alert(`Erro ao clonar: ${String(err).replace(/^Error: /, "")}`);
    }
  };

  const handleStatus = async (status: StatusOrcamento) => {
    if (!selecionada) return;
    if (status === selecionada.status) return;
    try {
      await atualizarStatus.mutateAsync({ id: selecionada.id, status });
    } catch (err) {
      window.alert(
        `Erro ao mudar status: ${String(err).replace(/^Error: /, "")}`,
      );
    }
  };

  const status = selecionada?.status ?? "rascunho";
  const badge = STATUS_BADGE[status];
  const editavel = status === "rascunho";

  return (
    <div className="flex items-center gap-2">
      <select
        value={selectedId ?? ""}
        onChange={(e) => {
          const id = Number(e.target.value);
          const v = versoes.find((x) => x.id === id);
          if (v) onChangeVersao(v.versao);
        }}
        className="px-2 py-1 text-sm border rounded bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="Versão"
      >
        {versoes.map((v) => (
          <option key={v.id} value={v.id}>
            v{v.versao}
          </option>
        ))}
      </select>

      <span className={`text-xs px-2 py-0.5 rounded ${badge.cls}`}>
        {badge.label}
      </span>

      <button
        type="button"
        onClick={handleClonar}
        disabled={clonar.isPending}
        className="text-sm text-blue-600 hover:underline disabled:opacity-50"
        title="Cria uma nova versão clonando esta"
      >
        + Nova versão
      </button>

      {editavel ? (
        <button
          type="button"
          onClick={() => handleStatus("aprovado")}
          disabled={atualizarStatus.isPending}
          className="text-sm text-green-700 hover:underline disabled:opacity-50"
          title="Marca como aprovado (vira read-only)"
        >
          Aprovar
        </button>
      ) : (
        <button
          type="button"
          onClick={() => handleStatus("rascunho")}
          disabled={atualizarStatus.isPending}
          className="text-sm text-gray-700 hover:underline disabled:opacity-50"
          title="Volta para rascunho (libera edição)"
        >
          Reabrir
        </button>
      )}

      {status !== "arquivado" && (
        <button
          type="button"
          onClick={() => handleStatus("arquivado")}
          disabled={atualizarStatus.isPending}
          className="text-sm text-yellow-700 hover:underline disabled:opacity-50"
          title="Arquiva esta versão"
        >
          Arquivar
        </button>
      )}
    </div>
  );
}
