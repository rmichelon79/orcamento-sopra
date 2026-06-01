// Gate de autenticação — login único da Plataforma Sopra (Supabase Auth).
// Sem sessão válida + acesso a 'orcamento', a RLS bloqueia os dados; então
// este gate envolve o app e só renderiza os filhos quando autorizado.
import { useEffect, useState } from "react";
import { supabase } from "../api/supabase";

type State = "loading" | "login" | "ok";

async function temAcessoOrcamento(userId: string): Promise<boolean> {
  const [{ data: prof }, { data: acc }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
    supabase.from("app_access").select("can_view").eq("app", "orcamento").maybeSingle(),
  ]);
  return (prof as { role?: string } | null)?.role === "admin" ||
    (acc as { can_view?: boolean } | null)?.can_view === true;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>("loading");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && (await temAcessoOrcamento(session.user.id))) {
        if (active) setState("ok");
      } else {
        if (session) await supabase.auth.signOut();
        if (active) setState("login");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: pwd,
    });
    if (error) {
      setErro("E-mail ou senha incorretos.");
      setBusy(false);
      return;
    }
    if (!(await temAcessoOrcamento(data.user.id))) {
      await supabase.auth.signOut();
      setErro("Você não tem acesso ao módulo de Orçamento.");
      setBusy(false);
      return;
    }
    setBusy(false);
    setState("ok");
  }

  if (state === "loading") {
    return (
      <div className="h-screen flex items-center justify-center text-gray-400">
        Carregando…
      </div>
    );
  }

  if (state === "login") {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900">
        <form onSubmit={entrar} className="w-[360px] bg-white rounded-xl p-8 shadow-2xl">
          <div className="text-center mb-6">
            <div className="text-xs font-semibold tracking-widest text-gray-400 uppercase">
              Sopra Incorporações
            </div>
            <div className="text-2xl font-bold text-gray-900">Orçamento</div>
            <div className="text-sm text-gray-500 mt-1">Login único Sopra</div>
          </div>
          {erro && (
            <div className="mb-4 text-sm bg-red-50 text-red-700 border border-red-200 rounded px-3 py-2">
              {erro}
            </div>
          )}
          <label className="block text-xs text-gray-500 mb-1">E-mail</label>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mb-3 px-3 py-2 border border-gray-300 rounded focus:border-blue-500 outline-none"
            placeholder="seu.nome@sopraincorporadora.com.br"
          />
          <label className="block text-xs text-gray-500 mb-1">Senha</label>
          <input
            type="password"
            autoComplete="current-password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            className="w-full mb-4 px-3 py-2 border border-gray-300 rounded focus:border-blue-500 outline-none"
            placeholder="••••••••"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
