from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Conta(Base):
    __tablename__ = "conta"
    __table_args__ = (
        CheckConstraint("nivel BETWEEN 1 AND 5", name="ck_conta_nivel"),
        CheckConstraint(
            "natureza IN ('sintetica', 'analitica')", name="ck_conta_natureza"
        ),
        CheckConstraint(
            "tipo IN ('receita', 'custo', 'despesa', 'investimento', 'financeiro')",
            name="ck_conta_tipo",
        ),
        CheckConstraint(
            "tipo_orcamentario IN ('entrada', 'saida')",
            name="ck_conta_tipo_orcamentario",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    codigo: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    nome: Mapped[str] = mapped_column(String, nullable=False)
    parent_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("conta.id"), nullable=True
    )
    nivel: Mapped[int] = mapped_column(Integer, nullable=False)
    tipo: Mapped[str] = mapped_column(String, nullable=False)
    natureza: Mapped[str] = mapped_column(String, nullable=False)
    # Aplicado apenas nas raízes (parent_id NULL). Filhas herdam implicitamente.
    # Usado pelo cálculo do total_geral: entrada = +, saida = −.
    tipo_orcamentario: Mapped[str] = mapped_column(
        String, nullable=False, default="saida", server_default="saida"
    )
    ordem: Mapped[int] = mapped_column(Integer, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    parent: Mapped["Conta | None"] = relationship(
        "Conta", remote_side="Conta.id", back_populates="filhas"
    )
    filhas: Mapped[list["Conta"]] = relationship(
        "Conta", back_populates="parent", cascade="all, delete-orphan"
    )
    lancamentos: Mapped[list["Lancamento"]] = relationship(  # noqa: F821
        back_populates="conta", cascade="all, delete-orphan"
    )
