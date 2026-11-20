import { useCallback, useEffect, useState } from "react";
import { DEFAULT_MODEL, pickBestModel, type Department, type Ticket } from "@/lib/campusfix";
import { fetchChatModels } from "@/lib/groq";

const TICKETS_KEY = "campusfix.tickets.v1";
const API_KEY_KEY = "campusfix.groqKey";
const MODEL_KEY = "campusfix.groqModel";
const MODELS_KEY = "campusfix.groqModels";

export function useTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TICKETS_KEY);
      if (raw) setTickets(JSON.parse(raw) as Ticket[]);
    } catch {
      /* corrupted storage — start fresh */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(TICKETS_KEY, JSON.stringify(tickets));
  }, [tickets, loaded]);

  const add = useCallback((t: Ticket | Ticket[]) => {
    const list = Array.isArray(t) ? t : [t];
    setTickets((prev) => [...list, ...prev]);
  }, []);

  const approve = useCallback((id: string, department: Department) => {
    setTickets((prev) =>
      prev.map((t) => (t.id === id ? { ...t, department, status: "approved" } : t)),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setTickets((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clear = useCallback(() => setTickets([]), []);

  return { tickets, loaded, add, approve, remove, clear };
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
