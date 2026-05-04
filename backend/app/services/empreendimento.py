from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Empreendimento, Orcamento
from app.schemas.empreendimento import EmpreendimentoCreate, EmpreendimentoUpdate


class EmpreendimentoError(Exception):
    """Erro de regra de negócio em operações de Empreendimento."""


def listar(db: Session, ativos: bool | None = None) -> list[Empreendimento]:
    stmt = select(Empreendimento).order_by(Empreendimento.codigo)
    if ativos is not None:
        stmt = stmt.where(Empreendimento.ativo == ativos)
    return list(db.execute(stmt).scalars().all())


def criar(db: Session, data: EmpreendimentoCreate) -> Empreendimento:
    existente = db.execute(
        select(Empreendimento).where(Empreendimento.codigo == data.codigo)
    ).scalar_one_or_none()
    if existente is not None:
        raise EmpreendimentoError(
            f"Já existe empreendimento com código {data.codigo}."
        )
    emp = Empreendimento(codigo=data.codigo, nome=data.nome, ativo=True)
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return emp


def atualizar(
    db: Session, empreendimento_id: int, data: EmpreendimentoUpdate
) -> Empreendimento:
    emp = db.get(Empreendimento, empreendimento_id)
    if emp is None:
        raise EmpreendimentoError("Empreendimento não encontrado.")

    if data.codigo is not None and data.codigo != emp.codigo:
        clash = db.execute(
            select(Empreendimento).where(
                Empreendimento.codigo == data.codigo,
                Empreendimento.id != empreendimento_id,
            )
        ).scalar_one_or_none()
        if clash is not None:
            raise EmpreendimentoError(
                f"Já existe empreendimento com código {data.codigo}."
            )
        emp.codigo = data.codigo

    if data.nome is not None:
        emp.nome = data.nome
    if data.ativo is not None:
        emp.ativo = data.ativo

    db.commit()
    db.refresh(emp)
    return emp


def excluir(db: Session, empreendimento_id: int) -> None:
    emp = db.get(Empreendimento, empreendimento_id)
    if emp is None:
        raise EmpreendimentoError("Empreendimento não encontrado.")
    qtd_orcamentos = int(
        db.execute(
            select(func.count(Orcamento.id)).where(
                Orcamento.empreendimento_id == empreendimento_id
            )
        ).scalar_one()
    )
    if qtd_orcamentos > 0:
        raise EmpreendimentoError(
            "Não é possível excluir: o empreendimento possui orçamentos."
        )
    db.delete(emp)
    db.commit()
