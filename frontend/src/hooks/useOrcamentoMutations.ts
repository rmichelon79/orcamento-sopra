import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { StatusOrcamento } from "../types/api";

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["orcamento"] });
  qc.invalidateQueries({ queryKey: ["versoes"] });
  qc.invalidateQueries({ queryKey: ["grade"] });
  qc.invalidateQueries({ queryKey: ["grade-consolidada"] });
}

export function useVersoes(
  empreendimento_id: number | undefined,
  ano: number,
) {
  return useQuery({
    queryKey: ["versoes", empreendimento_id, ano],
    queryFn: () => api.versoes(empreendimento_id!, ano),
    enabled: empreendimento_id !== undefined,
  });
}

export function useClonarOrcamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orcamento_id: number) => api.clonarOrcamento(orcamento_id),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useAtualizarStatusOrcamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: number;
      status: StatusOrcamento;
    }) => api.atualizarStatusOrcamento(id, status),
    onSuccess: () => invalidateAll(qc),
  });
}
