import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type EmpreendimentoCreatePayload,
  type EmpreendimentoUpdatePayload,
} from "../api/client";

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["empreendimentos"] });
  // Consolidados dependem da lista de empreendimentos ativos
  qc.invalidateQueries({ queryKey: ["grade-consolidada"] });
}

export function useCriarEmpreendimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: EmpreendimentoCreatePayload) =>
      api.criarEmpreendimento(data),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useAtualizarEmpreendimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: EmpreendimentoUpdatePayload;
    }) => api.atualizarEmpreendimento(id, data),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useExcluirEmpreendimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.excluirEmpreendimento(id),
    onSuccess: () => invalidateAll(qc),
  });
}
