from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Empreendimento, Lancamento, Orcamento
from app.schemas.orcamento import OrcamentoCreate, OrcamentoUpdate


class OrcamentoError(Exception):
    """Erro de regra de negócio em operações de Orçamento."""


def buscar(
    db: Session, empreendimento_id: int, ano: int, versao: int | None = None
) -> Orcamento | None:
    stmt = select(Orcamento).where(
        Orcamento.empreendimento_id == empreendimento_id,
        Orcamento.ano == ano,
    )
    if versao is not None:
        stmt = stmt.where(Orcamento.versao == versao)
    else:
        stmt = stmt.order_by(Orcamento.versao.desc())
    return db.execute(stmt).scalars().first()


def criar(db: Session, data: OrcamentoCreate) -> Orcamento:
    emp = db.get(Empreendimento, data.empreendimento_id)
    if emp is None:
        raise OrcamentoError("Empreendimento não encontrado.")

    existente = db.execute(
        select(Orcamento).where(
            Orcamento.empreendimento_id == data.empreendimento_id,
            Orcamento.ano == data.ano,
            Orcamento.versao == data.versao,
        )
    ).scalar_one_or_none()
    if existente is not None:
        raise OrcamentoError(
            f"Já existe orçamento para empreendimento {data.empreendimento_id}, "
            f"ano {data.ano}, versão {data.versao}."
        )

    orc = Orcamento(
        empreendimento_id=data.empreendimento_id,
        ano=data.ano,
        versao=data.versao,
        status="rascunho",
    )
    db.add(orc)
    db.commit()
    db.refresh(orc)
    return orc


def atualizar_status(db: Session, orcamento_id: int, data: OrcamentoUpdate) -> Orcamento:
    orc = db.get(Orcamento, orcamento_id)
    if orc is None:
        raise OrcamentoError("Orçamento não encontrado.")
    orc.status = data.status
    db.commit()
    db.refresh(orc)
    return orc


def clonar(db: Session, orcamento_id_fonte: int) -> Orcamento:
    """Cria uma nova versão (versao++) clonando lançamentos da versão fonte.

    Status da nova versão = 'rascunho'.
    """
    fonte = db.get(Orcamento, orcamento_id_fonte)
    if fonte is None:
        raise OrcamentoError("Orçamento fonte não encontrado.")

    proxima_versao = (
        db.execute(
            select(func.coalesce(func.max(Orcamento.versao), 0)).where(
                Orcamento.empreendimento_id == fonte.empreendimento_id,
                Orcamento.ano == fonte.ano,
            )
        ).scalar_one()
        + 1
    )

    novo = Orcamento(
        empreendimento_id=fonte.empreendimento_id,
        ano=fonte.ano,
        versao=proxima_versao,
        status="rascunho",
    )
    db.add(novo)
    db.flush()  # pega o id

    # Clona lançamentos
    lancs_fonte = db.execute(
        select(Lancamento).where(Lancamento.orcamento_id == fonte.id)
    ).scalars().all()
    for l in lancs_fonte:
        db.add(
            Lancamento(
                orcamento_id=novo.id,
                conta_id=l.conta_id,
                mes=l.mes,
                valor=l.valor,
            )
        )

    db.commit()
    db.refresh(novo)
    return novo
