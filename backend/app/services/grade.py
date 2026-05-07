from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Conta, Empreendimento, Lancamento, Orcamento
from app.schemas.orcamento import (
    GradeConsolidadaResponse,
    GradeNode,
    GradeResponse,
    OrcamentoOut,
)

ZERO = Decimal("0.00")


class GradeError(Exception):
    """Erro ao montar a grade orçamentária."""


def _zeros() -> list[Decimal]:
    return [ZERO for _ in range(12)]


def _calcular_subtotais(no: GradeNode) -> None:
    """Recursão bottom-up: filhas são calculadas primeiro; sintética soma filhas."""
    if no.natureza == "analitica":
        no.total = sum(no.valores, start=ZERO)
        return

    valores = _zeros()
    for filha in no.filhas:
        _calcular_subtotais(filha)
        for m in range(12):
            valores[m] += filha.valores[m]
    no.valores = valores
    no.total = sum(valores, start=ZERO)


def _ordem_natural(codigo: str) -> tuple[int, ...]:
    return tuple(int(p) for p in codigo.split("."))


def _montar_arvore(
    contas: list[Conta], lancamentos_por_conta: dict[tuple[int, int], Decimal]
) -> list[GradeNode]:
    by_id: dict[int, GradeNode] = {}
    for c in contas:
        if c.natureza == "analitica":
            valores = [
                lancamentos_por_conta.get((c.id, m), ZERO) for m in range(1, 13)
            ]
        else:
            valores = _zeros()
        by_id[c.id] = GradeNode(
            id=c.id,
            codigo=c.codigo,
            nome=c.nome,
            parent_id=c.parent_id,
            nivel=c.nivel,
            tipo=c.tipo,
            natureza=c.natureza,
            tipo_orcamentario=c.tipo_orcamentario,
            ordem=c.ordem,
            ativo=c.ativo,
            valores=valores,
            total=ZERO,
            filhas=[],
        )

    raizes: list[GradeNode] = []
    for c in contas:
        node = by_id[c.id]
        if c.parent_id is None:
            raizes.append(node)
        else:
            by_id[c.parent_id].filhas.append(node)

    def _ordenar(nodes: list[GradeNode]) -> None:
        nodes.sort(key=lambda n: _ordem_natural(n.codigo))
        for n in nodes:
            _ordenar(n.filhas)

    _ordenar(raizes)
    return raizes


def _agregar_total_geral(
    raizes: list[GradeNode],
) -> tuple[list[Decimal], Decimal]:
    """Total geral = soma das raízes com sinal por `tipo_orcamentario`.

    entrada: +1, saida: -1. Subtotais individuais (em cada raiz) ficam positivos.
    """
    totais_mes = _zeros()
    for raiz in raizes:
        sinal = Decimal("1") if raiz.tipo_orcamentario == "entrada" else Decimal("-1")
        for m in range(12):
            totais_mes[m] += raiz.valores[m] * sinal
    total_geral = sum(totais_mes, start=ZERO)
    return totais_mes, total_geral


def calcular_grade(db: Session, orcamento_id: int) -> GradeResponse:
    orc = db.get(Orcamento, orcamento_id)
    if orc is None:
        raise GradeError("Orçamento não encontrado.")

    contas = list(db.execute(select(Conta).order_by(Conta.ordem)).scalars().all())
    lancs = db.execute(
        select(Lancamento).where(Lancamento.orcamento_id == orcamento_id)
    ).scalars().all()

    lancamentos_por_conta: dict[tuple[int, int], Decimal] = {
        (l.conta_id, l.mes): l.valor for l in lancs
    }

    raizes = _montar_arvore(contas, lancamentos_por_conta)
    for no in raizes:
        _calcular_subtotais(no)

    totais_mes, total_geral = _agregar_total_geral(raizes)

    return GradeResponse(
        orcamento=OrcamentoOut.model_validate(orc),
        arvore=raizes,
        totais_mes=totais_mes,
        total_geral=total_geral,
    )


def calcular_consolidado(
    db: Session, ano: int, empreendimento_ids: list[int] | None = None
) -> GradeConsolidadaResponse:
    """Soma a grade de vários empreendimentos.

    Para cada empreendimento, usa a versão de orçamento mais recente daquele ano.
    Se um empreendimento não tem orçamento no ano pedido, é silenciosamente ignorado.
    """
    if empreendimento_ids is None or len(empreendimento_ids) == 0:
        # default: todos os empreendimentos ativos
        empreendimento_ids = [
            e.id
            for e in db.execute(
                select(Empreendimento).where(Empreendimento.ativo.is_(True))
            ).scalars()
        ]

    if not empreendimento_ids:
        raise GradeError("Nenhum empreendimento ativo para consolidar.")

    # Para cada empreendimento, pega a versão mais recente do ano
    versoes_usadas: dict[int, int] = {}
    orcamento_ids: list[int] = []
    incluidos: list[int] = []

    for emp_id in empreendimento_ids:
        orc = db.execute(
            select(Orcamento)
            .where(
                Orcamento.empreendimento_id == emp_id,
                Orcamento.ano == ano,
            )
            .order_by(Orcamento.versao.desc())
        ).scalars().first()
        if orc is None:
            continue
        versoes_usadas[emp_id] = orc.versao
        orcamento_ids.append(orc.id)
        incluidos.append(emp_id)

    if not orcamento_ids:
        raise GradeError(
            f"Nenhum dos empreendimentos solicitados tem orçamento no ano {ano}."
        )

    contas = list(db.execute(select(Conta).order_by(Conta.ordem)).scalars().all())
    lancs = db.execute(
        select(Lancamento).where(Lancamento.orcamento_id.in_(orcamento_ids))
    ).scalars().all()

    # Soma por (conta_id, mes) através dos vários orçamentos
    lancamentos_por_conta: dict[tuple[int, int], Decimal] = {}
    for l in lancs:
        chave = (l.conta_id, l.mes)
        lancamentos_por_conta[chave] = lancamentos_por_conta.get(chave, ZERO) + l.valor

    raizes = _montar_arvore(contas, lancamentos_por_conta)
    for no in raizes:
        _calcular_subtotais(no)

    totais_mes, total_geral = _agregar_total_geral(raizes)

    return GradeConsolidadaResponse(
        ano=ano,
        empreendimentos_incluidos=incluidos,
        versoes_usadas=versoes_usadas,
        arvore=raizes,
        totais_mes=totais_mes,
        total_geral=total_geral,
    )
