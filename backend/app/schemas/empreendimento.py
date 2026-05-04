from pydantic import BaseModel, ConfigDict


class EmpreendimentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    codigo: str
    nome: str
    ativo: bool
