import re
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Conta, Lancamento
from app.schemas.conta import ContaCreate, ContaTreeNode, ContaUpdate

NIVEL_MAX = 5

_CODIGO_RE = re.compile(r"^\d+(?:\.\d+)*$")


class ContaError(Exception):
    """Erro de regra de negócio em operações de Conta."""


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _proxima_ordem(db: Session, parent_id: int | None) -> int:
    stmt = select(func.coalesce(func.max(Conta.ordem), 0)).where(
        Conta.parent_id.is_(parent_id) if parent_id is None else Conta.parent_id == parent_id
    )
    return int(db.execute(stmt).scalar_one()) + 1


def _gerar_codigo(parent: Conta | None, ordem: int) -> str:
    if parent is None:
        return str(ordem)
    return f"{parent.codigo}.{ordem}"


def _validar_formato_codigo(codigo: str) -> None:
    if not _CODIGO_RE.match(codigo):
        raise ContaError(
            f"Formato de código inválido: '{codigo}'. "
            "Use só dígitos separados por pontos (ex: 2.30.01)."
        )


def _ordem_natural(codigo: str) -> tuple[int, ...]:
    """`'2.30.09.04'` → `(2, 30, 9, 4)` para ordenação correta."""
    return tuple(int(p) for p in codigo.split("."))


def _resolver_parent_pelo_codigo(
    db: Session, codigo: str, ignorar_id: int | None = None
) -> tuple[Conta | None, int]:
    """Dado um código, retorna (parent, nivel). Levanta ContaError em caso inválido."""
    partes = codigo.split(".")
    nivel = len(partes)
    if nivel > NIVEL_MAX:
        raise ContaError(
            f"Código '{codigo}' tem {nivel} níveis; máximo permitido é {NIVEL_MAX}."
        )
    if nivel == 1:
        return None, 1
    parent_codigo = ".".join(partes[:-1])
    parent = db.execute(
        select(Conta).where(Conta.codigo == parent_codigo)
    ).scalar_one_or_none()
    if parent is None:
        raise ContaError(f"Conta pai '{parent_codigo}' não encontrada.")
    if parent.natureza == "analitica":
        raise ContaError(
            f"Conta pai '{parent_codigo}' é analítica e não aceita filhas."
        )
    if ignorar_id is not None and parent.id == ignorar_id:
        raise ContaError("Conta não pode ser pai dela mesma.")
    return parent, nivel


def _coletar_descendentes(db: Session, raiz_id: int) -> list[Conta]:
    """Retorna a conta raiz + todos os descendentes (BFS)."""
    resultado: list[Conta] = []
    fila = [raiz_id]
    while fila:
        ids_atuais = fila
        contas = db.execute(
            select(Conta).where(Conta.id.in_(ids_atuais))
        ).scalars().all()
        resultado.extend(contas)
        fila = [c.id for c in contas]
        # próximo nível
        proximos = db.execute(
            select(Conta).where(Conta.parent_id.in_(fila))
        ).scalars().all()
        fila = [c.id for c in proximos]
    return resultado


def _conta_tem_lancamentos(db: Session, conta_id: int) -> bool:
    stmt = select(func.count(Lancamento.id)).where(Lancamento.conta_id == conta_id)
    return int(db.execute(stmt).scalar_one()) > 0


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


# ─────────────────────────────────────────────────────────────────────────────
# Listar (árvore ordenada por código natural)
# ─────────────────────────────────────────────────────────────────────────────

def listar_arvore(db: Session) -> list[ContaTreeNode]:
    contas = list(db.execute(select(Conta)).scalars().all())

    by_id: dict[int, ContaTreeNode] = {c.id: _to_tree_node(c) for c in contas}
    raizes: list[ContaTreeNode] = []
    for c in contas:
        node = by_id[c.id]
        if c.parent_id is None:
            raizes.append(node)
        else:
            by_id[c.parent_id].filhas.append(node)

    def _ordenar(nodes: list[ContaTreeNode]) -> None:
        nodes.sort(key=lambda n: _ordem_natural(n.codigo))
        for n in nodes:
            _ordenar(n.filhas)

    _ordenar(raizes)
    return raizes


# ─────────────────────────────────────────────────────────────────────────────
# Criar
# ─────────────────────────────────────────────────────────────────────────────

