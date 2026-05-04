from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Integer, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Lancamento(Base):
    __tablename__ = "lancamento"
    __table_args__ = (
        UniqueConstraint(
            "orcamento_id", "conta_id", "mes", name="uq_lancamento_orc_conta_mes"
        ),
        CheckConstraint("mes BETWEEN 1 AND 12", name="ck_lancamento_mes"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    orcamento_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("orcamento.id"), nullable=False
    )
    conta_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("conta.id"), nullable=False
    )
    mes: Mapped[int] = mapped_column(Integer, nullable=False)
    valor: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), default=Decimal("0"), nullable=False
    )

    orcamento: Mapped["Orcamento"] = relationship(  # noqa: F821
        back_populates="lancamentos"
    )
    conta: Mapped["Conta"] = relationship(  # noqa: F821
        back_populates="lancamentos"
    )
