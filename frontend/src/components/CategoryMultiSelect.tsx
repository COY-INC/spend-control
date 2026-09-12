import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDashboard } from "@/dashboard/DashboardContext";

// Normaliza pra busca sem acento/case (ex.: "servicos" acha "Serviços").
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Multiselect de categorias (lista vem de "Minhas categorias", editável pelo usuário) com
// busca pra achar rápido numa lista grande. Ordem = ordem de marcação (a 1ª é a principal
// quando showPrimary). O painel é renderizado num PORTAL no body com position: fixed,
// ancorado no botão: dentro da tabela o wrapper tem `overflow-auto` (scroll horizontal no
// mobile), que cortaria um dropdown `absolute` dentro do card. O portal escapa desse
// clipping. Sem dependência nova de popover.
export function CategoryMultiSelect({
  selected,
  onChange,
  showPrimary = false,
  placeholder = "Todas as categorias",
  ariaLabel,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  showPrimary?: boolean;
  placeholder?: string;
  ariaLabel?: string; // nome acessível do controle (o botão vazio só mostra o placeholder)
}) {
  const { categories } = useDashboard();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const toggle = (c: string) =>
    onChange(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c]);

  const openPanel = () => {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setQuery("");
    setOpen(true);
  };

  // Categoria já marcada mas removida de "Minhas categorias" continua aparecendo (senão
  // some do painel e não dá pra desmarcá-la).
  const options = useMemo(() => {
    const extra = selected.filter((c) => !categories.includes(c));
    return [...extra, ...categories];
  }, [categories, selected]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return q ? options.filter((c) => normalize(c).includes(q)) : options;
  }, [options, query]);

  // Fecha ao clicar fora, rolar ou redimensionar — casos em que a posição fixa ficaria
  // desalinhada do botão. (scroll com capture pega também o scroll do wrapper da tabela.)
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    // Fecha em scroll/resize da PÁGINA (posição fixa desalinharia), mas ignora o scroll
    // de dentro do próprio painel (a lista rola sozinha via overflow-auto).
    const dismiss = (e: Event) => {
      if (e.target instanceof Node && panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  const width = Math.max(rect?.width ?? 0, 224);
  const left = rect ? Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) : 0;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPanel())}
        className="flex min-h-10 items-center rounded-md border border-border/50 bg-card px-3 py-1.5 text-left text-sm"
      >
        {selected.length === 0 ? (
          <span className="text-muted-foreground">{placeholder}</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {selected.map((c, i) => (
              <span key={c} className="inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-xs">
                {c}
                {showPrimary && i === 0 && <span className="text-[10px] text-muted-foreground">principal</span>}
              </span>
            ))}
          </span>
        )}
      </button>
      {open &&
        rect &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", top: rect.bottom + 4, left, width }}
            className="z-50 flex max-h-64 flex-col overflow-hidden rounded-md border border-border/50 bg-card shadow-md"
          >
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar categoria…"
              aria-label="Buscar categoria"
              autoFocus
              className="border-b border-border/50 bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <div className="overflow-auto p-1">
              {filtered.length === 0 ? (
                <p className="px-2 py-1.5 text-sm text-muted-foreground">Nenhuma categoria encontrada.</p>
              ) : (
                filtered.map((c) => (
                  <label
                    key={c}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(c)}
                      onChange={() => toggle(c)}
                      className="h-3.5 w-3.5 rounded border-border/50"
                    />
                    {c}
                  </label>
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
