"""Testes do bulk upsert de lançamentos."""
from decimal import Decimal

from app.models import Lancamento
from app.schemas.lancamento import LancamentoBulkItem, LancamentoBulkRequest
from app.services.lancamentos import LancamentoError, bulk_upsert


def test_bulk_cria_lancamentos_novos(db, orcamento_sopra, plano_contas_basico):
    folha = plano_contas_basico["1.1.1"]
    req = LancamentoBulkRequest(
        orcamento_id=orcamento_sopra.id,
        items=[
            LancamentoBulkItem(conta_id=folha.id, mes=1, valor=Decimal("100")),
            LancamentoBulkItem(conta_id=folha.id, mes=2, valor=Decimal("200")),
        ],
    )
    res = bulk_upsert(db, req)
    assert res.criados == 2
    assert res.atualizados == 0
    assert res.removidos == 0


def test_bulk_atualiza_existente(db, orcamento_sopra, plano_contas_basico):
    folha = plano_contas_basico["1.1.1"]
    db.add(Lancamento(orcamento_id=orcamento_sopra.id, conta_id=folha.id,
                      mes=1, valor=Decimal("100")))
    db.commit()

    req = LancamentoBulkRequest(
        orcamento_id=orcamento_sopra.id,
        items=[LancamentoBulkItem(conta_id=folha.id, mes=1, valor=Decimal("150"))],
    )
    res = bulk_upsert(db, req)
    assert res.atualizados == 1
    assert res.criados == 0


def test_bulk_valor_zero_remove(db, orcamento_sopra, plano_contas_basico):
    folha = plano_contas_basico["1.1.1"]
    db.add(Lancamento(orcamento_id=orcamento_sopra.id, conta_id=folha.id,
                      mes=1, valor=Decimal("100")))
    db.commit()

    req = LancamentoBulkRequest(
        orcamento_id=orcamento_sopra.id,
        items=[LancamentoBulkItem(conta_id=folha.id, mes=1, valor=Decimal("0"))],
    )
    res = bulk_upsert(db, req)
    assert res.removidos == 1
    assert res.criados == 0
    assert res.atualizados == 0


def test_bulk_rejeita_conta_sintetica(db, orcamento_sopra, plano_contas_basico):
    sintetica = plano_contas_basico["1.1"]
    req = LancamentoBulkRequest(
        orcamento_id=orcamento_sopra.id,
        items=[LancamentoBulkItem(conta_id=sintetica.id, mes=1, valor=Decimal("100"))],
    )
    try:
        bulk_upsert(db, req)
    except LancamentoError as e:
        assert "sintética" in str(e).lower()
    else:
        raise AssertionError("Deveria ter levantado LancamentoError")


def test_bulk_rejeita_conta_inexistente(db, orcamento_sopra, plano_contas_basico):
    req = LancamentoBulkRequest(
        orcamento_id=orcamento_sopra.id,
        items=[LancamentoBulkItem(conta_id=99999, mes=1, valor=Decimal("100"))],
    )
    try:
        bulk_upsert(db, req)
    except LancamentoError as e:
        assert "não encontradas" in str(e)
    else:
        raise AssertionError("Deveria ter levantado LancamentoError")


def test_bulk_dedup_ultimo_vence(db, orcamento_sopra, plano_contas_basico):
    """Se o cliente mandar (conta, mes) duplicado, o último valor vence."""
    folha = plano_contas_basico["1.1.1"]
    req = LancamentoBulkRequest(
        orcamento_id=orcamento_sopra.id,
        items=[
            LancamentoBulkItem(conta_id=folha.id, mes=1, valor=Decimal("100")),
            LancamentoBulkItem(conta_id=folha.id, mes=1, valor=Decimal("250")),
        ],
    )
    res = bulk_upsert(db, req)
    assert res.criados == 1
    salvo = db.query(Lancamento).filter_by(
        orcamento_id=orcamento_sopra.id, conta_id=folha.id, mes=1
    ).one()
    assert salvo.valor == Decimal("250.00")
