from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Orcamento(Base):
    __tablename__ = "orcamento"
    __table_args__ = (
        UniqueConstraint(
            "empreendimento_id", "ano", "versao", name="uq_orcamento_emp_ano_versao"
        ),
        CheckConstraint(
            "status IN ('rascunho', 'aprovado', 'arquivado')",
            name="ck_orcamento_status",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    empreendimento_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("empreendimento.id"), nullable=False
    )
    ano: Mapped[int] = mapped_column(Integer, nullable=False)
    versao: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status: Mapped[str] = mapped_column(String, default="rascunho", nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), nullable=False
    )

    empreendimento: Mapped["Empreendimento"] = relationship(  # noqa: F821
        back_populates="orcamentos"
    )
    lancamentos: Mapped[list["Lancamento"]] = relationship(  # noqa: F821
        back_populates="orcamento", cascade="all, delete-orphan"
    )
