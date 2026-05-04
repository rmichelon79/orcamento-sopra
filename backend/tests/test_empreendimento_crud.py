"""Testes do CRUD de empreendimento (service)."""
import pytest
from sqlalchemy.orm import Session

from app.models import Empreendimento, Orcamento
from app.schemas.empreendimento import EmpreendimentoCreate, EmpreendimentoUpdate
from app.services import empreendimento as svc
from app.services.empreendimento import EmpreendimentoError


def test_criar_empreendimento(db: Session):
    emp = svc.criar(db, EmpreendimentoCreate(codigo="ALTANA", nome="Altana"))
    assert emp.id is not None
    assert emp.codigo == "ALTANA"
    assert emp.ativo is True


def test_criar_empreendimento_codigo_duplicado(db: Session):
    svc.criar(db, EmpreendimentoCreate(codigo="X", nome="X"))
    with pytest.raises(EmpreendimentoError, match="(?i)já existe"):
        svc.criar(db, EmpreendimentoCreate(codigo="X", nome="Y"))


def test_atualizar_empreendimento(db: Session):
    emp = svc.criar(db, EmpreendimentoCreate(codigo="A", nome="A1"))
    novo = svc.atualizar(
        db, emp.id, EmpreendimentoUpdate(nome="Novo Nome", ativo=False)
    )
    assert novo.nome == "Novo Nome"
    assert novo.ativo is False
    assert novo.codigo == "A"


def test_atualizar_codigo_clash(db: Session):
    svc.criar(db, EmpreendimentoCreate(codigo="A", nome="A"))
    b = svc.criar(db, EmpreendimentoCreate(codigo="B", nome="B"))
    with pytest.raises(EmpreendimentoError, match="(?i)já existe"):
        svc.atualizar(db, b.id, EmpreendimentoUpdate(codigo="A"))


def test_excluir_empreendimento_sem_orcamento(db: Session):
    emp = svc.criar(db, EmpreendimentoCreate(codigo="X", nome="X"))
    svc.excluir(db, emp.id)
    assert db.get(Empreendimento, emp.id) is None


def test_excluir_empreendimento_com_orcamento_falha(db: Session):
    emp = svc.criar(db, EmpreendimentoCreate(codigo="X", nome="X"))
    db.add(Orcamento(empreendimento_id=emp.id, ano=2026, versao=1))
    db.commit()
    with pytest.raises(EmpreendimentoError, match="possui orçamentos"):
        svc.excluir(db, emp.id)


def test_listar_filtra_ativos(db: Session):
    e1 = svc.criar(db, EmpreendimentoCreate(codigo="A", nome="A"))
    svc.criar(db, EmpreendimentoCreate(codigo="B", nome="B"))
    svc.atualizar(db, e1.id, EmpreendimentoUpdate(ativo=False))

    todos = svc.listar(db)
    ativos = svc.listar(db, ativos=True)
    inativos = svc.listar(db, ativos=False)

    assert len(todos) == 2
    assert len(ativos) == 1 and ativos[0].codigo == "B"
    assert len(inativos) == 1 and inativos[0].codigo == "A"
