"""Testes da edição de código + cascade + ordenação natural."""
import pytest
from sqlalchemy.orm import Session

from app.models import Conta
from app.schemas.conta import ContaCreate, ContaUpdate
from app.services import contas as svc
from app.services.contas import ContaError


def test_criar_com_codigo_explicito(db: Session, plano_contas_basico):
    """Permite criar conta com código escolhido pelo usuário (com gap)."""
    conta = svc.criar_conta(
        db,
        ContaCreate(
            nome="Permutas",
            tipo="receita",
            natureza="analitica",
            parent_id=plano_contas_basico["1.1"].id,
            codigo="1.1.99",
        ),
    )
    assert conta.codigo == "1.1.99"
    assert conta.parent_id == plano_contas_basico["1.1"].id
    assert conta.nivel == 3


def test_criar_codigo_invalido_formato(db: Session, plano_contas_basico):
    with pytest.raises(ContaError, match="(?i)formato"):
        svc.criar_conta(
            db,
            ContaCreate(
                nome="X", tipo="receita", natureza="analitica", codigo="abc.def"
            ),
        )


def test_criar_codigo_pai_inexistente(db: Session, plano_contas_basico):
    with pytest.raises(ContaError, match="(?i)pai .* não encontrada"):
        svc.criar_conta(
            db,
            ContaCreate(
                nome="X", tipo="receita", natureza="analitica", codigo="9.9.9"
            ),
        )


def test_renomear_analitica_simples(db: Session, plano_contas_basico):
    """Mudar código de analítica isolada — sem cascade."""
    folha = plano_contas_basico["1.1.1"]
    svc.atualizar_conta(db, folha.id, ContaUpdate(codigo="1.1.50"))
    db.refresh(folha)
    assert folha.codigo == "1.1.50"


def test_cascade_em_sintetica(db: Session, plano_contas_basico):
    """Mudar código de sintética propaga pra todas as filhas."""
    pai = plano_contas_basico["1.1"]  # tem filhas 1.1.1 e 1.1.2
    svc.atualizar_conta(db, pai.id, ContaUpdate(codigo="1.5"))
    db.refresh(pai)
    assert pai.codigo == "1.5"

    f1 = db.get(Conta, plano_contas_basico["1.1.1"].id)
    f2 = db.get(Conta, plano_contas_basico["1.1.2"].id)
    assert f1.codigo == "1.5.1"
    assert f2.codigo == "1.5.2"
    assert f1.parent_id == pai.id  # ainda filha


def test_codigo_duplicado(db: Session, plano_contas_basico):
    folha1 = plano_contas_basico["1.1.1"]
    folha2 = plano_contas_basico["1.1.2"]
    with pytest.raises(ContaError, match="(?i)já existe"):
        svc.atualizar_conta(db, folha1.id, ContaUpdate(codigo=folha2.codigo))


def test_mover_entre_pais(db: Session, plano_contas_basico):
    """Conta filha de 1.1 movida pra dentro de 2 (deve atualizar parent_id e nivel)."""
    folha = plano_contas_basico["1.1.1"]
    pai_destino = plano_contas_basico["2"]
    # Move 1.1.1 → 2.99 (vira filha direta de "2", nível 2)
    svc.atualizar_conta(db, folha.id, ContaUpdate(codigo="2.99"))
    db.refresh(folha)
    assert folha.codigo == "2.99"
    assert folha.parent_id == pai_destino.id
    assert folha.nivel == 2


def test_mover_pai_pra_dentro_de_filha_falha(db: Session, plano_contas_basico):
    """Não pode criar ciclo: ancestral colocado como descendente."""
    raiz = plano_contas_basico["1"]  # sintética com filha sintética 1.1
    with pytest.raises(ContaError, match="(?i)ciclo"):
        # tenta colocar "1" como filha de "1.1" — ciclo verdadeiro (1.1 é descendente de 1)
        svc.atualizar_conta(db, raiz.id, ContaUpdate(codigo="1.1.99"))


def test_excede_nivel_max(db: Session, plano_contas_basico):
    folha = plano_contas_basico["1.1.1"]
    # 1.1.1 → 1.1.1.1.1.1 (6 níveis) excede o máximo de 5
    with pytest.raises(ContaError, match=r"(?i)n[íi]veis|nivel"):
        svc.atualizar_conta(db, folha.id, ContaUpdate(codigo="1.1.1.1.1.1"))


def test_ordenacao_natural_no_listar_arvore(db: Session, plano_contas_basico):
    """1.1.10 vem depois de 1.1.2 (e não antes, como em ordenação string)."""
    # cria 1.1.10 e 1.1.20 manualmente
    pai = plano_contas_basico["1.1"]
    svc.criar_conta(
        db,
        ContaCreate(
            nome="Décima", tipo="receita", natureza="analitica",
            parent_id=pai.id, codigo="1.1.10",
        ),
    )
    svc.criar_conta(
        db,
        ContaCreate(
            nome="Vigésima", tipo="receita", natureza="analitica",
            parent_id=pai.id, codigo="1.1.20",
        ),
    )

    arvore = svc.listar_arvore(db)
    # encontra 1.1
    def find(nodes, codigo):
        for n in nodes:
            if n.codigo == codigo:
                return n
            r = find(n.filhas, codigo)
            if r:
                return r
        return None

    n_pai = find(arvore, "1.1")
    codigos_filhas = [f.codigo for f in n_pai.filhas]
    assert codigos_filhas == ["1.1.1", "1.1.2", "1.1.10", "1.1.20"]


def test_renomear_nao_afeta_lancamentos(
    db: Session, plano_contas_basico, orcamento_sopra
):
    """Mudar código mantém lançamentos (FK por id, não código)."""
    from decimal import Decimal
    from app.models import Lancamento

    folha = plano_contas_basico["1.1.1"]
    db.add(Lancamento(
        orcamento_id=orcamento_sopra.id, conta_id=folha.id,
        mes=1, valor=Decimal("999.00"),
    ))
    db.commit()

    svc.atualizar_conta(db, folha.id, ContaUpdate(codigo="1.1.99"))

    # lancamento ainda existe e está ligado à mesma conta
    from sqlalchemy import select
    lanc = db.execute(
        select(Lancamento).where(Lancamento.conta_id == folha.id)
    ).scalar_one()
    assert lanc.valor == Decimal("999.00")
