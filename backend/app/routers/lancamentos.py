from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.lancamento import LancamentoBulkRequest, LancamentoBulkResponse
from app.services import lancamentos as lancamentos_service
from app.services.lancamentos import LancamentoError

router = APIRouter(prefix="/api/lancamentos", tags=["lancamentos"])


@router.put("/bulk", response_model=LancamentoBulkResponse)
def bulk(
    req: LancamentoBulkRequest, db: Session = Depends(get_db)
) -> LancamentoBulkResponse:
    try:
        return lancamentos_service.bulk_upsert(db, req)
    except LancamentoError as exc:
        msg = str(exc)
        code = (
            status.HTTP_404_NOT_FOUND
            if "não encontrado" in msg or "não encontradas" in msg
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=code, detail=msg)
