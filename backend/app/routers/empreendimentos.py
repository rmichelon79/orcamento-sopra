from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.empreendimento import (
    EmpreendimentoCreate,
    EmpreendimentoOut,
    EmpreendimentoUpdate,
)
from app.services import empreendimento as emp_service
from app.services.empreendimento import EmpreendimentoError

router = APIRouter(prefix="/api/empreendimento", tags=["empreendimento"])


@router.get("", response_model=list[EmpreendimentoOut])
def listar(
    ativos: bool | None = None, db: Session = Depends(get_db)
) -> list[EmpreendimentoOut]:
    return [EmpreendimentoOut.model_validate(e) for e in emp_service.listar(db, ativos)]


@router.get("/{empreendimento_id}", response_model=EmpreendimentoOut)
def detalhar(
    empreendimento_id: int, db: Session = Depends(get_db)
) -> EmpreendimentoOut:
    from app.models import Empreendimento

    emp = db.get(Empreendimento, empreendimento_id)
    if emp is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empreendimento não encontrado.",
        )
    return EmpreendimentoOut.model_validate(emp)


@router.post("", response_model=EmpreendimentoOut, status_code=status.HTTP_201_CREATED)
def criar(
    data: EmpreendimentoCreate, db: Session = Depends(get_db)
) -> EmpreendimentoOut:
    try:
        emp = emp_service.criar(db, data)
    except EmpreendimentoError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return EmpreendimentoOut.model_validate(emp)


@router.put("/{empreendimento_id}", response_model=EmpreendimentoOut)
def atualizar(
    empreendimento_id: int,
    data: EmpreendimentoUpdate,
    db: Session = Depends(get_db),
) -> EmpreendimentoOut:
    try:
        emp = emp_service.atualizar(db, empreendimento_id, data)
    except EmpreendimentoError as exc:
        msg = str(exc)
        code = (
            status.HTTP_404_NOT_FOUND
            if "não encontrado" in msg
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=code, detail=msg)
    return EmpreendimentoOut.model_validate(emp)


@router.delete("/{empreendimento_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir(empreendimento_id: int, db: Session = Depends(get_db)) -> None:
    try:
        emp_service.excluir(db, empreendimento_id)
    except EmpreendimentoError as exc:
        msg = str(exc)
        code = (
            status.HTTP_404_NOT_FOUND
            if "não encontrado" in msg
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=code, detail=msg)
