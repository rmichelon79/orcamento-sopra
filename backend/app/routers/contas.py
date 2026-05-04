from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.conta import (
    ContaCreate,
    ContaOut,
    ContaReorderRequest,
    ContaTreeNode,
    ContaUpdate,
)
from app.services import contas as contas_service
from app.services.contas import ContaError

router = APIRouter(prefix="/api/contas", tags=["contas"])


@router.get("", response_model=list[ContaTreeNode])
def listar_arvore(db: Session = Depends(get_db)) -> list[ContaTreeNode]:
    return contas_service.listar_arvore(db)


@router.post("", response_model=ContaOut, status_code=status.HTTP_201_CREATED)
def criar(data: ContaCreate, db: Session = Depends(get_db)) -> ContaOut:
    try:
        conta = contas_service.criar_conta(db, data)
    except ContaError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return ContaOut.model_validate(conta)


@router.post("/reorder", status_code=status.HTTP_204_NO_CONTENT)
def reordenar(req: ContaReorderRequest, db: Session = Depends(get_db)) -> None:
    try:
        contas_service.reordenar(db, [(i.id, i.ordem) for i in req.items])
    except ContaError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.put("/{conta_id}", response_model=ContaOut)
def atualizar(
    conta_id: int, data: ContaUpdate, db: Session = Depends(get_db)
) -> ContaOut:
    try:
        conta = contas_service.atualizar_conta(db, conta_id, data)
    except ContaError as exc:
        msg = str(exc)
        code = (
            status.HTTP_404_NOT_FOUND
            if "não encontrada" in msg
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=code, detail=msg)
    return ContaOut.model_validate(conta)


@router.delete("/{conta_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir(conta_id: int, db: Session = Depends(get_db)) -> None:
    try:
        contas_service.excluir_conta(db, conta_id)
    except ContaError as exc:
        msg = str(exc)
        code = (
            status.HTTP_404_NOT_FOUND
            if "não encontrada" in msg
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=code, detail=msg)
