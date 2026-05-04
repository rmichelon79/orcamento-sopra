"""Testes unitários do cálculo recursivo de grade orçamentária."""
from decimal import Decimal

from app.models import Lancamento
from app.services.grade import ZERO, calcular_grade


def _node_por_codigo(arvore, codigo):
    for n in arvore:
        if n.codigo == codigo:
            return n
        encontrado = _node_por_codigo(n.filhas, codigo)
        if encontrado is not None:
            return encontrado
    return None


def test_grade_vazia_tem_zeros_em_tudo(db, orcamento_sopra, plano_contas_basico):
    grade = calcular_grade(db, orcamento_sopra.id)

    assert grade.total_geral == ZERO
    assert grade.totais_mes == [ZERO] * 12

    raiz_receita = _node_por_codigo(grade.arvore, "1")
    assert raiz_receita is not None
    assert raiz_receita.total == ZERO
    assert raiz_receita.valores == [ZERO] * 12

    folha = _node_por_codigo(grade.arvore, "1.1.1")
    assert folha is not None
    assert folha.natureza == "analitica"
    assert folha.valores == [ZERO] * 12


def test_subtotais_propagam_bottom_up(db, orcamento_sopra, plano_contas_basico):
    """Lançamento em folha analítica propaga para sintéticos pais."""
    folha = plano_contas_basico["1.1.1"]
    db.add_all([
        Lancamento(orcamento_id=orcamento_sopra.id, conta_id=folha.id,
                   mes=1, valor=Decimal("100.00")),
        Lancamento(orcamento_id=orcamento_sopra.id, conta_id=folha.id,
                   mes=2, valor=Decimal("200.50")),
    ])
    db.commit()

    grade = calcular_grade(db, orcamento_sopra.id)

    n_folha = _node_por_codigo(grade.arvore, "1.1.1")
    assert n_folha.valores[0] == Decimal("100.00")
    assert n_folha.valores[1] == Decimal("200.50")
    assert n_folha.total == Decimal("300.50")

    n_pai = _node_por_codigo(grade.arvore, "1.1")
    assert n_pai.valores[0] == Decimal("100.00")
    assert n_pai.valores[1] == Decimal("200.50")
    assert n_pai.total == Decimal("300.50")

    n_avo = _node_por_codigo(grade.arvore, "1")
    assert n_avo.total == Decimal("300.50")

    assert grade.totais_mes[0] == Decimal("100.00")
    assert grade.totais_mes[1] == Decimal("200.50")
    assert grade.total_geral == Decimal("300.50")


def test_subtotais_somam_filhas_irmas(db, orcamento_sopra, plano_contas_basico):
    """Sintético com várias filhas analíticas soma cada mês corretamente."""
    f1 = plano_contas_basico["1.1.1"]
    f2 = plano_contas_basico["1.1.2"]
    db.add_all([
        Lancamento(orcamento_id=orcamento_sopra.id, conta_id=f1.id,
                   mes=3, valor=Decimal("150.00")),
        Lancamento(orcamento_id=orcamento_sopra.id, conta_id=f2.id,
                   mes=3, valor=Decimal("250.00")),
    ])
    db.commit()

    grade = calcular_grade(db, orcamento_sopra.id)

    n_pai = _node_por_codigo(grade.arvore, "1.1")
    assert n_pai.valores[2] == Decimal("400.00")
    assert n_pai.total == Decimal("400.00")


def test_grade_isola_orcamentos_diferentes(db, empreendimento_sopra,
                                            plano_contas_basico):
    """Lançamentos em um orçamento não vazam para outro."""
    from app.models import Orcamento

    orc_a = Orcamento(empreendimento_id=empreendimento_sopra.id, ano=2026, versao=1)
    orc_b = Orcamento(empreendimento_id=empreendimento_sopra.id, ano=2027, versao=1)
    db.add_all([orc_a, orc_b])
    db.commit()
    db.refresh(orc_a)
    db.refresh(orc_b)

    folha = plano_contas_basico["1.1.1"]
    db.add(Lancamento(orcamento_id=orc_a.id, conta_id=folha.id,
                      mes=1, valor=Decimal("999.00")))
    db.commit()

    grade_a = calcular_grade(db, orc_a.id)
    grade_b = calcular_grade(db, orc_b.id)

    assert grade_a.total_geral == Decimal("999.00")
    assert grade_b.total_geral == ZERO


def test_arvore_ordenada_por_ordem(db, orcamento_sopra, plano_contas_basico):
    grade = calcular_grade(db, orcamento_sopra.id)
    raizes = [n.codigo for n in grade.arvore]
    assert raizes == ["1", "2"]
    pai_vendas = _node_por_codigo(grade.arvore, "1.1")
    folhas = [f.codigo for f in pai_vendas.filhas]
    assert folhas == ["1.1.1", "1.1.2"]
