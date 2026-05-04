from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.orcamento import (
    GradeResponse,
    OrcamentoCreate,
    OrcamentoOut,
    OrcamentoUpdate,
)
from app.services import grade as grade_service
from app.services import orcamento as orcamento_service
from app.services.grade import GradeError
from app.services.orcamento import OrcamentoError

router = APIRouter(prefix="/api/orcamento", tags=["orcamento"])


@router.get("", response_model=OrcamentoOut)
def buscar(
    empreendimento_id: int,
    ano: int,
    versao: int | None = None,
    db: Session = Depends(get_db),
) -> OrcamentoOut:
    orc = orcamento_service.buscar(db, empreendimento_id, ano, versao)
    if orc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Orçamento não encontrado.",
        )
    return OrcamentoOut.model_validate(orc)


@router.post("", response_model=OrcamentoOut, status_code=status.HTTP_201_CREATED)
def criar(data: OrcamentoCreate, db: Session = Depends(get_db)) -> OrcamentoOut:
    try:
        orc = orcamento_service.criar(db, data)
    except OrcamentoError as exc:
        msg = str(exc)
        code = (
            status.HTTP_404_NOT_FOUND
            if "não encontrado" in msg
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=code, detail=msg)
    return OrcamentoOut.model_validate(orc)


@router.put("/{orcamento_id}", response_model=OrcamentoOut)
def atualizar(
    orcamento_id: int, data: OrcamentoUpdate, db: Session = Depends(get_db)
) -> OrcamentoOut:
    try:
        orc = orcamento_service.atualizar_status(db, orcamento_id, data)
    except OrcamentoError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return OrcamentoOut.model_validate(orc)


@router.get("/{orcamento_id}/grade", response_model=GradeResponse)
def grade(orcamento_id: int, db: Session = Depends(get_db)) -> GradeResponse:
    try:
        return grade_service.calcular_grade(db, orcamento_id)
    except GradeError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
