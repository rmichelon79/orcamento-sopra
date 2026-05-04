import { BudgetGrid } from "./components/BudgetGrid";
import { useEmpreendimentos, useGrade, useOrcamento } from "./hooks/useGrade";

const ANO = 2026;

export default function App() {
  const empreendimentos = useEmpreendimentos();
  const empreendimento = empreendimentos.data?.[0];
  const orcamento = useOrcamento(empreendimento?.id, ANO);
  const grade = useGrade(orcamento.data?.id);

  if (
    empreendimentos.isLoading ||
    orcamento.isLoading ||
    grade.isLoading
  ) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        Carregando…
      </div>
    );
  }

  const erro =
    empreendimentos.error ?? orcamento.error ?? grade.error;
  if (erro) {
    return (
      <div className="h-full flex items-center justify-center">
        <pre className="p-4 bg-red-50 text-red-700 border border-red-200 rounded text-sm whitespace-pre-wrap max-w-2xl">
          {String(erro)}
        </pre>
      </div>
    );
  }

  if (!grade.data || !empreendimento) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        Sem dados.
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b bg-white px-6 py-3">
        <h1 className="text-lg font-semibold text-gray-900">
          Orçamento — {empreendimento.nome}
        </h1>
      </header>
      <main className="flex-1 min-h-0">
        <BudgetGrid data={grade.data} />
      </main>
    </div>
  );
}
