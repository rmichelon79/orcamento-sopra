import type {
  Conta,
  Empreendimento,
  GradeConsolidadaResponse,
  GradeResponse,
  LancamentoBulkRequest,
  LancamentoBulkResponse,
  NaturezaConta,
  Orcamento,
  TipoConta,
  VersaoOrcamento,
} from "../types/api";

export interface ContaCreatePayload {
  nome: string;
  tipo: TipoConta;
  natureza: NaturezaConta;
  parent_id?: number | null;
  ordem?: number;
}

export interface ContaUpdatePayload {
  nome?: string;
  tipo?: TipoConta;
  natureza?: NaturezaConta;
  ordem?: number;
  ativo?: boolean;
}

export interface EmpreendimentoCreatePayload {
  codigo: string;
  nome: string;
}

export interface EmpreendimentoUpdatePayload {
  codigo?: string;
  nome?: string;
  ativo?: boolean;
}

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const j = JSON.parse(text);
      if (j?.detail) detail = j.detail;
    } catch {
      /* texto puro */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  listarEmpreendimentos: () => request<Empreendimento[]>("/empreendimento"),

  buscarOrcamento: (empreendimento_id: number, ano: number, versao?: number) => {
    const v = versao !== undefined ? `&versao=${versao}` : "";
    return request<Orcamento>(
      `/orcamento?empreendimento_id=${empreendimento_id}&ano=${ano}${v}`,
    );
  },

  carregarGrade: (orcamento_id: number) =>
    request<GradeResponse>(`/orcamento/${orcamento_id}/grade`),

  bulkLancamentos: (req: LancamentoBulkRequest) =>
    request<LancamentoBulkResponse>(`/lancamentos/bulk`, {
      method: "PUT",
      body: JSON.stringify(req),
    }),

  criarConta: (data: ContaCreatePayload) =>
    request<Conta>(`/contas`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  atualizarConta: (id: number, data: ContaUpdatePayload) =>
    request<Conta>(`/contas/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  excluirConta: (id: number) =>
    request<void>(`/contas/${id}`, { method: "DELETE" }),

  criarEmpreendimento: (data: EmpreendimentoCreatePayload) =>
    request<Empreendimento>(`/empreendimento`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  atualizarEmpreendimento: (id: number, data: EmpreendimentoUpdatePayload) =>
    request<Empreendimento>(`/empreendimento/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  excluirEmpreendimento: (id: number) =>
    request<void>(`/empreendimento/${id}`, { method: "DELETE" }),

  consolidado: (ano: number, empreendimento_ids?: number[]) => {
    const params = new URLSearchParams({ ano: String(ano) });
    if (empreendimento_ids && empreendimento_ids.length > 0) {
      for (const id of empreendimento_ids) {
        params.append("empreendimento_ids", String(id));
      }
    }
    return request<GradeConsolidadaResponse>(
      `/orcamento/consolidado?${params.toString()}`,
    );
  },

  versoes: (empreendimento_id: number, ano: number) =>
    request<VersaoOrcamento[]>(
      `/orcamento/versoes?empreendimento_id=${empreendimento_id}&ano=${ano}`,
    ),

  clonarOrcamento: (orcamento_id: number) =>
    request<Orcamento>(`/orcamento/${orcamento_id}/clonar`, { method: "POST" }),

  atualizarStatusOrcamento: (
    orcamento_id: number,
    status: "rascunho" | "aprovado" | "arquivado",
  ) =>
    request<Orcamento>(`/orcamento/${orcamento_id}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),
};
