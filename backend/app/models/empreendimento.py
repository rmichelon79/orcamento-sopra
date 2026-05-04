from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Empreendimento(Base):
    __tablename__ = "empreendimento"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    codigo: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    nome: Mapped[str] = mapped_column(String, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    orcamentos: Mapped[list["Orcamento"]] = relationship(  # noqa: F821
        back_populates="empreendimento",
        cascade="all, delete-orphan",
    )
