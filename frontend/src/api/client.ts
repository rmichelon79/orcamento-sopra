// Camada de dados — agora client-direct no Supabase (substitui o backend FastAPI).
// Mantém a MESMA interface do objeto `api` para minimizar mudanças nos hooks/componentes.
import { supabase } from "./supabase";
import { montarGrade, montarGradeN, toCents, validarFormatoCodigo } from "./logic";
import type {
  Conta,
  Empreendimento,
  GradeConsolidadaResponse,
  GradeNode,
  GradeResponse,
  LancamentoBulkRequest,
  LancamentoBulkResponse,
  NaturezaConta,
  Orcamento,
  TipoConta,
  TipoOrcamentario,
  VersaoOrcamento,
} from "../types/api";

export interface ContaCreatePayload {
  nome: string;
  tipo: TipoConta;
  natureza: NaturezaConta;
  parent_id?: number | null;
  ordem?: number;
  codigo?: string;
  tipo_orcamentario?: TipoOrcamentario;
}

export interface ContaUpdatePayload {
  nome?: string;
  tipo?: TipoConta;
  natureza?: NaturezaConta;
  ordem?: number;
  ativo?: boolean;
  codigo?: string;
  tipo_orcamentario?: TipoOrcamentario;
}

export interface EmpreendimentoCreatePayload {
  codigo: string;
  nome: string;
  ano_base?: number | null;
}

export interface EmpreendimentoUpdatePayload {
  codigo?: string;
  nome?: string;
  ativo?: boolean;
  ano_base?: number | null;
}

const NIVEL_MAX = 5;

function fail(e: { message?: string } | null): never {
  throw new Error(e?.message ?? "Erro no Supabase.");
}

// ─── Empreendimentos (tabela canônica, compartilhada entre os apps) ──────────
interface EmpRow {
  id: string;
  codigo: string;
  nome: string;
  status: string;
  ano_base: number | null;
}
const EMP_COLS = "id,codigo,nome,status,ano_base";
const empToApi = (r: EmpRow): Empreendimento => ({
  id: r.id,
  codigo: r.codigo,
  nome: r.nome,
  ativo: r.status === "ativo",
  ano_base: r.ano_base ?? null,
});

// ─── Helpers de contas (porta de services/contas.py) ─────────────────────────
async function fetchContas(): Promise<Conta[]> {
  const { data, error } = await supabase.from("contas").select("*");
  if (error) fail(error);
  return (data ?? []) as Conta[];
}

async function getConta(id: number): Promise<Conta | null> {
  const { data } = await supabase.from("contas").select("*").eq("id", id).maybeSingle();
  return (data as Conta) ?? null;
}

async function contaByCodigo(codigo: string): Promise<Conta | null> {
  const { data } = await supabase.from("contas").select("*").eq("codigo", codigo).maybeSingle();
  return (data as Conta) ?? null;
}

async function proximaOrdem(parentId: number | null): Promise<number> {
  let q = supabase.from("contas").select("ordem").order("ordem", { ascending: false }).limit(1);
  q = parentId === null ? q.is("parent_id", null) : q.eq("parent_id", parentId);
  const { data } = await q;
  const max = (data?.[0] as { ordem: number } | undefined)?.ordem ?? 0;
  return max + 1;
}

async function contaTemLancamentos(contaId: number): Promise<boolean> {
  const { count } = await supabase
    .from("lancamentos")
    .select("id", { count: "exact", head: true })
    .eq("conta_id", contaId);
  return (count ?? 0) > 0;
}

async function temFilhas(contaId: number): Promise<boolean> {
  const { count } = await supabase
    .from("contas")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", contaId);
  return (count ?? 0) > 0;
}

