// Tipos espelham os schemas Pydantic do backend.
// Decimais vêm como string no JSON (Pydantic preserva precisão).

export type TipoConta =
  | "receita"
  | "custo"
  | "despesa"
  | "investimento"
  | "financeiro";
export type NaturezaConta = "sintetica" | "analitica";
export type TipoOrcamentario = "entrada" | "saida";
export type StatusOrcamento = "rascunho" | "aprovado" | "arquivado";

export interface Empreendimento {
  id: string; // uuid (tabela canônica compartilhada entre os apps)
  codigo: string;
  nome: string;
  ativo: boolean;
}

export interface Conta {
  id: number;
  codigo: string;
  nome: string;
  parent_id: number | null;
  nivel: number;
  tipo: TipoConta;
  natureza: NaturezaConta;
  tipo_orcamentario: TipoOrcamentario;
  ordem: number;
  ativo: boolean;
}

export interface ContaTreeNode extends Conta {
  filhas: ContaTreeNode[];
}

export interface Orcamento {
  id: number;
  empreendimento_id: string; // uuid
  ano: number;
  versao: number;
  status: StatusOrcamento;
  criado_em: string;
}

export interface GradeNode extends Conta {
  valores: string[];
  total: string;
  filhas: GradeNode[];
}

export interface GradeResponse {
  orcamento: Orcamento;
  arvore: GradeNode[];
  totais_mes: string[];
  total_geral: string;
}

export interface GradeConsolidadaResponse {
  ano: number;
  empreendimentos_incluidos: string[];
  versoes_usadas: Record<string, number>;
  arvore: GradeNode[];
  totais_mes: string[];
  total_geral: string;
}

export interface VersaoOrcamento {
  id: number;
  versao: number;
  status: StatusOrcamento;
  criado_em: string;
}

export interface LancamentoBulkItem {
  conta_id: number;
  mes: number;
  valor: string;
}

export interface LancamentoBulkRequest {
  orcamento_id: number;
  items: LancamentoBulkItem[];
}

export interface LancamentoBulkResponse {
  atualizados: number;
  criados: number;
  removidos: number;
}
