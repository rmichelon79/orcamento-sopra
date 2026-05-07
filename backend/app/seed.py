"""Popula o banco com 4 empreendimentos da Sopra + plano de contas Sienge.

Uso:
    python -m app.seed

Idempotente: empreendimentos / contas / orçamentos só são criados se ainda não existem.

Plano de contas: extraído do export oficial do Sienge/Starian (PDF de origem
em ../../plano-de-contas-sienge.pdf, fora do repo). 217 contas em até 4 níveis.

Convenção: contas redutoras (prefixo "(-)") aceitam valor negativo no lançamento.
Não há campo "redutora" no schema — o sinal do valor já carrega a semântica.
"""
from sqlalchemy import inspect, select, text

from app.database import Base, SessionLocal, engine
from app.models import Conta, Empreendimento, Orcamento

SEED_ANO = 2026

SEED_EMPREENDIMENTOS = [
    {"codigo": "ALTANA", "nome": "Altana"},
    {"codigo": "ARIA", "nome": "Aria"},
    {"codigo": "BORORO", "nome": "Bororo"},
    {"codigo": "SOPRA", "nome": "Sopra Incorporadora"},
]

# Lista plana: (codigo, nome, tipo, natureza). Hierarquia derivada do código.
# Contas com prefixo "(-)" são redutoras — usuário lança valor negativo.
PLANO_CONTAS_FLAT: list[tuple[str, str, str, str]] = [
    ("1", "ENTRADAS E RECEITAS", "receita", "sintetica"),
    ("1.01", "RECEITA DE UNIDADES IMOBILIÁRIAS", "receita", "sintetica"),
    ("1.01.01", "Receita de Incorporação de Imóveis", "receita", "analitica"),
    ("1.01.02", "Receita de Imóveis de Dação", "receita", "analitica"),
    ("1.01.94", "(-) ISS", "receita", "analitica"),
    ("1.01.95", "(-) COFINS", "receita", "analitica"),
    ("1.01.96", "(-) PIS", "receita", "analitica"),
    ("1.01.97", "(-) RET", "receita", "analitica"),
    ("1.01.98", "(-) Descontos Concedidos Incorporação", "receita", "analitica"),
    ("1.01.99", "(-) Cancelamento de Contrato de Venda", "receita", "analitica"),
    ("1.02", "RECEITA DE SERVIÇOS", "receita", "sintetica"),
    ("1.02.01", "Receita de Prestação de Serviços", "receita", "analitica"),
    ("1.02.99", "(-) Descontos Concedidos Serviços", "receita", "analitica"),
    ("1.05", "EMPRÉSTIMOS E FINANCIAMENTOS", "financeiro", "sintetica"),
    ("1.05.01", "Empréstimos", "financeiro", "analitica"),
    ("1.05.02", "Financiamentos", "financeiro", "analitica"),
    ("1.05.98", "(-) Amortização de Empréstimos", "financeiro", "analitica"),
    ("1.05.99", "(-) Amortização de Financiamentos", "financeiro", "analitica"),
    ("1.06", "RECEITA FINANCEIRA", "financeiro", "sintetica"),
    ("1.06.01", "Receita de Aplicações Financeiras", "financeiro", "analitica"),
    ("1.06.02", "Variação Monetária na Venda de Imóveis", "financeiro", "analitica"),
    ("1.06.03", "Juros Ativos", "financeiro", "analitica"),
    ("1.06.99", "(-) Anulação de Receitas Financeiras", "financeiro", "analitica"),
    ("1.07", "APORTES E RETIRADAS", "financeiro", "sintetica"),
    ("1.07.01", "Aportes", "financeiro", "analitica"),
    ("1.07.99", "(-) Retiradas de Distribuição", "financeiro", "analitica"),
    ("2", "SAÍDAS / CUSTOS  / DESPESAS", "despesa", "sintetica"),
    ("2.10", "CUSTOS DO TERRENO", "investimento", "sintetica"),
    ("2.10.01", "Aquisição do Terreno", "investimento", "analitica"),
    ("2.10.02", "Legalização do Terreno", "investimento", "analitica"),
    ("2.10.03", "Limpeza do Terreno", "investimento", "analitica"),
    ("2.10.04", "Segurança do Terreno", "investimento", "analitica"),
    ("2.10.05", "IPTU do Terreno", "investimento", "analitica"),
    ("2.10.06", "ITBI do Terreno", "investimento", "analitica"),
    ("2.10.07", "Outros Custos do Terreno", "investimento", "analitica"),
    ("2.10.90", "(-) Anulação de Custos do Terreno", "investimento", "analitica"),
    ("2.20", "CUSTOS DE INCORPORAÇÃO", "custo", "sintetica"),
    ("2.20.01", "EQUIPE DE INCORPORAÇÃO", "custo", "sintetica"),
    ("2.20.01.01", "Salarios", "custo", "analitica"),
    ("2.20.01.02", "Estagiários", "custo", "analitica"),
    ("2.20.01.03", "Transportes", "custo", "analitica"),
    ("2.20.01.04", "Alimentação", "custo", "analitica"),
    ("2.20.01.05", "INSS", "custo", "analitica"),
    ("2.20.01.06", "FGTS", "custo", "analitica"),
    ("2.20.01.07", "Capacitação e Treinamentos de Incorporação", "custo", "analitica"),
    ("2.20.01.08", "Exames Medicos e Consultas", "custo", "analitica"),
    ("2.20.01.09", "Planos de Saude", "custo", "analitica"),
    ("2.20.01.10", "Seguro de Vida", "custo", "analitica"),
    ("2.20.01.11", "Indenizações", "custo", "analitica"),
    ("2.20.01.12", "Equipe de Incorporação", "custo", "analitica"),
    ("2.20.02", "Consultorias e Projetos de Incorporação", "custo", "analitica"),
    ("2.20.03", "DESPESAS GERAIS DA INCORPORAÇÃO", "custo", "sintetica"),
    ("2.20.03.01", "Taxas, Registros e Cartórios da Incorporação", "custo", "analitica"),
    ("2.20.03.02", "Plotagens da Incorporação", "custo", "analitica"),
    ("2.20.03.03", "Softwares da Incorporação", "custo", "analitica"),
    ("2.20.03.04", "Seguros da Incorporação", "custo", "analitica"),
    ("2.20.03.05", "Material de Expediente da Incorporação", "custo", "analitica"),
    ("2.30", "CUSTOS DE OBRA", "custo", "sintetica"),
    ("2.30.01", "EQUIPE DE PRODUÇÃO INTERNA", "custo", "sintetica"),
    ("2.30.01.01", "Salarios", "custo", "analitica"),
    ("2.30.01.02", "Estagiarios da Obra", "custo", "analitica"),
    ("2.30.01.03", "Transportes", "custo", "analitica"),
    ("2.30.01.04", "Alimentação", "custo", "analitica"),
    ("2.30.01.05", "INSS", "custo", "analitica"),
    ("2.30.01.06", "FGTS", "custo", "analitica"),
    ("2.30.01.07", "Capacitação e Treinamentos da Obra", "custo", "analitica"),
    ("2.30.01.08", "Exames e Consultas Medicas", "custo", "analitica"),
    ("2.30.01.09", "Planos de Saude", "custo", "analitica"),
    ("2.30.01.10", "Seguro de Vida", "custo", "analitica"),
    ("2.30.01.11", "Indenizações", "custo", "analitica"),
    ("2.30.01.12", "Equipamentos de Proteção Individual", "custo", "analitica"),
    ("2.30.02", "Equipe de Produção Terceiros", "custo", "analitica"),
    ("2.30.03", "MATERIAIS", "custo", "sintetica"),
    ("2.30.03.01", "Materiais Aplicados na Obra", "custo", "analitica"),
    ("2.30.03.02", "Concretagem", "custo", "analitica"),
    ("2.30.03.03", "(-) Descontos de Materiais", "custo", "analitica"),
    ("2.30.03.04", "(-) Transferencia de Materiais", "custo", "analitica"),
    ("2.30.04", "EQUIPAMENTOS", "custo", "sintetica"),
    ("2.30.04.01", "Manutenção de Equipamentos", "custo", "analitica"),
    ("2.30.04.02", "Locações de Equipamentos", "custo", "analitica"),
    ("2.30.05", "Fretes", "custo", "analitica"),
    ("2.30.06", "Equipe Administrativa da Obra", "custo", "analitica"),
    ("2.30.07", "Consultoria e Serviços de Obra", "custo", "analitica"),
    ("2.30.08", "Segurança Patrimonial do Canteiro", "custo", "analitica"),
    ("2.30.09", "CONSUMOS E MANUTENÇÃO DO CANTEIRO", "custo", "sintetica"),
    ("2.30.09.01", "Agua e Energia Eletrica", "custo", "analitica"),
    ("2.30.09.02", "Telefonia e Comunicações", "custo", "analitica"),
    ("2.30.09.03", "Conservação e Manutenção do Espaço Fisico", "custo", "analitica"),
    ("2.30.09.04", "Material de Expediente da Obra", "custo", "analitica"),
    ("2.30.10", "DESPESAS GERAIS DA OBRA", "custo", "sintetica"),
    ("2.30.10.01", "Eventos da Obra", "custo", "analitica"),
    ("2.30.10.02", "Softwares da Obra", "custo", "analitica"),
    ("2.30.10.03", "Plotagens e Impressões da Obra", "custo", "analitica"),
    ("2.30.10.04", "Seguros da Obra", "custo", "analitica"),
    ("2.30.90", "(-) Anulação de Custos de Obra", "custo", "analitica"),
    ("2.40", "DESPESAS COMERCIAIS", "despesa", "sintetica"),
    ("2.40.01", "Equipe Comercial", "despesa", "analitica"),
    ("2.40.02", "Consultorias e Serviços Comerciais", "despesa", "analitica"),
    ("2.40.03", "Comissões de vendas", "despesa", "analitica"),
    ("2.40.04", "Telefonia e Comunicações", "despesa", "analitica"),
    ("2.40.05", "Eventos Comercial", "despesa", "analitica"),
    ("2.40.06", "Relacionamentos COML", "despesa", "analitica"),
    ("2.40.07", "Transporte", "despesa", "analitica"),
    ("2.40.08", "Despesas do Ponto de Venda", "despesa", "analitica"),
    ("2.50", "DESPESAS DE MARKETING", "despesa", "sintetica"),
    ("2.50.01", "Equipe do Marketing", "despesa", "analitica"),
    ("2.50.02", "Consultorias e Serviços de Marketing", "despesa", "analitica"),
    ("2.50.03", "PONTO DE VENDAS", "despesa", "sintetica"),
    ("2.50.03.01", "Construção do Ponto de Venda", "despesa", "analitica"),
    ("2.50.03.02", "Mobiliarios e Equipamentos do Ponto de Venda", "despesa", "analitica"),
    ("2.50.03.03", "Alugueis", "despesa", "analitica"),
    ("2.50.03.04", "Segurança do Ponto de Venda", "despesa", "analitica"),
    ("2.50.04", "CONSUMO E MANUTENÇÃO DO PONTO DE VENDA", "despesa", "sintetica"),
    ("2.50.04.01", "Agua e Energia Eletrica do Ponto de Venda", "despesa", "analitica"),
    ("2.50.04.02", "Conservação e Manutenção do Ponto de Venda", "despesa", "analitica"),
    ("2.50.04.03", "Material de Consumo do Ponto de Venda", "despesa", "analitica"),
    ("2.50.04.04", "Telefonia e Comunicações do Ponto de Venda", "despesa", "analitica"),
    ("2.50.05", "Eventos de Marketing", "despesa", "analitica"),
    ("2.50.06", "Relacionamento com Clientes MKT", "despesa", "analitica"),
    ("2.50.07", "Relacionamento com Parceiros MKT", "despesa", "analitica"),
    ("2.50.08", "Produção de Imagens Videos e Fotos", "despesa", "analitica"),
    ("2.50.09", "Impressos", "despesa", "analitica"),
    ("2.50.10", "Maquetes", "despesa", "analitica"),
    ("2.50.11", "Veiculação de Midia OffLine", "despesa", "analitica"),
    ("2.50.12", "Veiculação de Midia OnLine", "despesa", "analitica"),
    ("2.50.13", "DESPESAS GERAIS DE MARKETING", "despesa", "sintetica"),
    ("2.50.13.01", "Softwares de Marketing", "despesa", "analitica"),
    ("2.50.13.02", "Material de Expediente Marketing", "despesa", "analitica"),
    ("2.50.13.03", "Transporte", "despesa", "analitica"),
    ("2.60", "DESPESAS ADMINISTRATIVAS", "despesa", "sintetica"),
    ("2.60.01", "EQUIPE ADMINISTRATIVA", "despesa", "sintetica"),
    ("2.60.01.01", "Pro-Labore", "despesa", "analitica"),
    ("2.60.01.02", "Salarios", "despesa", "analitica"),
    ("2.60.01.03", "Estagiarios", "despesa", "analitica"),
    ("2.60.01.04", "Transportes", "despesa", "analitica"),
    ("2.60.01.05", "Alimentação", "despesa", "analitica"),
    ("2.60.01.06", "INSS", "despesa", "analitica"),
    ("2.60.01.07", "FGTS", "despesa", "analitica"),
    ("2.60.01.08", "Capacitação e Treinamentos", "despesa", "analitica"),
    ("2.60.01.09", "Exames e Consultas Medicas", "despesa", "analitica"),
    ("2.60.01.10", "Planos de Saude", "despesa", "analitica"),
    ("2.60.01.11", "Seguro de Vida", "despesa", "analitica"),
    ("2.60.01.12", "Indenizações", "despesa", "analitica"),
    ("2.60.01.13", "Equipe Administrativa", "despesa", "analitica"),
    ("2.60.01.14", "(-) Anulação de Despesas Administrativas", "despesa", "analitica"),
    ("2.60.02", "Consultoria e Serviços Administrativos", "despesa", "analitica"),
    ("2.60.03", "ESPAÇO FISICO DA SEDE", "despesa", "sintetica"),
    ("2.60.03.01", "Alugueis", "despesa", "analitica"),
    ("2.60.03.02", "Condominios", "despesa", "analitica"),
    ("2.60.03.03", "IPTU do Espaço Fisico", "despesa", "analitica"),
    ("2.60.03.04", "Segurança da Sede", "despesa", "analitica"),
    ("2.60.04", "CONSUMO E MANUTENÇÃO DA SEDE", "despesa", "sintetica"),
    ("2.60.04.01", "Agua e Energia Eletrica", "despesa", "analitica"),
    ("2.60.04.02", "Telefonia e Comunicações", "despesa", "analitica"),
    ("2.60.04.03", "Material de Expediente", "despesa", "analitica"),
    ("2.60.04.04", "Conservação e Manutenção do Espaço Fisico", "despesa", "analitica"),
    ("2.60.05", "DESPESAS GERAIS ADMINISTRATIVAS", "despesa", "sintetica"),
    ("2.60.05.01", "Viagens", "despesa", "analitica"),
    ("2.60.05.02", "Combustiveis", "despesa", "analitica"),
    ("2.60.05.03", "Softwares Administrativos", "despesa", "analitica"),
    ("2.60.05.04", "Contribuição Sindical", "despesa", "analitica"),
    ("2.60.05.05", "Taxas, Registros e Cartorios Administrativos", "despesa", "analitica"),
    ("2.60.05.06", "Eventos Administrativos", "despesa", "analitica"),
    ("2.60.05.07", "Seguros Administrativos", "despesa", "analitica"),
    ("2.70", "DESPESAS FINANCEIRAS", "financeiro", "sintetica"),
    ("2.70.01", "Despesas Bancarias", "financeiro", "analitica"),
    ("2.70.02", "Multas e Juros Moratórios", "financeiro", "analitica"),
    ("2.70.03", "Juros Passivos", "financeiro", "analitica"),
    ("2.70.04", "IOF", "financeiro", "analitica"),
    ("2.70.06", "Transferencia Entre Empresas", "financeiro", "analitica"),
    ("2.70.07", "Empréstimos", "financeiro", "analitica"),
    ("2.70.09", "(-) Recuperação de Despesas Financeiras", "financeiro", "analitica"),
    ("2.80", "DESPESAS TRIBUTARIAS", "despesa", "sintetica"),
    ("2.80.01", "PIS sobre Faturamento/Receita", "despesa", "analitica"),
    ("2.80.02", "COFINS sobre Faturamento/Receita", "despesa", "analitica"),
    ("2.80.03", "ISS sobre Faturamento/Receita", "despesa", "analitica"),
    ("2.80.04", "IRPJ sobre Faturamento/Receita", "despesa", "analitica"),
    ("2.80.05", "INSS sobre Faturamento/Receita", "despesa", "analitica"),
    ("2.80.06", "CSLL sobre Faturamento/Receita", "despesa", "analitica"),
    ("2.80.07", "(-) RET sobre Faturamento/Receita", "despesa", "analitica"),
    ("2.80.08", "(-) Recuperação de Despesas Tributárias", "despesa", "analitica"),
    ("2.90", "IMPOSTOS RETIDOS DE FORNECEDORES", "despesa", "sintetica"),
    ("2.90.01", "RETENÇÃO DE INSS", "despesa", "sintetica"),
    ("2.90.01.01", "Retenção de INSS", "despesa", "analitica"),
    ("2.90.01.02", "Recolhimento de INSS", "despesa", "analitica"),
    ("2.90.01.99", "(-) Reembolso de INSS Retido", "despesa", "analitica"),
    ("2.90.02", "RETENÇÃO DE ISS", "despesa", "sintetica"),
    ("2.90.02.01", "Retenção de ISS", "despesa", "analitica"),
    ("2.90.02.02", "Recolhimento de ISS", "despesa", "analitica"),
    ("2.90.02.99", "(-) Reembolso de ISS Retido", "despesa", "analitica"),
    ("2.90.03", "RETENÇÃO DE IR", "despesa", "sintetica"),
    ("2.90.03.01", "Retenção de IR", "despesa", "analitica"),
    ("2.90.03.02", "Recolhimento Retençao IR", "despesa", "analitica"),
    ("2.90.03.99", "(-) Reembolso de IR Retido", "despesa", "analitica"),
    ("2.90.04", "RETENÇÃO DE PIS, COFINS E CSLL", "despesa", "sintetica"),
    ("2.90.04.01", "Retenção de PIS, COFINS e CSLL", "despesa", "analitica"),
    ("2.90.04.02", "Recolhimento de PIS, COFINS e CSLL", "despesa", "analitica"),
    ("2.90.04.99", "(-) Reembolso de PIS, COFINS e CSLL Retidos", "despesa", "analitica"),
    ("2.90.05", "RETENÇÃO DE CAUÇÃO, PERMUTA E SINAL", "despesa", "sintetica"),
    ("2.90.05.01", "Retenção de Caução, Permuta e Sinal", "despesa", "analitica"),
    ("2.90.05.02", "Recolhimento de Caução, Permuta e Sinal", "despesa", "analitica"),
    ("2.90.05.99", "(-) Reembolso de Caução, Permuta e Sinal", "despesa", "analitica"),
    ("2.90.06", "RETENÇÃO DE RET", "despesa", "sintetica"),
    ("2.90.06.01", "Retenção de RET", "despesa", "analitica"),
    ("2.98", "ADIANTAMENTOS", "despesa", "sintetica"),
    ("2.98.01", "Adiantamentos a Fornecedores", "despesa", "analitica"),
    ("2.98.02", "(-) Baixa de Adto a Fornecedores", "despesa", "analitica"),
    ("2.99", "PATRIMONIO", "investimento", "sintetica"),
    ("2.99.01", "Moveis e Utensílios", "investimento", "analitica"),
    ("2.99.02", "Marcas e Patentes", "investimento", "analitica"),
    ("2.99.03", "Equipamentos Eletronicos", "investimento", "analitica"),
    ("2.99.04", "Veículos", "investimento", "analitica"),
    ("2.99.05", "Maquinas e Equipamentos", "investimento", "analitica"),
    ("2.99.06", "Participação em Empresas", "investimento", "analitica"),
    ("2.99.07", "Consorcios", "investimento", "analitica"),
    ("2.99.08", "(-) Lucro SPE", "investimento", "analitica"),
    ("2.99.09", "(-) Investimentos SPE", "investimento", "analitica"),
]