async function resolverParentPeloCodigo(
  codigo: string,
  ignorarId?: number,
): Promise<{ parent: Conta | null; nivel: number }> {
  const partes = codigo.split(".");
  const nivel = partes.length;
  if (nivel > NIVEL_MAX)
    throw new Error(`Código '${codigo}' tem ${nivel} níveis; máximo permitido é ${NIVEL_MAX}.`);
  if (nivel === 1) return { parent: null, nivel: 1 };
  const parentCodigo = partes.slice(0, -1).join(".");
  const parent = await contaByCodigo(parentCodigo);
  if (!parent) throw new Error(`Conta pai '${parentCodigo}' não encontrada.`);
  if (parent.natureza === "analitica")
    throw new Error(`Conta pai '${parentCodigo}' é analítica e não aceita filhas.`);
  if (ignorarId != null && parent.id === ignorarId)
    throw new Error("Conta não pode ser pai dela mesma.");
  return { parent, nivel };
}

async function coletarDescendentes(rootId: number): Promise<Conta[]> {
  const result: Conta[] = [];
  let fila = [rootId];
  while (fila.length) {
    const { data: atuais } = await supabase.from("contas").select("*").in("id", fila);
    result.push(...((atuais ?? []) as Conta[]));
    const { data: prox } = await supabase.from("contas").select("id").in("parent_id", fila);
    fila = ((prox ?? []) as { id: number }[]).map((r) => r.id);
  }
  return result;
}

async function aplicarMudancaCodigo(conta: Conta, novoCodigo: string): Promise<void> {
  validarFormatoCodigo(novoCodigo);
  if (novoCodigo === conta.codigo) return;

  const { parent: novoParent } = await resolverParentPeloCodigo(novoCodigo, conta.id);

  // Detecção de ciclo: novo pai não pode ser descendente da conta.
  if (novoParent) {
    let anc: Conta | null = novoParent;
    while (anc) {
      if (anc.id === conta.id)
        throw new Error(`Ciclo: '${novoCodigo}' colocaria a conta como ancestral dela mesma.`);
      anc = anc.parent_id != null ? await getConta(anc.parent_id) : null;
    }
  }

  const antigo = conta.codigo;
  const descendentes = await coletarDescendentes(conta.id);
  const novos: Record<number, string> = {};
  for (const d of descendentes) {
    novos[d.id] = d.id === conta.id ? novoCodigo : novoCodigo + d.codigo.slice(antigo.length);
  }
  const idsSet = new Set(descendentes.map((d) => d.id));
  for (const nc of Object.values(novos)) {
    const ex = await contaByCodigo(nc);
    if (ex && !idsSet.has(ex.id))
      throw new Error(`Código '${nc}' já existe em outra conta (id=${ex.id}).`);
    if (nc.split(".").length > NIVEL_MAX)
      throw new Error(`Código '${nc}' excede o limite de ${NIVEL_MAX} níveis.`);
  }

  // Fase 1: prefixo temporário (evita colisão de UNIQUE entre as atualizações).
  const tmp = `__tmp_${Math.random().toString(16).slice(2, 10)}__`;
  for (const d of descendentes) {
    const { error } = await supabase.from("contas").update({ codigo: tmp + d.codigo }).eq("id", d.id);
    if (error) fail(error);
  }
  // Fase 2: código novo + nível (e parent da própria conta).
  for (const d of descendentes) {
    const nc = novos[d.id];
    const patch: Record<string, unknown> = { codigo: nc, nivel: nc.split(".").length };
    if (d.id === conta.id) patch.parent_id = novoParent ? novoParent.id : null;
    const { error } = await supabase.from("contas").update(patch).eq("id", d.id);
    if (error) fail(error);
  }
  // Fase 3: reparent das filhas pelo código.
  for (const d of descendentes) {
    if (d.id === conta.id) continue;
    const parentCodigo = novos[d.id].split(".").slice(0, -1).join(".");
    const parentObj = await contaByCodigo(parentCodigo);
    if (parentObj) {
      const { error } = await supabase.from("contas").update({ parent_id: parentObj.id }).eq("id", d.id);
      if (error) fail(error);
    }
  }
}

// ─── Orçamentos ──────────────────────────────────────────────────────────────
async function getOrcamento(id: number): Promise<Orcamento | null> {
  const { data } = await supabase.from("orcamentos").select("*").eq("id", id).maybeSingle();
  return (data as Orcamento) ?? null;
}

