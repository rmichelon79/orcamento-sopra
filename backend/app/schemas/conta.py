from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

TipoConta = Literal["receita", "custo", "despesa", "investimento", "financeiro"]
NaturezaConta = Literal["sintetica", "analitica"]


class ContaBase(BaseModel):
    nome: str = Field(min_length=1, max_length=200)
    tipo: TipoConta
    natureza: NaturezaConta


class ContaCreate(ContaBase):
    parent_id: int | None = None
    ordem: int | None = None


class ContaUpdate(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=200)
    tipo: TipoConta | None = None
    natureza: NaturezaConta | None = None
    ordem: int | None = None
    ativo: bool | None = None


class ContaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    codigo: str
    nome: str
    parent_id: int | None
    nivel: int
    tipo: TipoConta
    natureza: NaturezaConta
    ordem: int
    ativo: bool


class ContaTreeNode(ContaOut):
    filhas: list["ContaTreeNode"] = []


class ContaReorderItem(BaseModel):
    id: int
    ordem: int


class ContaReorderRequest(BaseModel):
    items: list[ContaReorderItem]
