import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { GradeResponse } from "../types/api";
import { applyEdit, applyEdits } from "../lib/gradeEdit";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 300;
const SAVED_BADGE_MS = 1500;

interface PendingEdit {
  conta_id: number;
  mes: number;
  valor: number;
}

export function useGradeEditor(orcamento_id: number | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ["grade", orcamento_id] as const;

  const [status, setStatus] = useState<SaveStatus>("idle");
  const [erroMsg, setErroMsg] = useState<string | null>(null);

  // Edições aguardando flush. Chave = "conta-mes" → último valor vence.
  const pendingRef = useRef(new Map<string, PendingEdit>());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedBadgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (orcamento_id === undefined) return;
    if (pendingRef.current.size === 0) return;

    const items = Array.from(pendingRef.current.values()).map((e) => ({
      conta_id: e.conta_id,
      mes: e.mes,
      valor: e.valor.toFixed(2),
    }));
    pendingRef.current.clear();
    setStatus("saving");
    setErroMsg(null);

    try {
      await api.bulkLancamentos({ orcamento_id, items });
      setStatus("saved");
      if (savedBadgeTimerRef.current) clearTimeout(savedBadgeTimerRef.current);
      savedBadgeTimerRef.current = setTimeout(() => {
        setStatus((s) => (s === "saved" ? "idle" : s));
      }, SAVED_BADGE_MS);
    } catch (err) {
      setStatus("error");
      setErroMsg(String(err));
      // Em erro, recarrega do servidor para garantir consistência.
      queryClient.invalidateQueries({ queryKey });
    }
  }, [orcamento_id, queryClient, queryKey]);

  const scheduleFlush = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      void flush();
    }, DEBOUNCE_MS);
  }, [flush]);

  /** Edição de uma célula. Aplica otimistamente e enfileira save. */
  const editCell = useCallback(
    (conta_id: number, mes: number, valor: number) => {
      if (orcamento_id === undefined) return;
      const safe = Number.isFinite(valor) ? valor : 0;
      pendingRef.current.set(`${conta_id}-${mes}`, {
        conta_id,
        mes,
        valor: safe,
      });
      queryClient.setQueryData<GradeResponse>(queryKey, (old) =>
        old ? applyEdit(old, conta_id, mes, safe) : old,
      );
      setStatus("pending");
      scheduleFlush();
    },
    [orcamento_id, queryClient, queryKey, scheduleFlush],
  );

  /** Aplicação em lote (usada pelo paste do Excel). */
  const editCells = useCallback(
    (edits: PendingEdit[]) => {
      if (orcamento_id === undefined || edits.length === 0) return;
      for (const e of edits) {
        const safe = Number.isFinite(e.valor) ? e.valor : 0;
        pendingRef.current.set(`${e.conta_id}-${e.mes}`, {
          conta_id: e.conta_id,
          mes: e.mes,
          valor: safe,
        });
      }
      queryClient.setQueryData<GradeResponse>(queryKey, (old) =>
        old ? applyEdits(old, edits) : old,
      );
      setStatus("pending");
      scheduleFlush();
    },
    [orcamento_id, queryClient, queryKey, scheduleFlush],
  );

  /** Força flush imediato (útil ao desmontar ou trocar de orçamento). */
  const flushNow = useCallback(async () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    await flush();
  }, [flush]);

  // Avisar o usuário se ele tentar fechar a aba com edições pendentes.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingRef.current.size > 0 || status === "saving") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [status]);

  // Cleanup ao desmontar OU ao trocar de orcamento_id: flush primeiro,
  // depois limpa timers. Isso evita perder edits ao trocar de empreendimento.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (savedBadgeTimerRef.current) clearTimeout(savedBadgeTimerRef.current);
      if (pendingRef.current.size > 0) {
        // fire-and-forget — request continua mesmo após o componente sumir
        void flush();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orcamento_id]);

  return { editCell, editCells, flushNow, status, erroMsg };
}
