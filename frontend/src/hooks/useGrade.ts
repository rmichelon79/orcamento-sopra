import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export function useEmpreendimentos() {
  return useQuery({
    queryKey: ["empreendimentos"],
    queryFn: api.listarEmpreendimentos,
  });
}

export function useOrcamento(empreendimento_id: number | undefined, ano: number) {
  return useQuery({
    queryKey: ["orcamento", empreendimento_id, ano],
    queryFn: () => api.buscarOrcamento(empreendimento_id!, ano),
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
