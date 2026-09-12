import { useState } from "react";
import { useDashboard } from "@/dashboard/DashboardContext";

// Editor de "Minhas categorias": adicionar/remover da lista compartilhada (casal), usada
// nos dropdowns de categoria e no editor de orçamentos. Remover uma categoria daqui não
// apaga o que já foi gravado em transações/orçamentos, só tira do dropdown (ver Category
// no schema.prisma).
export function CategoryManagerModal({ onClose }: { onClose: () => void }) {
  const { categories, saveCategories } = useDashboard();
  const [draft, setDraft] = useState<string[]>(categories);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

  const add = () => {
    const name = input.trim();
    if (!name || draft.some((c) => c.toLowerCase() === name.toLowerCase())) {
      setInput("");
      return;
    }
    setDraft((d) => [...d, name].sort((a, b) => a.localeCompare(b, "pt-BR")));
    setInput("");
  };

  const remove = (name: string) => setDraft((d) => d.filter((c) => c !== name));

  const save = async () => {
    setSaving(true);
    try {
      await saveCategories(draft);
      onClose();
    } catch (e) {
      console.error(e);
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl bg-card shadow-xl sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="border-b border-border/50 px-6 py-4 text-lg font-semibold text-foreground">
          Minhas categorias
        </h2>
        <div className="flex gap-2 px-6 pt-4">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Nova categoria…"
            aria-label="Nova categoria"
            className="min-h-10 flex-1 rounded-md border border-border/50 bg-card px-3 py-1.5 text-sm"
          />
          <button
            onClick={add}
            disabled={!input.trim()}
            className="min-h-10 rounded-md border border-border/50 px-3 text-sm hover:bg-accent disabled:opacity-50"
          >
            Adicionar
          </button>
        </div>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-6 py-4">
          {draft.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma categoria. Adicione uma acima.</p>
          ) : (
            draft.map((c) => (
              <li
                key={c}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-accent"
              >
                <span className="text-sm text-foreground">{c}</span>
                <button
                  onClick={() => remove(c)}
                  aria-label={`Remover ${c}`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-rose-600 dark:hover:text-rose-400"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                  </svg>
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="flex gap-2 border-t border-border/50 px-6 py-4">
          <button
            onClick={onClose}
            className="min-h-11 flex-1 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-accent"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="min-h-11 flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
