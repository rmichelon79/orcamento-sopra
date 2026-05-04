"""Popula o banco com 4 empreendimentos da Sopra + plano de contas + orçamento 2026.

Uso:
    python -m app.seed

Idempotente: empreendimentos / contas / orçamentos só são criados se ainda não existem.
"""
from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.models import Conta, Empreendimento, Orcamento

SEED_ANO = 2026

SEED_EMPREENDIMENTOS = [
    {"codigo": "ALTANA", "nome": "Altana"},
    {"codigo": "ARIA", "nome": "Aria"},
    {"codigo": "BORORO", "nome": "Bororo"},
    {"codigo": "SOPRA", "nome": "Sopra Incorporadora"},
]

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
        # 1) Empreendimentos
        criados_emp: list[Empreendimento] = []
        for emp_data in SEED_EMPREENDIMENTOS:
            existente = db.execute(
                select(Empreendimento).where(Empreendimento.codigo == emp_data["codigo"])
            ).scalar_one_or_none()
            if existente is None:
                novo = Empreendimento(**emp_data, ativo=True)
                db.add(novo)
                db.flush()
                criados_emp.append(novo)
            else:
                criados_emp.append(existente)
        db.commit()
        print(f"Empreendimentos: {len(criados_emp)} ({', '.join(e.codigo for e in criados_emp)}).")

        # 2) Plano de contas (compartilhado)
        existing = db.execute(select(Conta).limit(1)).scalar_one_or_none()
        if existing is None:
            _criar_subarvore(db, PLANO_CONTAS, parent_id=None, nivel=1)
            db.commit()
            total = db.execute(select(Conta)).scalars().all()
            print(f"Plano de contas criado: {len(total)} contas.")
        else:
            total = db.execute(select(Conta)).scalars().all()
            print(f"Plano de contas já populado: {len(total)} contas.")

        # 3) Orçamento default por empreendimento (ano = SEED_ANO, versao = 1)
        criados_orc = 0
        for emp in criados_emp:
            existente = db.execute(
                select(Orcamento).where(
                    Orcamento.empreendimento_id == emp.id,
                    Orcamento.ano == SEED_ANO,
                    Orcamento.versao == 1,
                )
            ).scalar_one_or_none()
            if existente is None:
                db.add(
                    Orcamento(
                        empreendimento_id=emp.id,
                        ano=SEED_ANO,
                        versao=1,
                        status="rascunho",
                    )
                )
                criados_orc += 1
        db.commit()
        print(
            f"Orçamentos {SEED_ANO}/v1: criados {criados_orc} / "
            f"{len(criados_emp) - criados_orc} já existiam."
        )


if __name__ == "__main__":
    seed()