export const api = {
  listarEmpreendimentos: async (): Promise<Empreendimento[]> => {
    const { data, error } = await supabase
      .from("empreendimentos")
      .select(EMP_COLS)
      .order("codigo");
    if (error) fail(error);
    return ((data ?? []) as EmpRow[]).map(empToApi);
  },

  buscarOrcamento: async (
    empreendimento_id: string,
    ano: number,
    versao?: number,
  ): Promise<Orcamento> => {
    let q = supabase
      .from("orcamentos")
      .select("*")
      .eq("empreendimento_id", empreendimento_id)
      .eq("ano", ano);
    q = versao !== undefined ? q.eq("versao", versao) : q.order("versao", { ascending: false });
    const { data, error } = await q.limit(1);
    if (error) fail(error);
    let orc = (data?.[0] as Orcamento) ?? null;
    // Empreendimento novo (sem orçamento no ano): cria um rascunho v1 automaticamente.
    // Só quando não se pediu uma versão específica (abertura padrão do app).
    if (!orc && versao === undefined) {
      const { data: novo, error: e2 } = await supabase
        .from("orcamentos")
        .insert({ empreendimento_id, ano, versao: 1, status: "rascunho" })
        .select("*")
        .single();
      if (e2) fail(e2);
      orc = (novo as Orcamento) ?? null;
    }
    if (!orc) throw new Error("Orçamento não encontrado.");
    return orc;
  },

  carregarGrade: async (orcamento_id: number): Promise<GradeResponse> => {
    const orc = await getOrcamento(orcamento_id);
    if (!orc) throw new Error("Orçamento não encontrado.");
    const contas = await fetchContas();
    const { data: lancs, error } = await supabase
      .from("lancamentos")
      .select("conta_id,mes,valor")
      .eq("orcamento_id", orcamento_id);
    if (error) fail(error);
    const map = new Map<string, number>();
    for (const l of (lancs ?? []) as { conta_id: number; mes: number; valor: string }[]) {
      map.set(`${l.conta_id}:${l.mes}`, toCents(l.valor));
    }
    const grade = montarGrade(contas, map);
    return { orcamento: orc, ...grade };
  },

  // Grade plurianual: 5 colunas (uma por ano). Cria os orçamentos que faltarem.
  gradePlurianual: async (
    empreendimento_id: string,
    anoBase: number,
    nAnos = 7,
  ): Promise<{
    anos: number[];
    arvore: GradeNode[];
    totais_mes: string[];
    total_geral: string;
    orcamentoIds: number[];
  }> => {
    const anos = Array.from({ length: nAnos }, (_, i) => anoBase + i);
    const orcamentoIds: number[] = [];
    for (const ano of anos) {
      const { data } = await supabase
        .from("orcamentos")
        .select("id")
        .eq("empreendimento_id", empreendimento_id)
        .eq("ano", ano)
        .order("versao", { ascending: false })
        .limit(1);
      let id = (data?.[0] as { id: number } | undefined)?.id;
      if (!id) {
        const { data: novo, error } = await supabase
          .from("orcamentos")
          .insert({ empreendimento_id, ano, versao: 1, status: "rascunho" })
          .select("id")
          .single();
        if (error) fail(error);
        id = (novo as { id: number }).id;
      }
      orcamentoIds.push(id);
    }

    const contas = await fetchContas();
    const { data: lancs } = await supabase
      .from("lancamentos")
      .select("orcamento_id,conta_id,valor")
      .in("orcamento_id", orcamentoIds);
    const idxByOrc = new Map<number, number>();
    orcamentoIds.forEach((id, i) => idxByOrc.set(id, i));
    const centsByConta = new Map<number, number[]>();
    for (const l of (lancs ?? []) as { orcamento_id: number; conta_id: number; valor: string }[]) {
      const i = idxByOrc.get(l.orcamento_id);
      if (i === undefined) continue;
      let arr = centsByConta.get(l.conta_id);
      if (!arr) { arr = new Array(nAnos).fill(0); centsByConta.set(l.conta_id, arr); }
      arr[i] += toCents(l.valor);
    }
    const grade = montarGradeN(contas, centsByConta, nAnos);
    return { anos, ...grade, orcamentoIds };
  },

  // Consolidado plurianual: soma de vários empreendimentos × N anos (só leitura).
  gradeConsolidadaPlurianual: async (
    empreendimento_ids: string[],
    anoBase: number,
    nAnos = 7,
  ): Promise<{
    anos: number[];
    arvore: GradeNode[];
    totais_mes: string[];
    total_geral: string;
    empreendimentos_incluidos: string[];
  }> => {
    const anos = Array.from({ length: nAnos }, (_, i) => anoBase + i);
    const { data: orcs } = await supabase
      .from("orcamentos")
      .select("id,empreendimento_id,ano,versao")
      .in("empreendimento_id", empreendimento_ids)
      .in("ano", anos);
    // versão mais recente por (empreendimento, ano)
    const best = new Map<string, { id: number; versao: number }>();
    for (const o of (orcs ?? []) as { id: number; empreendimento_id: string; ano: number; versao: number }[]) {
      const k = `${o.empreendimento_id}|${o.ano}`;
      const cur = best.get(k);
      if (!cur || o.versao > cur.versao) best.set(k, { id: o.id, versao: o.versao });
    }
    const yearByOrc = new Map<number, number>();
    const incluidos = new Set<string>();
    for (const [k, v] of best) {
      const [emp, ano] = k.split("|");
      yearByOrc.set(v.id, anos.indexOf(Number(ano)));
      incluidos.add(emp);
    }

    const contas = await fetchContas();
    const centsByConta = new Map<number, number[]>();
    const orcIds = [...yearByOrc.keys()];
    if (orcIds.length) {
      const { data: lancs } = await supabase
        .from("lancamentos")
        .select("orcamento_id,conta_id,valor")
        .in("orcamento_id", orcIds);
      for (const l of (lancs ?? []) as { orcamento_id: number; conta_id: number; valor: string }[]) {
        const yi = yearByOrc.get(l.orcamento_id);
        if (yi === undefined || yi < 0) continue;
        let arr = centsByConta.get(l.conta_id);
        if (!arr) { arr = new Array(nAnos).fill(0); centsByConta.set(l.conta_id, arr); }
        arr[yi] += toCents(l.valor);
      }
    }
    const grade = montarGradeN(contas, centsByConta, nAnos);
    return { anos, ...grade, empreendimentos_incluidos: [...incluidos] };
  },

  bulkLancamentos: async (req: LancamentoBulkRequest): Promise<LancamentoBulkResponse> => {
    if (!req.items.length) return { atualizados: 0, criados: 0, removidos: 0 };
    const idx = new Map<string, number>(); // "conta:mes" -> centavos (último vence)
    for (const it of req.items) idx.set(`${it.conta_id}:${it.mes}`, toCents(it.valor));

    const contaIds = [...new Set([...idx.keys()].map((k) => Number(k.split(":")[0])))];
    const { data: contas, error: ce } = await supabase
      .from("contas")
      .select("id,natureza")
      .in("id", contaIds);
    if (ce) fail(ce);
    const natById = new Map(
      ((contas ?? []) as { id: number; natureza: NaturezaConta }[]).map((c) => [c.id, c.natureza]),
    );
    const faltando = contaIds.filter((id) => !natById.has(id));
    if (faltando.length) throw new Error(`Contas não encontradas: ${faltando.sort((a, b) => a - b)}`);
    const sinteticas = contaIds.filter((id) => natById.get(id) !== "analitica");
    if (sinteticas.length)
      throw new Error(`Contas sintéticas não aceitam lançamento: ids=${sinteticas.sort((a, b) => a - b)}`);

    const { data: existRows } = await supabase
      .from("lancamentos")
      .select("id,conta_id,mes,valor")
      .eq("orcamento_id", req.orcamento_id)
      .in("conta_id", contaIds);
    const existIdx = new Map<string, { id: number; valor: string }>();
    for (const l of (existRows ?? []) as { id: number; conta_id: number; mes: number; valor: string }[]) {
      existIdx.set(`${l.conta_id}:${l.mes}`, { id: l.id, valor: l.valor });
    }

    const toUpsert: { orcamento_id: number; conta_id: number; mes: number; valor: number }[] = [];
    const toDelete: number[] = [];
    let atualizados = 0;
    let criados = 0;
    let removidos = 0;

    for (const [key, cents] of idx) {
      const [conta_id, mes] = key.split(":").map(Number);
      const ex = existIdx.get(key);
      if (cents === 0) {
        if (ex) {
          toDelete.push(ex.id);
          removidos++;
        }
        continue;
      }
      if (!ex) {
        toUpsert.push({ orcamento_id: req.orcamento_id, conta_id, mes, valor: cents / 100 });
        criados++;
      } else if (toCents(ex.valor) !== cents) {
        toUpsert.push({ orcamento_id: req.orcamento_id, conta_id, mes, valor: cents / 100 });
        atualizados++;
      }
    }

    if (toUpsert.length) {
      const { error } = await supabase
        .from("lancamentos")
        .upsert(toUpsert, { onConflict: "orcamento_id,conta_id,mes" });
      if (error) fail(error);
    }
    if (toDelete.length) {
      const { error } = await supabase.from("lancamentos").delete().in("id", toDelete);
      if (error) fail(error);
    }
    return { atualizados, criados, removidos };
  },

  criarConta: async (data: ContaCreatePayload): Promise<Conta> => {
    let parent: Conta | null = null;
    let nivel = 1;
    let codigo: string;

    if (data.codigo) {
      validarFormatoCodigo(data.codigo);
      const r = await resolverParentPeloCodigo(data.codigo);
      parent = r.parent;
      nivel = r.nivel;
      if (data.parent_id != null && (parent?.id ?? null) !== data.parent_id)
        throw new Error("parent_id do payload não bate com o pai derivado do código.");
      codigo = data.codigo;
    } else {
      if (data.parent_id != null) {
        parent = await getConta(data.parent_id);
        if (!parent) throw new Error("Conta pai não encontrada.");
        if (parent.nivel >= NIVEL_MAX)
          throw new Error(`Conta pai já está no nível ${NIVEL_MAX}; não aceita filhas.`);
        if (parent.natureza === "analitica") throw new Error("Conta analítica não pode ter filhas.");
        nivel = parent.nivel + 1;
      }
      const ord = data.ordem ?? (await proximaOrdem(data.parent_id ?? null));
      codigo = parent ? `${parent.codigo}.${ord}` : String(ord);
    }

    if (await contaByCodigo(codigo)) throw new Error(`Já existe uma conta com o código ${codigo}.`);
    const ordem = data.ordem ?? (await proximaOrdem(parent ? parent.id : null));

    const { data: ins, error } = await supabase
      .from("contas")
      .insert({
        codigo,
        nome: data.nome,
        parent_id: parent ? parent.id : null,
        nivel,
        tipo: data.tipo,
        natureza: data.natureza,
        tipo_orcamentario: data.tipo_orcamentario ?? "saida",
        ordem,
        ativo: true,
      })
      .select()
      .single();
    if (error) fail(error);
    return ins as Conta;
  },

  atualizarConta: async (id: number, data: ContaUpdatePayload): Promise<Conta> => {
    const conta = await getConta(id);
    if (!conta) throw new Error("Conta não encontrada.");

    const patch: Record<string, unknown> = {};

    if (data.natureza != null && data.natureza !== conta.natureza) {
      if (data.natureza === "sintetica") {
        if (await contaTemLancamentos(id))
          throw new Error("Não é possível converter para sintética: a conta já possui lançamentos.");
      } else if (await temFilhas(id)) {
        throw new Error("Não é possível converter para analítica: a conta possui filhas.");
      }
      patch.natureza = data.natureza;
    }

    if (data.codigo != null) await aplicarMudancaCodigo(conta, data.codigo.trim());

    if (data.nome != null) patch.nome = data.nome;
    if (data.tipo != null) patch.tipo = data.tipo;
    if (data.ordem != null) patch.ordem = data.ordem;
    if (data.ativo != null) patch.ativo = data.ativo;
    if (data.tipo_orcamentario != null) patch.tipo_orcamentario = data.tipo_orcamentario;

    if (Object.keys(patch).length) {
      const { error } = await supabase.from("contas").update(patch).eq("id", id);
      if (error) fail(error);
    }
    return (await getConta(id)) as Conta;
  },

  excluirConta: async (id: number): Promise<void> => {
    const conta = await getConta(id);
    if (!conta) throw new Error("Conta não encontrada.");
    if (await temFilhas(id)) throw new Error("Não é possível excluir: a conta possui filhas.");
    if (await contaTemLancamentos(id))
      throw new Error("Não é possível excluir: a conta possui lançamentos.");
    const { error } = await supabase.from("contas").delete().eq("id", id);
    if (error) fail(error);
  },

  criarEmpreendimento: async (data: EmpreendimentoCreatePayload): Promise<Empreendimento> => {
    const { data: ins, error } = await supabase
      .from("empreendimentos")
      .insert({ codigo: data.codigo, nome: data.nome, ano_base: data.ano_base ?? 2026 })
      .select(EMP_COLS)
      .single();
    if (error) fail(error);
    return empToApi(ins as EmpRow);
  },

  atualizarEmpreendimento: async (
    id: string,
    data: EmpreendimentoUpdatePayload,
  ): Promise<Empreendimento> => {
    const patch: Record<string, unknown> = {};
    if (data.codigo != null) patch.codigo = data.codigo;
    if (data.nome != null) patch.nome = data.nome;
    if (data.ativo != null) patch.status = data.ativo ? "ativo" : "concluido";
    if (data.ano_base != null) patch.ano_base = data.ano_base;
    const { data: upd, error } = await supabase
      .from("empreendimentos")
      .update(patch)
      .eq("id", id)
      .select(EMP_COLS)
      .single();
    if (error) fail(error);
    return empToApi(upd as EmpRow);
  },

  excluirEmpreendimento: async (id: string): Promise<void> => {
    const { error } = await supabase.from("empreendimentos").delete().eq("id", id);
    if (error) fail(error);
  },

  consolidado: async (
    ano: number,
    empreendimento_ids?: string[],
  ): Promise<GradeConsolidadaResponse> => {
    let empIds = empreendimento_ids;
    if (!empIds || empIds.length === 0) {
      const { data } = await supabase.from("empreendimentos").select("id").eq("status", "ativo");
      empIds = ((data ?? []) as { id: string }[]).map((e) => e.id);
    }
    if (!empIds.length) throw new Error("Nenhum empreendimento ativo para consolidar.");

    const versoes_usadas: Record<string, number> = {};
    const orcamentoIds: number[] = [];
    const incluidos: string[] = [];
    for (const emp of empIds) {
      const { data } = await supabase
        .from("orcamentos")
        .select("*")
        .eq("empreendimento_id", emp)
        .eq("ano", ano)
        .order("versao", { ascending: false })
        .limit(1);
      const orc = data?.[0] as Orcamento | undefined;
      if (!orc) continue;
      versoes_usadas[emp] = orc.versao;
      orcamentoIds.push(orc.id);
      incluidos.push(emp);
    }
    if (!orcamentoIds.length)
      throw new Error(`Nenhum dos empreendimentos solicitados tem orçamento no ano ${ano}.`);

    const contas = await fetchContas();
    const { data: lancs } = await supabase
      .from("lancamentos")
      .select("conta_id,mes,valor")
      .in("orcamento_id", orcamentoIds);
    const map = new Map<string, number>();
    for (const l of (lancs ?? []) as { conta_id: number; mes: number; valor: string }[]) {
      const k = `${l.conta_id}:${l.mes}`;
      map.set(k, (map.get(k) ?? 0) + toCents(l.valor));
    }
    const grade = montarGrade(contas, map);
    return { ano, empreendimentos_incluidos: incluidos, versoes_usadas, ...grade };
  },

  versoes: async (empreendimento_id: string, ano: number): Promise<VersaoOrcamento[]> => {
    const { data, error } = await supabase
      .from("orcamentos")
      .select("id,versao,status,criado_em")
      .eq("empreendimento_id", empreendimento_id)
      .eq("ano", ano)
      .order("versao", { ascending: false });
    if (error) fail(error);
    return (data ?? []) as VersaoOrcamento[];
  },

  clonarOrcamento: async (orcamento_id: number): Promise<Orcamento> => {
    const fonte = await getOrcamento(orcamento_id);
    if (!fonte) throw new Error("Orçamento fonte não encontrado.");
    const { data: mx } = await supabase
      .from("orcamentos")
      .select("versao")
      .eq("empreendimento_id", fonte.empreendimento_id)
      .eq("ano", fonte.ano)
      .order("versao", { ascending: false })
      .limit(1);
    const prox = ((mx?.[0] as { versao: number } | undefined)?.versao ?? 0) + 1;
    const { data: novo, error } = await supabase
      .from("orcamentos")
      .insert({
        empreendimento_id: fonte.empreendimento_id,
        ano: fonte.ano,
        versao: prox,
        status: "rascunho",
      })
      .select()
      .single();
    if (error) fail(error);
    const novoOrc = novo as Orcamento;

    const { data: lancs } = await supabase
      .from("lancamentos")
      .select("conta_id,mes,valor")
      .eq("orcamento_id", fonte.id);
    const rows = ((lancs ?? []) as { conta_id: number; mes: number; valor: string }[]).map((l) => ({
      orcamento_id: novoOrc.id,
      conta_id: l.conta_id,
      mes: l.mes,
      valor: l.valor,
    }));
    if (rows.length) {
      const { error: e2 } = await supabase.from("lancamentos").insert(rows);
      if (e2) fail(e2);
    }
    return novoOrc;
  },

  atualizarStatusOrcamento: async (
    orcamento_id: number,
    status: "rascunho" | "aprovado" | "arquivado",
  ): Promise<Orcamento> => {
    const { data, error } = await supabase
      .from("orcamentos")
      .update({ status })
      .eq("id", orcamento_id)
      .select()
      .single();
    if (error) fail(error);
    return data as Orcamento;
  },

  // ── Anotações por linha (conta) de um orçamento ──────────────────────────
  getNotas: async (orcamento_id: number): Promise<Record<number, string>> => {
    const { data, error } = await supabase
      .from("orcamento_notas")
      .select("conta_id,texto")
      .eq("orcamento_id", orcamento_id);
    if (error) fail(error);
    const map: Record<number, string> = {};
    for (const r of (data ?? []) as { conta_id: number; texto: string }[]) {
      map[r.conta_id] = r.texto;
    }
    return map;
  },

  setNota: async (orcamento_id: number, conta_id: number, texto: string): Promise<void> => {
    const t = texto.trim();
    if (!t) {
      const { error } = await supabase
        .from("orcamento_notas")
        .delete()
        .eq("orcamento_id", orcamento_id)
        .eq("conta_id", conta_id);
      if (error) fail(error);
    } else {
      const { error } = await supabase
        .from("orcamento_notas")
        .upsert(
          { orcamento_id, conta_id, texto: t, updated_at: new Date().toISOString() },
          { onConflict: "orcamento_id,conta_id" },
        );
      if (error) fail(error);
    }
  },

  /** Fluxo de caixa: saldo inicial do banco (único por ano, empresa). */
  getSaldoInicial: async (ano: number): Promise<number> => {
    const { data, error } = await supabase
      .from("caixa_saldo_inicial")
      .select("valor_cents")
      .eq("ano", ano)
      .maybeSingle();
    // Tolerante: antes da migration (tabela inexistente) devolve 0 sem quebrar o app.
    if (error) return 0;
    return data ? Number((data as { valor_cents: number }).valor_cents) / 100 : 0;
  },

  setSaldoInicial: async (ano: number, valor: number): Promise<void> => {
    const { error } = await supabase
      .from("caixa_saldo_inicial")
      .upsert(
        { ano, valor_cents: toCents(valor), updated_at: new Date().toISOString() },
        { onConflict: "ano" },
      );
    if (error) fail(error);
  },
};
