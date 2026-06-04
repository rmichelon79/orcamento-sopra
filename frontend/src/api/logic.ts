// Porta a lógica de cálculo do backend (services/grade.py) para o cliente.
// Aritmética em centavos (inteiros) para evitar erros de ponto flutuante.
import type { Conta, GradeNode } from "../types/api";

export const toCents = (v: unknown): number => Math.round(Number(v ?? 0) * 100);
export const fromCents = (c: number): string => (c / 100).toFixed(2);

/** "2.30.09.04" → [2, 30, 9, 4] para ordenação natural. */
export function ordemNatural(codigo: string): number[] {
  return codigo.split(".").map((p) => parseInt(p, 10));
}

export function cmpNatural(a: string, b: string): number {
  const pa = ordemNatural(a);
  const pb = ordemNatural(b);
  const n = Math.min(pa.length, pb.length);
  for (let i = 0; i < n; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return pa.length - pb.length;
}

interface Node {
  conta: Conta;
  valores: number[]; // centavos, 12 meses
  total: number; // centavos
  filhas: Node[];
}

function montarNodes(
  contas: Conta[],
  lancByContaMes: Map<string, number>,
): Node[] {
  const byId = new Map<number, Node>();
  for (const c of contas) {
    const valores = new Array(12).fill(0);
    if (c.natureza === "analitica") {
      for (let m = 1; m <= 12; m++) {
        valores[m - 1] = lancByContaMes.get(`${c.id}:${m}`) ?? 0;
      }
    }
    byId.set(c.id, { conta: c, valores, total: 0, filhas: [] });
  }
  const raizes: Node[] = [];
  for (const c of contas) {
    const node = byId.get(c.id)!;
    if (c.parent_id == null) raizes.push(node);
    else byId.get(c.parent_id)?.filhas.push(node);
  }
  const ordenar = (nodes: Node[]) => {
    nodes.sort((a, b) => cmpNatural(a.conta.codigo, b.conta.codigo));
    nodes.forEach((n) => ordenar(n.filhas));
  };
  ordenar(raizes);
  return raizes;
}

function calcSubtotais(no: Node): void {
  if (no.conta.natureza === "analitica") {
    no.total = no.valores.reduce((a, b) => a + b, 0);
    return;
  }
  const valores = new Array(12).fill(0);
  for (const f of no.filhas) {
    calcSubtotais(f);
    for (let m = 0; m < 12; m++) valores[m] += f.valores[m];
  }
  no.valores = valores;
  no.total = valores.reduce((a, b) => a + b, 0);
}

function agregarTotalGeral(raizes: Node[]): {
  totaisMes: number[];
  total: number;
} {
  const totaisMes = new Array(12).fill(0);
  for (const r of raizes) {
    const sinal = r.conta.tipo_orcamentario === "entrada" ? 1 : -1;
    for (let m = 0; m < 12; m++) totaisMes[m] += r.valores[m] * sinal;
  }
  return { totaisMes, total: totaisMes.reduce((a, b) => a + b, 0) };
}

function toGradeNode(n: Node): GradeNode {
  return {
    ...n.conta,
    valores: n.valores.map(fromCents),
    total: fromCents(n.total),
    filhas: n.filhas.map(toGradeNode),
  };
}

/** Monta a grade (árvore + totais) a partir das contas e um mapa (conta:mes)→centavos. */
export function montarGrade(
  contas: Conta[],
  lancByContaMes: Map<string, number>,
): { arvore: GradeNode[]; totais_mes: string[]; total_geral: string } {
  const raizes = montarNodes(contas, lancByContaMes);
  raizes.forEach(calcSubtotais);
  const { totaisMes, total } = agregarTotalGeral(raizes);
  return {
    arvore: raizes.map(toGradeNode),
    totais_mes: totaisMes.map(fromCents),
    total_geral: fromCents(total),
  };
}

/** Monta a grade com N colunas arbitrárias (ex: 5 anos). centsByConta: conta_id → centavos[ncols]. */
export function montarGradeN(
  contas: Conta[],
  centsByConta: Map<number, number[]>,
  ncols: number,
): { arvore: GradeNode[]; totais_mes: string[]; total_geral: string } {
  const byId = new Map<number, Node>();
  for (const c of contas) {
    const base = c.natureza === "analitica" ? centsByConta.get(c.id) : undefined;
    byId.set(c.id, { conta: c, valores: base ? base.slice() : new Array(ncols).fill(0), total: 0, filhas: [] });
  }
  const raizes: Node[] = [];
  for (const c of contas) {
    const node = byId.get(c.id)!;
    if (c.parent_id == null) raizes.push(node);
    else byId.get(c.parent_id)?.filhas.push(node);
  }
  const ordenar = (nodes: Node[]) => {
    nodes.sort((a, b) => cmpNatural(a.conta.codigo, b.conta.codigo));
    nodes.forEach((n) => ordenar(n.filhas));
  };
  ordenar(raizes);
  const calc = (no: Node): void => {
    if (no.conta.natureza === "analitica") {
      no.total = no.valores.reduce((a, b) => a + b, 0);
      return;
    }
    const valores = new Array(ncols).fill(0);
    for (const f of no.filhas) {
      calc(f);
      for (let i = 0; i < ncols; i++) valores[i] += f.valores[i];
    }
    no.valores = valores;
    no.total = valores.reduce((a, b) => a + b, 0);
  };
  raizes.forEach(calc);
  const totais = new Array(ncols).fill(0);
  for (const r of raizes) {
    const sinal = r.conta.tipo_orcamentario === "entrada" ? 1 : -1;
    for (let i = 0; i < ncols; i++) totais[i] += r.valores[i] * sinal;
  }
  return {
    arvore: raizes.map(toGradeNode),
    totais_mes: totais.map(fromCents),
    total_geral: fromCents(totais.reduce((a, b) => a + b, 0)),
  };
}

const CODIGO_RE = /^\d+(?:\.\d+)*$/;
export function validarFormatoCodigo(codigo: string): void {
  if (!CODIGO_RE.test(codigo)) {
    throw new Error(
      `Formato de código inválido: '${codigo}'. Use só dígitos separados por pontos (ex: 2.30.01).`,
    );
  }
}
