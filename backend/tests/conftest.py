"""Fixtures pytest: banco em memória, empreendimento + plano de contas mínimo.

Para que o ambiente de testes use SQLite em memória sem tocar o orcamento.db local,
sobrescrevemos o engine antes de qualquer import do app.
"""
from collections.abc import Generator

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app import database as db_module


@pytest.fixture
def db() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    db_module.Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def empreendimento_sopra(db: Session):
    from app.models import Empreendimento

    emp = Empreendimento(codigo="SOPRA", nome="Sopra Incorporadora", ativo=True)
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return emp


@pytest.fixture
def plano_contas_basico(db: Session):
    """
    1 Receita (sintetica)
      1.1 Vendas (sintetica)
        1.1.1 Residencial (analitica)
        1.1.2 Comercial (analitica)
    2 Custo (sintetica)
      2.1 Materiais (analitica)
    """
    from app.models import Conta

    contas = {
        "1": Conta(codigo="1", nome="Receita", parent_id=None, nivel=1,
                   tipo="receita", natureza="sintetica",
                   tipo_orcamentario="entrada", ordem=1),
        "2": Conta(codigo="2", nome="Custo", parent_id=None, nivel=1,
                   tipo="custo", natureza="sintetica",
                   tipo_orcamentario="saida", ordem=2),
    }
    db.add_all(contas.values())
    db.flush()

    contas["1.1"] = Conta(codigo="1.1", nome="Vendas", parent_id=contas["1"].id,
                          nivel=2, tipo="receita", natureza="sintetica", ordem=1)
    contas["2.1"] = Conta(codigo="2.1", nome="Materiais", parent_id=contas["2"].id,
                          nivel=2, tipo="custo", natureza="analitica", ordem=1)
    db.add_all([contas["1.1"], contas["2.1"]])
    db.flush()

    contas["1.1.1"] = Conta(codigo="1.1.1", nome="Residencial",
                            parent_id=contas["1.1"].id, nivel=3,
                            tipo="receita", natureza="analitica", ordem=1)
    contas["1.1.2"] = Conta(codigo="1.1.2", nome="Comercial",
                            parent_id=contas["1.1"].id, nivel=3,
                            tipo="receita", natureza="analitica", ordem=2)
    db.add_all([contas["1.1.1"], contas["1.1.2"]])
    db.commit()

    for c in contas.values():
        db.refresh(c)
    return contas


@pytest.fixture
def orcamento_sopra(db: Session, empreendimento_sopra, plano_contas_basico):
    from app.models import Orcamento

    orc = Orcamento(empreendimento_id=empreendimento_sopra.id, ano=2026, versao=1)
    db.add(orc)
    db.commit()
    db.refresh(orc)
    return orc
