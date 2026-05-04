import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type ContaCreatePayload,
  type ContaUpdatePayload,
} from "../api/client";

/** Invalida queries afetadas por uma mudança no plano de contas. */
function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["grade"] });
  qc.invalidateQueries({ queryKey: ["contas"] });
}

export function useCriarConta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ContaCreatePayload) => api.criarConta(data),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useAtualizarConta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ContaUpdatePayload }) =>
      api.atualizarConta(id, data),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useExcluirConta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.excluirConta(id),
    onSuccess: () => invalidateAll(qc),
  });
}
