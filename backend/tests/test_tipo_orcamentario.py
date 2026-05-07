"""Testes do tipo_orcamentario nas raízes (entrada/saída) afetando total_geral."""
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import Conta, Empreendimento, Lancamento, Orcamento
from app.services.grade import calcular_consolidado, calcular_grade


def test_total_geral_entrada_menos_saida(
    db: Session, plano_contas_basico, orcamento_sopra
):
    """Entrada lança 1000, saída lança 300 → total_geral = 700 (1000 − 300)."""
    receita = plano_contas_basico["1.1.1"]  # descendente da raiz "1" (entrada)
    custo = plano_contas_basico["2.1"]      # descendente da raiz "2" (saída)

    db.add_all([
        Lancamento(orcamento_id=orcamento_sopra.id, conta_id=receita.id,
                   mes=1, valor=Decimal("1000.00")),
        Lancamento(orcamento_id=orcamento_sopra.id, conta_id=custo.id,
                   mes=1, valor=Decimal("300.00")),
    ])
    db.commit()

    grade = calcular_grade(db, orcamento_sopra.id)

    # Subtotais individuais ficam POSITIVOS — não invertidos
    def find(nodes, codigo):
        for n in nodes:
            if n.codigo == codigo:
                return n
            r = find(n.filhas, codigo)
            if r:
                return r

    raiz_receita = find(grade.arvore, "1")
    raiz_custo = find(grade.arvore, "2")
    assert raiz_receita.total == Decimal("1000.00")
    assert raiz_custo.total == Decimal("300.00")  # subtotal positivo

    # Total geral: aplica sinal — entrada(+1) - saida(+1) = 1000 - 300
    assert grade.total_geral == Decimal("700.00")
    assert grade.totais_mes[0] == Decimal("700.00")


def test_total_geral_so_saidas(db: Session, plano_contas_basico, orcamento_sopra):
    """Empreendimento sem receita ainda lançada (BORORO) — total deve ser negativo."""
    custo = plano_contas_basico["2.1"]
    db.add(Lancamento(orcamento_id=orcamento_sopra.id, conta_id=custo.id,
                      mes=3, valor=Decimal("500.00")))
    db.commit()

    grade = calcular_grade(db, orcamento_sopra.id)
    assert grade.total_geral == Decimal("-500.00")


def test_alterar_tipo_orcamentario_da_raiz(
    db: Session, plano_contas_basico, orcamento_sopra
):
    """Mudar a raiz '2' de saída→entrada inverte o sinal no total."""
    custo = plano_contas_basico["2.1"]
    db.add(Lancamento(orcamento_id=orcamento_sopra.id, conta_id=custo.id,
                      mes=1, valor=Decimal("500.00")))
    db.commit()

    grade1 = calcular_grade(db, orcamento_sopra.id)
    assert grade1.total_geral == Decimal("-500.00")  # saída

    raiz_2 = plano_contas_basico["2"]
    raiz_2.tipo_orcamentario = "entrada"
    db.commit()

    grade2 = calcular_grade(db, orcamento_sopra.id)
    assert grade2.total_geral == Decimal("500.00")  # agora entrada


def test_consolidado_aplica_sinal(db: Session, plano_contas_basico):
    """No consolidado, total_geral também aplica sinal por raiz."""
    e1 = Empreendimento(codigo="A", nome="A", ativo=True)
    e2 = Empreendimento(codigo="B", nome="B", ativo=True)
    db.add_all([e1, e2])
    db.commit()
    o1 = Orcamento(empreendimento_id=e1.id, ano=2026, versao=1)
    o2 = Orcamento(empreendimento_id=e2.id, ano=2026, versao=1)
    db.add_all([o1, o2])
    db.commit()

    receita = plano_contas_basico["1.1.1"]
    custo = plano_contas_basico["2.1"]
    db.add_all([
        Lancamento(orcamento_id=o1.id, conta_id=receita.id, mes=1, valor=Decimal("100")),
        Lancamento(orcamento_id=o1.id, conta_id=custo.id, mes=1, valor=Decimal("30")),
        Lancamento(orcamento_id=o2.id, conta_id=receita.id, mes=1, valor=Decimal("200")),
        Lancamento(orcamento_id=o2.id, conta_id=custo.id, mes=1, valor=Decimal("80")),
    ])
    db.commit()

    res = calcular_consolidado(db, ano=2026, empreendimento_ids=[e1.id, e2.id])
    # Entrada = 100+200=300, Saída = 30+80=110 → 300−110 = 190
    assert res.total_geral == Decimal("190.00")


def test_node_inclui_tipo_orcamentario(
    db: Session, plano_contas_basico, orcamento_sopra
):
    """A árvore retornada propaga o campo `tipo_orcamentario` até o frontend."""
    grade = calcular_grade(db, orcamento_sopra.id)

    def find(nodes, codigo):
        for n in nodes:
            if n.codigo == codigo:
                return n
            r = find(n.filhas, codigo)
            if r:
                return r

    assert find(grade.arvore, "1").tipo_orcamentario == "entrada"
    assert find(grade.arvore, "2").tipo_orcamentario == "saida"
