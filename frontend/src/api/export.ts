// Geração de exports no cliente (substitui os endpoints /api/.../export.* do backend).
// Porta a estrutura de services/export.py (XLSX via SheetJS + Markdown nested).
import * as XLSX from "xlsx";
import type { GradeNode } from "../types/api";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const BRL = '_-"R$" * #,##0.00_-;[Red]-"R$" * #,##0.00_-;_-"R$" * "-"??_-;_-@_-';

function ordemNatural(c: string): number[] {
  return c.split(".").map((p) => parseInt(p, 10));
}
function cmpNatural(a: string, b: string): number {
  const pa = ordemNatural(a);
  const pb = ordemNatural(b);
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return pa.length - pb.length;
}

function* flatten(nodes: GradeNode[], depth = 0): Generator<{ depth: number; n: GradeNode }> {
  for (const n of [...nodes].sort((a, b) => a.ordem - b.ordem)) {
    yield { depth, n };
    yield* flatten(n.filhas, depth + 1);
  }
}

export function gerarXlsx(
  arvore: GradeNode[],
  totais_mes: string[],
  total_geral: string,
  titulo: string,
): Blob {
  const aoa: (string | number)[][] = [];
  aoa.push([titulo]);
  aoa.push([`Gerado em ${new Date().toLocaleString("pt-BR")}`]);
  aoa.push([]);
  aoa.push(["Código", "Conta", ...MESES, "Total"]);
  for (const { depth, n } of flatten(arvore)) {
    aoa.push([
      n.codigo,
      "   ".repeat(depth) + n.nome,
      ...n.valores.map((v) => Number(v)),
      Number(n.total),
    ]);
  }
  aoa.push(["", "Total geral", ...totais_mes.map((v) => Number(v)), Number(total_geral)]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const range = XLSX.utils.decode_range(ws["!ref"]!);
  for (let r = 4; r <= range.e.r; r++) {
    for (let c = 2; c <= 14; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === "number") cell.z = BRL;
    }
  }
  ws["!cols"] = [{ wch: 14 }, { wch: 45 }, ...Array(12).fill({ wch: 14 }), { wch: 16 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Orçamento");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function noMd(n: GradeNode, depth: number, lines: string[], raiz: boolean): void {
  const indent = "  ".repeat(depth);
  const badge = raiz ? (n.tipo_orcamentario === "entrada" ? " [entrada]" : " [saída]") : "";
  lines.push(`${indent}- ${n.codigo} ${n.nome}${badge}`);
  for (const f of [...n.filhas].sort((a, b) => cmpNatural(a.codigo, b.codigo))) {
    noMd(f, depth + 1, lines, false);
  }
}

export function gerarMd(arvore: GradeNode[], titulo: string): string {
  const lines = [`# ${titulo}`, ""];
  for (const r of [...arvore].sort((a, b) => cmpNatural(a.codigo, b.codigo))) {
    noMd(r, 0, lines, true);
  }
  return lines.join("\n") + "\n";
}

export function baixar(data: Blob | string, filename: string, mime = "text/plain"): void {
  const blob = typeof data === "string" ? new Blob([data], { type: mime }) : data;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
