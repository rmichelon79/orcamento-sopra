import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export function useEmpreendimentos() {
  return useQuery({
    queryKey: ["empreendimentos"],
    queryFn: api.listarEmpreendimentos,
  });
}

export function useOrcamento(
  empreendimento_id: string | undefined,
  ano: number,
  versao?: number | null,
) {
  return useQuery({
    queryKey: ["orcamento", empreendimento_id, ano, versao ?? null],
    queryFn: () =>
      api.buscarOrcamento(empreendimento_id!, ano, versao ?? undefined),
    enabled: empreendimento_id !== undefined,
  });
}

export function useGrade(orcamento_id: number | undefined) {
  return useQuery({
    queryKey: ["grade", orcamento_id],
    queryFn: () => api.carregarGrade(orcamento_id!),
    enabled: orcamento_id !== undefined,
  });
}

export function useGradePlurianual(
  empreendimento_id: string | undefined,
  anoBase: number | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ["grade-plurianual", empreendimento_id, anoBase],
    queryFn: () => api.gradePlurianual(empreendimento_id!, anoBase!),
    enabled: enabled && empreendimento_id !== undefined && anoBase !== undefined && anoBase !== null,
  });
}

export function useGradeConsolidada(
  ano: number,
  empreendimento_ids: string[],
  enabled = true,
) {
  // chave estável independente da ordem dos ids
  const key = [...empreendimento_ids].sort().join(",");
  return useQuery({
    queryKey: ["grade-consolidada", ano, key],
    queryFn: () => api.consolidado(ano, empreendimento_ids),
    enabled: enabled && empreendimento_ids.length > 0,
  });
}