def _criar_plano(db) -> int:
    """Cria todas as contas a partir da lista flat. Parent inferido pelo código."""
    by_codigo: dict[str, int] = {}
    for codigo, nome, tipo, natureza in PLANO_CONTAS_FLAT:
        partes = codigo.split(".")
        nivel = len(partes)
        parent_id: int | None = None
        if nivel > 1:
            parent_codigo = ".".join(partes[:-1])
            parent_id = by_codigo[parent_codigo]
        ordem = int(partes[-1])
        # Raiz "1" é entrada (Receitas); raiz "2" é saída.
        # Não-raízes ficam com 'saida' por default — não é usado no cálculo.
        tipo_orc = "entrada" if codigo == "1" else "saida"
        conta = Conta(
            codigo=codigo,
            nome=nome,
            parent_id=parent_id,
            nivel=nivel,
            tipo=tipo,
            natureza=natureza,
            tipo_orcamentario=tipo_orc,
            ordem=ordem,
            ativo=True,
        )
        db.add(conta)
        db.flush()
        by_codigo[codigo] = conta.id
    return len(by_codigo)


def _migrar_schema() -> None:
    """Aplica ALTERs idempotentes pra schema mudar sem precisar de Alembic.

    Hoje: adiciona coluna `tipo_orcamentario` em `conta` se ainda não existir,
    e seta 'entrada' para a raiz '1' (compat com banco já populado).
    """
    inspector = inspect(engine)
    if "conta" not in inspector.get_table_names():
        return  # tabela ainda não existe; create_all vai criar com a coluna nova
    cols = {c["name"] for c in inspector.get_columns("conta")}
    if "tipo_orcamentario" in cols:
        return  # já migrado
    with engine.begin() as conn:
        conn.execute(text(
            "ALTER TABLE conta ADD COLUMN tipo_orcamentario VARCHAR NOT NULL DEFAULT 'saida'"
        ))
        # raiz "1" historicamente é entrada
        conn.execute(text(
            "UPDATE conta SET tipo_orcamentario='entrada' WHERE codigo='1'"
        ))
    print("Migração: coluna tipo_orcamentario adicionada (raiz '1' marcada como entrada).")


