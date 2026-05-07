from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

TipoConta = Literal["receita", "custo", "despesa", "investimento", "financeiro"]
NaturezaConta = Literal["sintetica", "analitica"]
TipoOrcamentario = Literal["entrada", "saida"]


class ContaBase(BaseModel):
    nome: str = Field(min_length=1, max_length=200)
    tipo: TipoConta
    natureza: NaturezaConta


class ContaCreate(ContaBase):
    parent_id: int | None = None
    ordem: int | None = None
    # Se omitido, gera automático como `parent.codigo + "." + ordem`.
    # Se preenchido, deve casar com o pai (ex: filha de "1.01" começa com "1.01.").
    codigo: str | None = Field(default=None, max_length=50)
    # Aplicado só em raízes (parent_id NULL). Default 'saida' se não passar.
    tipo_orcamentario: TipoOrcamentario | None = None


class ContaUpdate(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=200)
    tipo: TipoConta | None = None
    natureza: NaturezaConta | None = None
    ordem: int | None = None
    ativo: bool | None = None
    # Mudar código pode mover a conta entre pais e dispara cascade nas filhas.
    codigo: str | None = Field(default=None, max_length=50)
    tipo_orcamentario: TipoOrcamentario | None = None


class ContaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    codigo: str
    nome: str
    parent_id: int | None
    nivel: int
    tipo: TipoConta
    natureza: NaturezaConta
    tipo_orcamentario: TipoOrcamentario
    ordem: int
    ativo: bool


class ContaTreeNode(ContaOut):
    filhas: list["ContaTreeNode"] = []


class ContaReorderItem(BaseModel):
    id: int
    ordem: int


class ContaReorderRequest(BaseModel):
    items: list[ContaReorderItem]
