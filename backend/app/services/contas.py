from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Conta, Lancamento
from app.schemas.conta import ContaCreate, ContaTreeNode, ContaUpdate

NIVEL_MAX = 5


class ContaError(Exception):
    """Erro de regra de negócio em operações de Conta."""


def _proxima_ordem(db: Session, parent_id: int | None) -> int:
    stmt = select(func.coalesce(func.max(Conta.ordem), 0)).where(
        Conta.parent_id.is_(parent_id) if parent_id is None else Conta.parent_id == parent_id
    )
    return int(db.execute(stmt).scalar_one()) + 1


def _gerar_codigo(parent: Conta | None, ordem: int) -> str:
    if parent is None:
        return str(ordem)
    return f"{parent.codigo}.{ordem}"


def _to_tree_node(c: Conta) -> ContaTreeNode:
    return ContaTreeNode(
        id=c.id,
        codigo=c.codigo,
        nome=c.nome,
        parent_id=c.parent_id,
        nivel=c.nivel,
        tipo=c.tipo,
        natureza=c.natureza,
        ordem=c.ordem,
        ativo=c.ativo,
        filhas=[],
    )


def listar_arvore(db: Session) -> list[ContaTreeNode]:
    contas = db.execute(select(Conta).order_by(Conta.ordem)).scalars().all()

    by_id: dict[int, ContaTreeNode] = {c.id: _to_tree_node(c) for c in contas}
    raizes: list[ContaTreeNode] = []
    for c in contas:
        node = by_id[c.id]
        if c.parent_id is None:
            raizes.append(node)
        else:
            by_id[c.parent_id].filhas.append(node)

    def _ordenar(nodes: list[ContaTreeNode]) -> None:
        nodes.sort(key=lambda n: n.ordem)
        for n in nodes:
            _ordenar(n.filhas)

    _ordenar(raizes)
    return raizes


def criar_conta(db: Session, data: ContaCreate) -> Conta:
    parent: Conta | None = None
    nivel = 1

    if data.parent_id is not None:
        parent = db.get(Conta, data.parent_id)
        if parent is None:
            raise ContaError("Conta pai não encontrada.")
        if parent.nivel >= NIVEL_MAX:
            raise ContaError(
                f"Conta pai já está no nível {NIVEL_MAX}; não aceita filhas."
            )
        if parent.natureza == "analitica":
            raise ContaError(
                "Conta analítica não pode ter filhas. "
                "Converta-a para sintética antes de criar filhas."
            )
        nivel = parent.nivel + 1

    ordem = data.ordem if data.ordem is not None else _proxima_ordem(db, data.parent_id)
    codigo = _gerar_codigo(parent, ordem)

    if db.execute(select(Conta).where(Conta.codigo == codigo)).scalar_one_or_none():
        raise ContaError(f"Já existe uma conta com o código {codigo}.")

    conta = Conta(
        codigo=codigo,
        nome=data.nome,
        parent_id=data.parent_id,
        nivel=nivel,
        tipo=data.tipo,
        natureza=data.natureza,
        ordem=ordem,
        ativo=True,
    )
    db.add(conta)
    db.commit()
    db.refresh(conta)
    return conta


def _conta_tem_lancamentos(db: Session, conta_id: int) -> bool:
    stmt = select(func.count(Lancamento.id)).where(Lancamento.conta_id == conta_id)
    return int(db.execute(stmt).scalar_one()) > 0


def atualizar_conta(db: Session, conta_id: int, data: ContaUpdate) -> Conta:
    conta = db.get(Conta, conta_id)
    if conta is None:
        raise ContaError("Conta não encontrada.")

    if data.natureza is not None and data.natureza != conta.natureza:
        if data.natureza == "sintetica":
            if _conta_tem_lancamentos(db, conta.id):
                raise ContaError(
                    "Não é possível converter para sintética: "
                    "a conta já possui lançamentos."
                )
        else:
            if conta.filhas:
                raise ContaError(
                    "Não é possível converter para analítica: "
                    "a conta possui filhas."
                )
        conta.natureza = data.natureza

    if data.nome is not None:
        conta.nome = data.nome
    if data.tipo is not None:
        conta.tipo = data.tipo
    if data.ordem is not None:
        conta.ordem = data.ordem
    if data.ativo is not None:
        conta.ativo = data.ativo

    db.commit()
    db.refresh(conta)
    return conta


def excluir_conta(db: Session, conta_id: int) -> None:
    conta = db.get(Conta, conta_id)
    if conta is None:
        raise ContaError("Conta não encontrada.")
    if conta.filhas:
        raise ContaError("Não é possível excluir: a conta possui filhas.")
    if _conta_tem_lancamentos(db, conta.id):
        raise ContaError(
            "Não é possível excluir: a conta possui lançamentos."
        )
    db.delete(conta)
    db.commit()


def reordenar(db: Session, items: list[tuple[int, int]]) -> None:
    for conta_id, ordem in items:
        conta = db.get(Conta, conta_id)
        if conta is None:
            raise ContaError(f"Conta {conta_id} não encontrada.")
        conta.ordem = ordem
    db.commit()
