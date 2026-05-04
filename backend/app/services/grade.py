from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Conta, Lancamento, Orcamento
from app.schemas.orcamento import GradeNode, GradeResponse, OrcamentoOut

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
        nodes.sort(key=lambda n: n.ordem)
        for n in nodes:
            _ordenar(n.filhas)

    _ordenar(raizes)
    return raizes


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

    totais_mes = _zeros()
    for raiz in raizes:
        for m in range(12):
            totais_mes[m] += raiz.valores[m]
    total_geral = sum(totais_mes, start=ZERO)

    return GradeResponse(
        orcamento=OrcamentoOut.model_validate(orc),
        arvore=raizes,
        totais_mes=totais_mes,
        total_geral=total_geral,
    )
