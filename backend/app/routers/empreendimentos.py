from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Empreendimento
from app.schemas.empreendimento import EmpreendimentoOut

router = APIRouter(prefix="/api/empreendimento", tags=["empreendimento"])


@router.get("", response_model=list[EmpreendimentoOut])
def listar(db: Session = Depends(get_db)) -> list[Empreendimento]:
    return list(
        db.execute(select(Empreendimento).order_by(Empreendimento.codigo))
        .scalars()
        .all()
    )


@router.get("/{empreendimento_id}", response_model=EmpreendimentoOut)
def detalhar(empreendimento_id: int, db: Session = Depends(get_db)) -> Empreendimento:
    emp = db.get(Empreendimento, empreendimento_id)
    if emp is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empreendimento não encontrado.",
        )
    return emp
