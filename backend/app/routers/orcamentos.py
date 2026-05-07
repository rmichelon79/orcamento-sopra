from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Empreendimento, Orcamento
from app.schemas.orcamento import (
    GradeConsolidadaResponse,
    GradeResponse,
    OrcamentoCreate,
    OrcamentoOut,
    OrcamentoUpdate,
    VersaoOrcamento,
)
from app.services import export as export_service
from app.services import grade as grade_service
from app.services import orcamento as orcamento_service
from app.services.grade import GradeError
from app.services.orcamento import OrcamentoError

XLSX_MEDIA = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)

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


@router.post(
    "/{orcamento_id}/clonar",
    response_model=OrcamentoOut,
    status_code=status.HTTP_201_CREATED,
)
def clonar(orcamento_id: int, db: Session = Depends(get_db)) -> OrcamentoOut:
    """Clona o orçamento (e seus lançamentos) em uma nova versão (rascunho)."""
    try:
        novo = orcamento_service.clonar(db, orcamento_id)
    except OrcamentoError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return OrcamentoOut.model_validate(novo)


@router.get("/{orcamento_id}/grade", response_model=GradeResponse)
def grade(orcamento_id: int, db: Session = Depends(get_db)) -> GradeResponse:
    try:
        return grade_service.calcular_grade(db, orcamento_id)
    except GradeError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/consolidado", response_model=GradeConsolidadaResponse)
def consolidado(
    ano: int,
    empreendimento_ids: list[int] | None = Query(default=None),
    db: Session = Depends(get_db),
) -> GradeConsolidadaResponse:
    """Consolida vários empreendimentos em uma só grade somando os lançamentos.

    Se `empreendimento_ids` for omitido, soma todos os ativos.
    Para cada empreendimento usa a versão mais recente do ano.
    """
    try:
        return grade_service.calcular_consolidado(db, ano, empreendimento_ids)
    except GradeError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/versoes", response_model=list[VersaoOrcamento])
def versoes(
    empreendimento_id: int, ano: int, db: Session = Depends(get_db)
) -> list[VersaoOrcamento]:
    """Lista todas as versões de orçamento para (empreendimento, ano)."""
    rows = db.execute(
        select(Orcamento)
        .where(
            Orcamento.empreendimento_id == empreendimento_id,
            Orcamento.ano == ano,
        )
        .order_by(Orcamento.versao.asc())
    ).scalars().all()
    return [VersaoOrcamento.model_validate(o) for o in rows]


# IMPORTANTE: rota /consolidado/export.xlsx vem ANTES da {orcamento_id}/export.xlsx
# pra FastAPI não tentar parsear "consolidado" como int.
@router.get("/consolidado/export.xlsx", responses={200: {"content": {XLSX_MEDIA: {}}}})
def export_consolidado(
    ano: int,
    empreendimento_ids: list[int] | None = Query(default=None),
    db: Session = Depends(get_db),
) -> Response:
    """Exporta o consolidado em XLSX."""
    try:
        grade = grade_service.calcular_consolidado(db, ano, empreendimento_ids)
    except GradeError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    emps = {
        e.id: e
        for e in db.execute(
            select(Empreendimento).where(
                Empreendimento.id.in_(grade.empreendimentos_incluidos)
            )
        ).scalars()
    }
    codigos = [emps[i].codigo for i in grade.empreendimentos_incluidos if i in emps]
    payload = export_service.gerar_xlsx_consolidado(grade, codigos)
    filename = f"orcamento-consolidado-{ano}.xlsx"
    return Response(
        content=payload,
        media_type=XLSX_MEDIA,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{orcamento_id}/export.xlsx", responses={200: {"content": {XLSX_MEDIA: {}}}})
def export_individual(orcamento_id: int, db: Session = Depends(get_db)) -> Response:
    """Exporta o orçamento individual em XLSX."""
    try:
        grade = grade_service.calcular_grade(db, orcamento_id)
    except GradeError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    emp = db.get(Empreendimento, grade.orcamento.empreendimento_id)
    assert emp is not None
    payload = export_service.gerar_xlsx_individual(grade, emp.codigo, emp.nome)
    filename = f"orcamento-{emp.codigo}-{grade.orcamento.ano}-v{grade.orcamento.versao}.xlsx"
    return Response(
        content=payload,
        media_type=XLSX_MEDIA,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
