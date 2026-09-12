import { useEffect, useState } from "react";

// useState que persiste em localStorage sob `key` — sobrevive a reload/refresh.
// Falha em silêncio (localStorage indisponível / JSON inválido) caindo no valor inicial.
export function usePersistedState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* ignora quota/indisponibilidade */
    }
  }, [key, state]);

  return [state, setState] as const;
}
