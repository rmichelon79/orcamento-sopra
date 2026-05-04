// Recálculo otimista da árvore de grade. Espelha o algoritmo do backend
// (services/grade.py): bottom-up, sintética soma filhas, total = soma dos 12 meses.

import type { GradeNode, GradeResponse } from "../types/api";

const ZERO_STR = "0.00";
const fmt = (n: number) => n.toFixed(2);

function sumRow(values: string[]): number {
  let s = 0;
  for (const v of values) s += Number(v);
  return s;
}

function recalc(node: GradeNode): void {
  if (node.natureza === "analitica") {
    node.total = fmt(sumRow(node.valores));
    return;
  }
  const valores = new Array<number>(12).fill(0);
  for (const filha of node.filhas) {
    recalc(filha);
    for (let m = 0; m < 12; m++) valores[m] += Number(filha.valores[m]);
  }
  node.valores = valores.map(fmt);
  node.total = fmt(valores.reduce((a, b) => a + b, 0));
}

function recalcTotais(grade: GradeResponse): void {
  const totais = new Array<number>(12).fill(0);
  for (const raiz of grade.arvore) {
    for (let m = 0; m < 12; m++) totais[m] += Number(raiz.valores[m]);
  }
  grade.totais_mes = totais.map(fmt);
  grade.total_geral = fmt(totais.reduce((a, b) => a + b, 0));
}

function findAndSet(
  nodes: GradeNode[],
  conta_id: number,
  mes: number,
  valor: number,
): boolean {
  for (const n of nodes) {
    if (n.id === conta_id) {
      if (n.natureza !== "analitica") return false;
      n.valores[mes - 1] = fmt(valor);
      return true;
    }
    if (findAndSet(n.filhas, conta_id, mes, valor)) return true;
  }
  return false;
}

/** Aplica uma única edição (conta, mes, valor) e retorna nova grade com tudo recalculado. */
export function applyEdit(
  grade: GradeResponse,
  conta_id: number,
  mes: number,
  valor: number,
): GradeResponse {
  const next = structuredClone(grade);
  if (!findAndSet(next.arvore, conta_id, mes, valor)) return grade;
  for (const raiz of next.arvore) recalc(raiz);
  recalcTotais(next);
  return next;
}

/** Aplica várias edições de uma vez (mais eficiente que aplicar uma a uma). */
export function applyEdits(
  grade: GradeResponse,
  edits: Array<{ conta_id: number; mes: number; valor: number }>,
): GradeResponse {
  if (edits.length === 0) return grade;
  const next = structuredClone(grade);
  for (const e of edits) findAndSet(next.arvore, e.conta_id, e.mes, e.valor);
  for (const raiz of next.arvore) recalc(raiz);
  recalcTotais(next);
  return next;
}

export { ZERO_STR };
