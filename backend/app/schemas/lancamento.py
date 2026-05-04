from decimal import Decimal

from pydantic import BaseModel, Field


class LancamentoBulkItem(BaseModel):
    conta_id: int
    mes: int = Field(ge=1, le=12)
    valor: Decimal


class LancamentoBulkRequest(BaseModel):
    orcamento_id: int
    items: list[LancamentoBulkItem]


class LancamentoBulkResponse(BaseModel):
    atualizados: int
    criados: int
    removidos: int