def criar_conta(db: Session, data: ContaCreate) -> Conta:
    parent: Conta | None = None
    nivel = 1

    # Caminho 1: código foi fornecido pelo usuário
    if data.codigo:
        _validar_formato_codigo(data.codigo)
        parent, nivel = _resolver_parent_pelo_codigo(db, data.codigo)
        # parent_id no payload, se vier, deve bater
        if data.parent_id is not None and (
            (parent is None and data.parent_id is not None)
            or (parent is not None and parent.id != data.parent_id)
        ):
            raise ContaError(
                "parent_id do payload não bate com o pai derivado do código."
            )
        codigo = data.codigo
    # Caminho 2: auto-gera baseado em parent_id + ordem
    else:
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
                    "Conta analítica não pode ter filhas."
                )
            nivel = parent.nivel + 1
        ordem = data.ordem if data.ordem is not None else _proxima_ordem(db, data.parent_id)
        codigo = _gerar_codigo(parent, ordem)

    if db.execute(select(Conta).where(Conta.codigo == codigo)).scalar_one_or_none():
        raise ContaError(f"Já existe uma conta com o código {codigo}.")

    ordem = data.ordem if data.ordem is not None else _proxima_ordem(
        db, parent.id if parent else None
    )

    conta = Conta(
        codigo=codigo,
        nome=data.nome,
        parent_id=parent.id if parent else None,
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


# ─────────────────────────────────────────────────────────────────────────────
# Atualizar (com mudança de código + cascade + move-parent)
# ─────────────────────────────────────────────────────────────────────────────

def _aplicar_mudanca_codigo(db: Session, conta: Conta, novo_codigo: str) -> None:
    """Renomeia o código da conta e faz cascade nas filhas. Move entre pais se necessário."""
    _validar_formato_codigo(novo_codigo)
    if novo_codigo == conta.codigo:
        return  # nada a fazer

    novo_parent, novo_nivel = _resolver_parent_pelo_codigo(
        db, novo_codigo, ignorar_id=conta.id
    )

    # Detectar ciclo: novo pai não pode ser descendente da conta atual.
    if novo_parent is not None:
        ancestral = novo_parent
        while ancestral is not None:
            if ancestral.id == conta.id:
                raise ContaError(
                    f"Ciclo: '{novo_codigo}' colocaria a conta como ancestral dela mesma."
                )
            ancestral = (
                db.get(Conta, ancestral.parent_id)
                if ancestral.parent_id is not None
                else None
            )

    # Coleta descendentes (incl. self) e calcula novos códigos
    antigo_codigo = conta.codigo
    descendentes = _coletar_descendentes(db, conta.id)
    novos_codigos: dict[int, str] = {}
    for d in descendentes:
        if d.id == conta.id:
            novos_codigos[d.id] = novo_codigo
        else:
            # d.codigo começa com antigo_codigo + "."
            sufixo = d.codigo[len(antigo_codigo):]
            novos_codigos[d.id] = novo_codigo + sufixo

    # Verifica se algum dos novos códigos colide com conta fora do grupo
    ids_em_movimento = set(novos_codigos.keys())
    for nc in novos_codigos.values():
        existente = db.execute(
            select(Conta).where(Conta.codigo == nc, ~Conta.id.in_(ids_em_movimento))
        ).scalar_one_or_none()
        if existente is not None:
            raise ContaError(
                f"Código '{nc}' já existe em outra conta (id={existente.id})."
            )

    # Verifica nível máximo no destino (incluindo descendentes)
    for nc in novos_codigos.values():
        n = nc.count(".") + 1
        if n > NIVEL_MAX:
            raise ContaError(
                f"Código '{nc}' excede o limite de {NIVEL_MAX} níveis."
            )

    # Aplica em duas fases pra contornar UNIQUE constraint do SQLite.
    tmp_prefix = f"__tmp_{uuid.uuid4().hex[:8]}__"
    for d in descendentes:
        d.codigo = tmp_prefix + d.codigo
    db.flush()

    # Mapa por id (a sessão tem os objetos carregados)
    descendentes_by_id = {d.id: d for d in descendentes}

    for d_id, nc in novos_codigos.items():
        d = descendentes_by_id[d_id]
        d.codigo = nc
        d.nivel = nc.count(".") + 1
        if d.id == conta.id:
            d.parent_id = novo_parent.id if novo_parent else None

    # Flush pra que SELECT por código novo na próxima passada veja os updates
    db.flush()

    # Segunda passada: atualizar parent_id das filhas (pode ter mudado se houve move-parent)
    for d in descendentes:
        if d.id == conta.id:
            continue
        partes = d.codigo.split(".")
        parent_codigo = ".".join(partes[:-1])
        parent_obj = db.execute(
            select(Conta).where(Conta.codigo == parent_codigo)
        ).scalar_one()
        d.parent_id = parent_obj.id


def atualizar_conta(db: Session, conta_id: int, data: ContaUpdate) -> Conta:
    conta = db.get(Conta, conta_id)
    if conta is None:
        raise ContaError("Conta não encontrada.")

    # 1. Mudança de natureza (validações antes de tocar o resto)
    if data.natureza is not None and data.natureza != conta.natureza:
        if data.natureza == "sintetica":
            if _conta_tem_lancamentos(db, conta.id):
                raise ContaError(
                    "Não é possível converter para sintética: a conta já possui lançamentos."
                )
        else:
            if conta.filhas:
                raise ContaError(
                    "Não é possível converter para analítica: a conta possui filhas."
                )
        conta.natureza = data.natureza

    # 2. Mudança de código (potencialmente cascade + move-parent)
    if data.codigo is not None:
        _aplicar_mudanca_codigo(db, conta, data.codigo.strip())

    # 3. Demais campos
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


# ─────────────────────────────────────────────────────────────────────────────
# Excluir / Reordenar
# ─────────────────────────────────────────────────────────────────────────────

def excluir_conta(db: Session, conta_id: int) -> None:
    conta = db.get(Conta, conta_id)
    if conta is None:
        raise ContaError("Conta não encontrada.")
    if conta.filhas:
        raise ContaError("Não é possível excluir: a conta possui filhas.")
    if _conta_tem_lancamentos(db, conta.id):
        raise ContaError("Não é possível excluir: a conta possui lançamentos.")
    db.delete(conta)
    db.commit()


def reordenar(db: Session, items: list[tuple[int, int]]) -> None:
    for conta_id, ordem in items:
        conta = db.get(Conta, conta_id)
        if conta is None:
            raise ContaError(f"Conta {conta_id} não encontrada.")
        conta.ordem = ordem
    db.commit()