def seed() -> None:
    _migrar_schema()
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        # 1) Empreendimentos
        criados_emp: list[Empreendimento] = []
        for emp_data in SEED_EMPREENDIMENTOS:
            existente = db.execute(
                select(Empreendimento).where(Empreendimento.codigo == emp_data["codigo"])
            ).scalar_one_or_none()
            if existente is None:
                novo = Empreendimento(**emp_data, ativo=True)
                db.add(novo)
                db.flush()
                criados_emp.append(novo)
            else:
                criados_emp.append(existente)
        db.commit()
        print(f"Empreendimentos: {len(criados_emp)} ({', '.join(e.codigo for e in criados_emp)}).")

        # 2) Plano de contas (compartilhado)
        existing = db.execute(select(Conta).limit(1)).scalar_one_or_none()
        if existing is None:
            n = _criar_plano(db)
            db.commit()
            print(f"Plano de contas criado: {n} contas.")
        else:
            total = db.execute(select(Conta)).scalars().all()
            print(f"Plano de contas já populado: {len(total)} contas.")

        # 3) Orçamento default por empreendimento (ano = SEED_ANO, versao = 1)
        criados_orc = 0
        for emp in criados_emp:
            existente = db.execute(
                select(Orcamento).where(
                    Orcamento.empreendimento_id == emp.id,
                    Orcamento.ano == SEED_ANO,
                    Orcamento.versao == 1,
                )
            ).scalar_one_or_none()
            if existente is None:
                db.add(
                    Orcamento(
                        empreendimento_id=emp.id,
                        ano=SEED_ANO,
                        versao=1,
                        status="rascunho",
                    )
                )
                criados_orc += 1
        db.commit()
        print(
            f"Orçamentos {SEED_ANO}/v1: criados {criados_orc} / "
            f"{len(criados_emp) - criados_orc} já existiam."
        )


if __name__ == "__main__":
    seed()
