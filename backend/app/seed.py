"""Popula o banco com Sopra + plano de contas inicial (3 níveis, ~15 contas).

Uso:
    python -m app.seed
"""
from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.models import Conta, Empreendimento, Orcamento

SEED_EMPREENDIMENTO = {"codigo": "SOPRA", "nome": "Sopra Incorporadora"}
SEED_ANO = 2026

# Estrutura: (codigo, nome, tipo, natureza, [filhas])
PLANO_CONTAS: list[tuple] = [
    (
        "1", "Receita", "receita", "sintetica",
        [
            (
                "1.1", "Vendas de Unidades", "receita", "sintetica",
                [
                    ("1.1.1", "Unidades Residenciais", "receita", "analitica", []),
                    ("1.1.2", "Unidades Comerciais", "receita", "analitica", []),
                ],
            ),
        ],
    ),
    (
        "2", "Custo de Obra", "custo", "sintetica",
        [
            (
                "2.1", "Materiais", "custo", "sintetica",
                [
                    ("2.1.1", "Estrutura", "custo", "analitica", []),
                    ("2.1.2", "Acabamento", "custo", "analitica", []),
                ],
            ),
            (
                "2.2", "Mão de Obra", "custo", "sintetica",
                [
                    ("2.2.1", "Direta", "custo", "analitica", []),
                    ("2.2.2", "Encargos", "custo", "analitica", []),
                ],
            ),
        ],
    ),
    (
        "3", "Despesa", "despesa", "sintetica",
        [
            (
                "3.1", "Administrativa", "despesa", "sintetica",
                [
                    ("3.1.1", "Pessoal Adm", "despesa", "analitica", []),
                    ("3.1.2", "Escritório", "despesa", "analitica", []),
                ],
            ),
            (
                "3.2", "Comercial", "despesa", "sintetica",
                [
                    ("3.2.1", "Marketing", "despesa", "analitica", []),
                ],
            ),
        ],
    ),
    (
        "4", "Investimento", "investimento", "sintetica",
        [
            (
                "4.1", "Terreno", "investimento", "sintetica",
                [
                    ("4.1.1", "Aquisição", "investimento", "analitica", []),
                ],
            ),
        ],
    ),
    (
        "5", "Financeiro", "financeiro", "sintetica",
        [
            (
                "5.1", "Receitas Financeiras", "financeiro", "sintetica",
                [
                    ("5.1.1", "Aplicações", "financeiro", "analitica", []),
                ],
            ),
        ],
    ),
]


def _criar_subarvore(db, raizes, parent_id: int | None, nivel: int) -> None:
    for ordem, (codigo, nome, tipo, natureza, filhas) in enumerate(raizes, start=1):
        conta = Conta(
            codigo=codigo,
            nome=nome,
            parent_id=parent_id,
            nivel=nivel,
            tipo=tipo,
            natureza=natureza,
            ordem=ordem,
            ativo=True,
        )
        db.add(conta)
        db.flush()
        if filhas:
            _criar_subarvore(db, filhas, conta.id, nivel + 1)


def seed() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        emp = db.execute(
            select(Empreendimento).where(Empreendimento.codigo == SEED_EMPREENDIMENTO["codigo"])
        ).scalar_one_or_none()
        if emp is None:
            emp = Empreendimento(**SEED_EMPREENDIMENTO, ativo=True)
            db.add(emp)
            db.flush()
            print(f"Empreendimento criado: {emp.codigo} - {emp.nome}")
        else:
            print(f"Empreendimento já existia: {emp.codigo} - {emp.nome}")

        existing = db.execute(select(Conta).limit(1)).scalar_one_or_none()
        if existing is None:
            _criar_subarvore(db, PLANO_CONTAS, parent_id=None, nivel=1)
            db.commit()
            total = db.execute(select(Conta)).scalars().all()
            print(f"Plano de contas criado: {len(total)} contas.")
        else:
            print("Plano de contas já populado.")

        orc = db.execute(
            select(Orcamento).where(
                Orcamento.empreendimento_id == emp.id,
                Orcamento.ano == SEED_ANO,
                Orcamento.versao == 1,
            )
        ).scalar_one_or_none()
        if orc is None:
            db.add(
                Orcamento(empreendimento_id=emp.id, ano=SEED_ANO, versao=1, status="rascunho")
            )
            db.commit()
            print(f"Orçamento default criado: {emp.codigo} / {SEED_ANO} / v1.")
        else:
            print(f"Orçamento default já existia: {emp.codigo} / {SEED_ANO} / v1.")


if __name__ == "__main__":
    seed()
