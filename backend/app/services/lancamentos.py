from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Conta, Lancamento, Orcamento
from app.schemas.lancamento import LancamentoBulkRequest, LancamentoBulkResponse

DOIS_DECIMAIS = Decimal("0.01")


class LancamentoError(Exception):
    """Erro de regra de negócio em operações de Lançamento."""


def _quantize(v: Decimal) -> Decimal:
    return v.quantize(DOIS_DECIMAIS, rounding=ROUND_HALF_UP)


def bulk_upsert(db: Session, req: LancamentoBulkRequest) -> LancamentoBulkResponse:
    orc = db.get(Orcamento, req.orcamento_id)
    if orc is None:
        raise LancamentoError("Orçamento não encontrado.")

    if not req.items:
        return LancamentoBulkResponse(atualizados=0, criados=0, removidos=0)

    # Dedup: se o cliente mandar duplicatas (conta_id, mes), o último vence.
    items_idx: dict[tuple[int, int], Decimal] = {}
    for item in req.items:
        items_idx[(item.conta_id, item.mes)] = item.valor

    conta_ids = {conta_id for conta_id, _ in items_idx.keys()}
    contas_by_id: dict[int, Conta] = {
        c.id: c
        for c in db.execute(select(Conta).where(Conta.id.in_(conta_ids))).scalars()
    }

    faltando = conta_ids - contas_by_id.keys()
    if faltando:
        raise LancamentoError(
            f"Contas não encontradas: {sorted(faltando)}"
        )

    sinteticas = [c.id for c in contas_by_id.values() if c.natureza != "analitica"]
    if sinteticas:
        raise LancamentoError(
            f"Contas sintéticas não aceitam lançamento: ids={sorted(sinteticas)}"
        )

    chaves = set(items_idx.keys())
    existentes_lst = db.execute(
        select(Lancamento).where(Lancamento.orcamento_id == req.orcamento_id)
    ).scalars().all()
    existentes_idx: dict[tuple[int, int], Lancamento] = {
        (l.conta_id, l.mes): l for l in existentes_lst if (l.conta_id, l.mes) in chaves
    }

    atualizados = 0
    criados = 0
    removidos = 0

    for (conta_id, mes), valor_raw in items_idx.items():
        valor = _quantize(valor_raw)
        existente = existentes_idx.get((conta_id, mes))

        if valor == Decimal("0.00"):
            if existente is not None:
                db.delete(existente)
                removidos += 1
            continue

        if existente is None:
            db.add(
                Lancamento(
                    orcamento_id=req.orcamento_id,
                    conta_id=conta_id,
                    mes=mes,
                    valor=valor,
                )
            )
            criados += 1
        else:
            if existente.valor != valor:
                existente.valor = valor
                atualizados += 1

    db.commit()
    return LancamentoBulkResponse(
        atualizados=atualizados, criados=criados, removidos=removidos
    )
