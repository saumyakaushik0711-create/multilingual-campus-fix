import { useCallback, useEffect, useState } from "react";
import { DEFAULT_MODEL, pickBestModel, type Department, type Ticket } from "@/lib/campusfix";
import { fetchChatModels } from "@/lib/groq";
import { supabase } from "@/integrations/supabase/client";
import {
  approveTicket,
  clearTickets,
  fetchTickets,
  removeTicket,
  reportTicket,
  type ReportResult,
} from "@/lib/tickets-db";

const API_KEY_KEY = "campusfix.groqKey";
const MODEL_KEY = "campusfix.groqModel";
const MODELS_KEY = "campusfix.groqModels";

/** Live shared tickets from the database; refreshes whenever anyone, anywhere, changes one. */
export function useTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setTickets(await fetchTickets());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load tickets");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`tickets-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => void reload(), 150);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [reload]);

  /** Saves tickets one by one (so repeats inside a batch merge too); returns how many were merged. */
  const add = useCallback(
    async (t: Ticket | Ticket[]) => {
      const list = Array.isArray(t) ? t : [t];
      const results: ReportResult[] = [];
      try {
        for (const item of list) results.push(await reportTicket(item));
      } finally {
        await reload();
      }
      return results;
    },
    [reload],
  );

  const approve = useCallback(
    async (id: string, department: Department) => {
      const t = tickets.find((x) => x.id === id);
      if (!t) throw new Error("Ticket not found");
      try {
        return await approveTicket(t, department);
      } finally {
        await reload();
      }
    },
    [tickets, reload],
  );

  const remove = useCallback(
    async (id: string) => {
      setTickets((prev) => prev.filter((t) => t.id !== id));
      try {
        await removeTicket(id);
      } finally {
        await reload();
      }
    },
    [reload],
  );

  const clear = useCallback(async () => {
    setTickets([]);
    try {
      await clearTickets();
    } finally {
      await reload();
    }
  }, [reload]);

  return { tickets, loaded, error, add, approve, remove, clear };
}

export function useGroqKey() {
  const envKey = (import.meta.env["VITE_GROQ_API_KEY"] as string | undefined) ?? "";
  const [saved, setSaved] = useState("");

  useEffect(() => {
    setSaved(localStorage.getItem(API_KEY_KEY) ?? "");
  }, []);

  const save = useCallback((key: string) => {
    const k = key.trim();
    if (k) localStorage.setItem(API_KEY_KEY, k);
    else localStorage.removeItem(API_KEY_KEY);
    setSaved(k);
  }, []);

  const apiKey = saved || envKey;
  const source: "saved" | "env" | "none" = saved ? "saved" : envKey ? "env" : "none";
  return { apiKey, envKey, saved, source, save };
}

/** The chosen Groq model plus the live list it was picked from, both kept in localStorage. */
export function useGroqModel() {
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setModel(localStorage.getItem(MODEL_KEY) ?? "");
    try {
      const raw = localStorage.getItem(MODELS_KEY);
      if (raw) setModels(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }
  }, []);

  /** Reloads the live list; keeps `preferred` if still offered, otherwise auto-picks the best. */
  const refresh = useCallback(async (apiKey: string, preferred?: string) => {
    setLoading(true);
    try {
      const list = await fetchChatModels(apiKey);
      const best = pickBestModel(list);
      if (!best) throw new Error("Groq returned no chat models for this key");
      const next = preferred && list.includes(preferred) ? preferred : best;
      localStorage.setItem(MODELS_KEY, JSON.stringify(list));
      localStorage.setItem(MODEL_KEY, next);
      setModels(list);
      setModel(next);
      return next;
    } finally {
      setLoading(false);
    }
  }, []);

  /** Model to classify with: the saved choice, else auto-picked from the live list, else the default. */
  const ensure = useCallback(
    async (apiKey: string) => {
      if (model) return model;
      try {
        return await refresh(apiKey);
      } catch {
        return DEFAULT_MODEL;
      }
    },
    [model, refresh],
  );

  return { model, models, loading, refresh, ensure };
}
