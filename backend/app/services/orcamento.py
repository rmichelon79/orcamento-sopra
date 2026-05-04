from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Empreendimento, Orcamento
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
