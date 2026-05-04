from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

StatusOrcamento = Literal["rascunho", "aprovado", "arquivado"]


class OrcamentoCreate(BaseModel):
    empreendimento_id: int
    ano: int = Field(ge=1900, le=2999)
    versao: int = Field(default=1, ge=1)


class OrcamentoUpdate(BaseModel):
    status: StatusOrcamento


class OrcamentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    empreendimento_id: int
    ano: int
    versao: int
    status: StatusOrcamento
    criado_em: datetime


class GradeNode(BaseModel):
    id: int
    codigo: str
    nome: str
    parent_id: int | None
    nivel: int
    tipo: str
    natureza: Literal["sintetica", "analitica"]
    ordem: int
    ativo: bool
    valores: list[Decimal]
    total: Decimal
    filhas: list["GradeNode"] = []


class GradeResponse(BaseModel):
    orcamento: OrcamentoOut
    arvore: list[GradeNode]
    totais_mes: list[Decimal]
    total_geral: Decimal
