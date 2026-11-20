import { useCallback, useEffect, useState } from "react";
import type { Department, Ticket } from "@/lib/campusfix";

const TICKETS_KEY = "campusfix.tickets.v1";
const API_KEY_KEY = "campusfix.geminiKey";

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

export function useGeminiKey() {
  const envKey = (import.meta.env["VITE_GEMINI_API_KEY"] as string | undefined) ?? "";
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
  return { apiKey, saved, source, save };
}
