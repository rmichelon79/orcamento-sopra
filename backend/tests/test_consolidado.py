"""Testes do consolidador de orçamentos (vários empreendimentos)."""
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app.models import Empreendimento, Lancamento, Orcamento
from app.services.grade import GradeError, calcular_consolidado


@pytest.fixture
def empreendimentos_multi(db: Session, plano_contas_basico):
    emps = [
        Empreendimento(codigo="ALTANA", nome="Altana", ativo=True),
        Empreendimento(codigo="ARIA", nome="Aria", ativo=True),
        Empreendimento(codigo="SOPRA", nome="Sopra", ativo=True),
    ]
    db.add_all(emps)
    db.commit()
    for e in emps:
        db.refresh(e)
    return emps


@pytest.fixture
def orcamentos_multi(db: Session, empreendimentos_multi):
    orcs = [
        Orcamento(empreendimento_id=e.id, ano=2026, versao=1)
        for e in empreendimentos_multi
    ]
    db.add_all(orcs)
    db.commit()
    for o in orcs:
        db.refresh(o)
    return orcs


def _node_por_codigo(arvore, codigo):
    for n in arvore:
        if n.codigo == codigo:
            return n
        encontrado = _node_por_codigo(n.filhas, codigo)
        if encontrado is not None:
            return encontrado
    return None


def test_consolidado_soma_lancamentos_de_varios_empreendimentos(
    db, empreendimentos_multi, orcamentos_multi, plano_contas_basico
):
    """3 empreendimentos com lançamentos diferentes em 1.1.1 → consolidado soma os 3."""
    folha = plano_contas_basico["1.1.1"]
    db.add_all([
        Lancamento(orcamento_id=orcamentos_multi[0].id, conta_id=folha.id,
                   mes=1, valor=Decimal("100.00")),
        Lancamento(orcamento_id=orcamentos_multi[1].id, conta_id=folha.id,
                   mes=1, valor=Decimal("200.00")),
        Lancamento(orcamento_id=orcamentos_multi[2].id, conta_id=folha.id,
                   mes=1, valor=Decimal("300.00")),
    ])
    db.commit()

    res = calcular_consolidado(
        db, ano=2026, empreendimento_ids=[e.id for e in empreendimentos_multi]
    )

    folha_consolidada = _node_por_codigo(res.arvore, "1.1.1")
    assert folha_consolidada.valores[0] == Decimal("600.00")
    assert res.total_geral == Decimal("600.00")
    assert len(res.empreendimentos_incluidos) == 3
    assert all(v == 1 for v in res.versoes_usadas.values())


def test_consolidado_subset_de_empreendimentos(
    db, empreendimentos_multi, orcamentos_multi, plano_contas_basico
):
    """Só consolidando 2 dos 3 empreendimentos."""
    folha = plano_contas_basico["1.1.1"]
    db.add_all([
        Lancamento(orcamento_id=orcamentos_multi[0].id, conta_id=folha.id,
                   mes=1, valor=Decimal("100.00")),
        Lancamento(orcamento_id=orcamentos_multi[1].id, conta_id=folha.id,
                   mes=1, valor=Decimal("200.00")),
        Lancamento(orcamento_id=orcamentos_multi[2].id, conta_id=folha.id,
                   mes=1, valor=Decimal("300.00")),
    ])
    db.commit()

    res = calcular_consolidado(
        db, ano=2026,
        empreendimento_ids=[empreendimentos_multi[0].id, empreendimentos_multi[2].id],
    )
    assert res.total_geral == Decimal("400.00")  # 100 + 300
    assert empreendimentos_multi[1].id not in res.empreendimentos_incluidos


def test_consolidado_default_inclui_apenas_ativos(
    db, empreendimentos_multi, orcamentos_multi, plano_contas_basico
):
    """Sem empreendimento_ids, soma todos os ativos."""
    # Desativa o segundo
    empreendimentos_multi[1].ativo = False
    db.commit()

    folha = plano_contas_basico["1.1.1"]
    db.add_all([
        Lancamento(orcamento_id=orcamentos_multi[0].id, conta_id=folha.id,
                   mes=1, valor=Decimal("100.00")),
        Lancamento(orcamento_id=orcamentos_multi[1].id, conta_id=folha.id,
                   mes=1, valor=Decimal("200.00")),
        Lancamento(orcamento_id=orcamentos_multi[2].id, conta_id=folha.id,
                   mes=1, valor=Decimal("300.00")),
    ])
    db.commit()

    res = calcular_consolidado(db, ano=2026)
    assert res.total_geral == Decimal("400.00")  # 100 + 300 (inativo fica fora)


def test_consolidado_usa_versao_mais_recente(
    db, empreendimentos_multi, plano_contas_basico
):
    """Se um empreendimento tem v1 e v2, o consolidado usa v2."""
    emp = empreendimentos_multi[0]
    orc_v1 = Orcamento(empreendimento_id=emp.id, ano=2026, versao=1)
    orc_v2 = Orcamento(empreendimento_id=emp.id, ano=2026, versao=2)
    db.add_all([orc_v1, orc_v2])
    db.commit()

    folha = plano_contas_basico["1.1.1"]
    db.add_all([
        Lancamento(orcamento_id=orc_v1.id, conta_id=folha.id,
                   mes=1, valor=Decimal("100.00")),
        Lancamento(orcamento_id=orc_v2.id, conta_id=folha.id,
                   mes=1, valor=Decimal("999.00")),
    ])
    db.commit()

    res = calcular_consolidado(db, ano=2026, empreendimento_ids=[emp.id])
    assert res.total_geral == Decimal("999.00")
    assert res.versoes_usadas[emp.id] == 2


def test_consolidado_ignora_empreendimentos_sem_orcamento_no_ano(
    db, empreendimentos_multi, orcamentos_multi, plano_contas_basico
):
    """Empreendimento sem orçamento em 2027 não quebra a consolidação."""
    folha = plano_contas_basico["1.1.1"]
    db.add(Lancamento(orcamento_id=orcamentos_multi[0].id, conta_id=folha.id,
                      mes=1, valor=Decimal("500.00")))
    db.commit()

    # Pede 2027 para o primeiro (que só tem 2026) → deve falhar com mensagem amigável
    with pytest.raises(GradeError, match="Nenhum dos empreendimentos"):
        calcular_consolidado(
            db, ano=2027, empreendimento_ids=[empreendimentos_multi[0].id]
        )


def test_consolidado_propaga_subtotais(
    db, empreendimentos_multi, orcamentos_multi, plano_contas_basico
):
    """Soma propaga até as raízes sintéticas."""
    f1 = plano_contas_basico["1.1.1"]
    f2 = plano_contas_basico["1.1.2"]
    db.add_all([
        Lancamento(orcamento_id=orcamentos_multi[0].id, conta_id=f1.id,
                   mes=1, valor=Decimal("100.00")),
        Lancamento(orcamento_id=orcamentos_multi[1].id, conta_id=f2.id,
                   mes=1, valor=Decimal("200.00")),
    ])
    db.commit()

    res = calcular_consolidado(
        db, ano=2026,
        empreendimento_ids=[e.id for e in empreendimentos_multi],
    )

    receita = _node_por_codigo(res.arvore, "1")
    assert receita.valores[0] == Decimal("300.00")
    assert receita.total == Decimal("300.00")
