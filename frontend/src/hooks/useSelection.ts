import { useCallback, useEffect, useState } from "react";

export interface Selection {
  empreendimento: string | null; // codigo, ex: "SOPRA"
  ano: number;
  versao: number | null;
  modo: "individual" | "consolidado";
  vista: "ano" | "plurianual"; // só no modo individual
}

const DEFAULT_ANO = new Date().getFullYear();

function parseFromUrl(): Selection {
  const params = new URLSearchParams(window.location.search);
  const modo = params.get("modo") === "consolidado" ? "consolidado" : "individual";
  const ano = Number(params.get("ano")) || DEFAULT_ANO;
  const versaoStr = params.get("versao");
  const versao = versaoStr ? Number(versaoStr) : null;
  return {
    empreendimento: params.get("empreendimento"),
    ano: Number.isFinite(ano) ? ano : DEFAULT_ANO,
    versao: Number.isFinite(versao!) ? versao : null,
    modo,
    vista: params.get("vista") === "plurianual" ? "plurianual" : "ano",
  };
}

function writeToUrl(s: Selection) {
  const params = new URLSearchParams();
  if (s.modo === "consolidado") {
    params.set("modo", "consolidado");
  } else if (s.empreendimento) {
    params.set("empreendimento", s.empreendimento);
  }
  params.set("ano", String(s.ano));
  if (s.versao !== null && s.modo === "individual") {
    params.set("versao", String(s.versao));
  }
  if (s.modo === "individual" && s.vista === "plurianual") {
    params.set("vista", "plurianual");
  }
  const next = "?" + params.toString();
  if (window.location.search !== next) {
    window.history.replaceState(null, "", next);
  }
}

/**
 * Hook que mantém a seleção (empreendimento + ano + versão + modo) em sync com a URL.
 *
 * - Lê uma vez no mount.
 * - Reage a back/forward (popstate).
 * - `update` escreve no URL via replaceState.
 */
export function useSelection() {
  const [selection, setSelection] = useState<Selection>(() => parseFromUrl());

  useEffect(() => {
    const onPopState = () => setSelection(parseFromUrl());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const update = useCallback((next: Partial<Selection>) => {
    setSelection((prev) => {
      const merged: Selection = { ...prev, ...next };
      writeToUrl(merged);
      return merged;
    });
  }, []);

  return { selection, update };
}
