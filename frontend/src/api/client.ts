import type {
  Conta,
  Empreendimento,
  GradeResponse,
  LancamentoBulkRequest,
  LancamentoBulkResponse,
  NaturezaConta,
  Orcamento,
  TipoConta,
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

  buscarOrcamento: (empreendimento_id: number, ano: number) =>
    request<Orcamento>(
      `/orcamento?empreendimento_id=${empreendimento_id}&ano=${ano}`,
    ),

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
};
