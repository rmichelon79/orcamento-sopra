"""Testes do versionamento de orçamento (clonagem + status)."""
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Lancamento, Orcamento
from app.schemas.orcamento import OrcamentoUpdate
from app.services import orcamento as svc


def test_clonar_cria_proxima_versao(db: Session, orcamento_sopra):
    novo = svc.clonar(db, orcamento_sopra.id)
    assert novo.id != orcamento_sopra.id
    assert novo.empreendimento_id == orcamento_sopra.empreendimento_id
    assert novo.ano == orcamento_sopra.ano
    assert novo.versao == orcamento_sopra.versao + 1
    assert novo.status == "rascunho"


def test_clonar_copia_lancamentos(db: Session, orcamento_sopra, plano_contas_basico):
    folha = plano_contas_basico["1.1.1"]
    db.add_all([
        Lancamento(orcamento_id=orcamento_sopra.id, conta_id=folha.id,
                   mes=1, valor=Decimal("100.00")),
        Lancamento(orcamento_id=orcamento_sopra.id, conta_id=folha.id,
                   mes=2, valor=Decimal("200.00")),
    ])
    db.commit()

    novo = svc.clonar(db, orcamento_sopra.id)

    lancs_novo = db.execute(
        select(Lancamento).where(Lancamento.orcamento_id == novo.id).order_by(Lancamento.mes)
    ).scalars().all()
    assert len(lancs_novo) == 2
    assert lancs_novo[0].mes == 1 and lancs_novo[0].valor == Decimal("100.00")
    assert lancs_novo[1].mes == 2 and lancs_novo[1].valor == Decimal("200.00")


def test_clonar_versoes_sucessivas(db: Session, orcamento_sopra):
    v2 = svc.clonar(db, orcamento_sopra.id)
    v3 = svc.clonar(db, v2.id)
    v4 = svc.clonar(db, orcamento_sopra.id)  # clona v1 → próxima versão é v4
    assert v2.versao == 2
    assert v3.versao == 3
    assert v4.versao == 4


def test_clonar_isola_lancamentos(db: Session, orcamento_sopra, plano_contas_basico):
    """Editar lançamento na nova versão não afeta a versão fonte."""
    folha = plano_contas_basico["1.1.1"]
    db.add(Lancamento(orcamento_id=orcamento_sopra.id, conta_id=folha.id,
                      mes=1, valor=Decimal("100.00")))
    db.commit()

    novo = svc.clonar(db, orcamento_sopra.id)

    # Modifica o clone
    lanc_novo = db.execute(
        select(Lancamento).where(Lancamento.orcamento_id == novo.id)
    ).scalars().one()
    lanc_novo.valor = Decimal("999.00")
    db.commit()

    # Original continua 100
    lanc_orig = db.execute(
        select(Lancamento).where(Lancamento.orcamento_id == orcamento_sopra.id)
    ).scalars().one()
    assert lanc_orig.valor == Decimal("100.00")


def test_atualizar_status(db: Session, orcamento_sopra):
    aprovado = svc.atualizar_status(
        db, orcamento_sopra.id, OrcamentoUpdate(status="aprovado")
    )
    assert aprovado.status == "aprovado"

    arquivado = svc.atualizar_status(
        db, orcamento_sopra.id, OrcamentoUpdate(status="arquivado")
    )
    assert arquivado.status == "arquivado"
