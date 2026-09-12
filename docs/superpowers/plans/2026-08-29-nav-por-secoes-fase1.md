# Navegação por seções — Fase 1 (estrutura) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar as duas views de rolagem longa (`CoupleFinances`/`MyFinances`) em 6 seções navegáveis por rota (Resumo, Patrimônio, Investimentos, Cartões, Gastos, Transações), com escopo Casal/Minhas + mês + banco num header global, sidebar no desktop e bottom tab bar no mobile.

**Architecture:** Um `DashboardProvider` (React Context) centraliza escopo/mês/filtro e os fetches (accounts, investments, transactions), unificando os dois escopos via `api.allAccounts(userId?)`. `App.tsx` vira o shell (sidebar + header global + bottom bar) e delega o conteúdo a `<Routes>` de 6 seções. Cada seção reusa os componentes de card que já existem; só a tela Resumo é nova (tiles-KPI derivados). Sem mudança de backend.

**Tech Stack:** React 19, react-router-dom 7 (já instalado e configurado em `main.tsx`), Tailwind 4, shadcn-style `Card`, recharts. TypeScript.

## Global Constraints

- **Sem testes automatizados** (pedido explícito do usuário). Verificação por task = `npm run build` (typecheck) + `npm run lint` + checagem manual no navegador.
- **Sem novos endpoints / sem mudança de backend.** Só reorganização de frontend + tela Resumo derivada de dados já existentes.
- **Branch:** todo o trabalho na branch `feat/nav-por-secoes` (já criada, já contém o spec). Nunca commitar direto no `master`; integração via PR.
- **Reuso:** cada seção reaproveita os componentes existentes com as props que já usam hoje (assinaturas listadas na Task correspondente). Não reescrever componentes de card.
- **Comandos rodam em** `frontend/` (ex.: `cd frontend && npm run build`).
- **Idioma da UI:** português (rótulos como no app atual).

## Estrutura de arquivos

**Criar:**
- `frontend/src/dashboard/DashboardContext.tsx` — provider + `useDashboard()`; estado global e fetches.
- `frontend/src/dashboard/nav.ts` — lista das seções (id, path, label, ícone, se é primária no mobile).
- `frontend/src/components/GlobalHeader.tsx` — escopo Casal/Minhas + select de usuário + mês + banco + tema.
- `frontend/src/components/BottomTabBar.tsx` — navegação inferior no mobile.
- `frontend/src/views/sections/Resumo.tsx` — tela inicial curada (tiles-KPI).
- `frontend/src/views/sections/Patrimonio.tsx`
- `frontend/src/views/sections/Investimentos.tsx`
- `frontend/src/views/sections/Cartoes.tsx`
- `frontend/src/views/sections/Gastos.tsx`
- `frontend/src/views/sections/Transacoes.tsx`

**Modificar:**
- `frontend/src/App.tsx` — vira o shell (provider + sidebar + header + bottom bar + rotas).
- `frontend/src/components/Sidebar.tsx` — itens = seções, via `NavLink` para rotas.
- `frontend/src/main.tsx` — a rota `/` redireciona para `/resumo` (o `App` já pega `/*`).

**Remover (na última task):**
- `frontend/src/views/CoupleFinances.tsx`
- `frontend/src/views/MyFinances.tsx`

---

### Task 1: DashboardContext (estado global + fetches unificados)

**Files:**
- Create: `frontend/src/dashboard/DashboardContext.tsx`

**Interfaces:**
- Consumes: `api`, `EMPTY_FILTER`, tipos `TxFilter`/`AccountFull`/`Investment`/`Transaction`/`User` de `@/api`; `usePersistedState` de `@/lib/usePersistedState`; `currentMonth`/`toPeriod` de `@/components/MonthYearPicker`.
- Produces: `DashboardProvider` (componente) e `useDashboard()` que retorna:
  ```ts
  type Scope = "couple" | "my";
  type DashboardCtx = {
    scope: Scope; setScope: (s: Scope) => void;
    users: User[];
    userId: string; setUserId: (id: string) => void;
    ym: string; setYm: (v: string) => void;
    filter: TxFilter; setFilter: (f: TxFilter) => void;
    accounts: AccountFull[];       // já escopado (casal = todos, minhas = do userId)
    investments: Investment[];     // já escopado por userName quando scope="my"
    transactions: Transaction[];   // do mês selecionado, já escopado
    banks: string[];
    reload: () => void;
    updateCategory: (id: string, category: string) => void;
  };
  ```

- [ ] **Step 1: Criar o arquivo com o provider e o hook**

```tsx
// frontend/src/dashboard/DashboardContext.tsx
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  EMPTY_FILTER,
  type TxFilter,
  type AccountFull,
  type Investment,
  type Transaction,
  type User,
} from "@/api";
import { usePersistedState } from "@/lib/usePersistedState";
import { currentMonth, toPeriod } from "@/components/MonthYearPicker";

export type Scope = "couple" | "my";

export type DashboardCtx = {
  scope: Scope;
  setScope: (s: Scope) => void;
  users: User[];
  userId: string;
  setUserId: (id: string) => void;
  ym: string;
  setYm: (v: string) => void;
  filter: TxFilter;
  setFilter: (f: TxFilter) => void;
  accounts: AccountFull[];
  investments: Investment[];
  transactions: Transaction[];
  banks: string[];
  reload: () => void;
  updateCategory: (id: string, category: string) => void;
};

const Ctx = createContext<DashboardCtx | null>(null);

export function useDashboard(): DashboardCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDashboard precisa estar dentro de <DashboardProvider>");
  return c;
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [scope, setScope] = usePersistedState<Scope>("fin-dash-scope", "couple");
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState("");
  const [ym, setYm] = useState(currentMonth);

  // Um filtro persistido por escopo; ambos os hooks são chamados sempre (regras de hooks).
  const [filterCouple, setFilterCouple] = usePersistedState<TxFilter>("fin-dash-filter-couple", EMPTY_FILTER);
  const [filterMy, setFilterMy] = usePersistedState<TxFilter>("fin-dash-filter-my", EMPTY_FILTER);
  const filter = scope === "couple" ? filterCouple : filterMy;
  const setFilter = scope === "couple" ? setFilterCouple : setFilterMy;

  const [accounts, setAccounts] = useState<AccountFull[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    api
      .users()
      .then((us) => {
        setUsers(us);
        setUserId((prev) => prev || us[0]?.id || "");
      })
      .catch(console.error);
  }, []);

  // undefined = casal (todos os usuários); id = pessoa selecionada.
  const targetUser = scope === "my" ? userId : undefined;

  const reload = useCallback(() => {
    api.allAccounts(targetUser).then(setAccounts).catch(console.error);
    api.investments().then(setInvestments).catch(console.error);
    api.transactions(targetUser, toPeriod(ym)).then(setTransactions).catch(console.error);
  }, [targetUser, ym]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Investimentos por usuário quando scope="my" (o endpoint devolve todos).
  const scopedInvestments = useMemo(() => {
    if (scope !== "my") return investments;
    const name = users.find((u) => u.id === userId)?.name;
    return name ? investments.filter((i) => i.userName === name) : investments;
  }, [investments, scope, userId, users]);

  const banks = useMemo(
    () =>
      [
        ...new Set([
          ...accounts.map((a) => a.institution),
          ...investments.map((i) => i.institution),
        ]),
      ].sort(),
    [accounts, investments],
  );

  const updateCategory = useCallback(
    (id: string, category: string) => {
      setTransactions((prev) =>
        prev.map((t) => (t.id === id ? { ...t, userCategory: category || null } : t)),
      );
      api.updateTransaction(id, { userCategory: category }).catch((e) => {
        console.error(e);
        reload();
      });
    },
    [reload],
  );

  const value: DashboardCtx = {
    scope,
    setScope,
    users,
    userId,
    setUserId,
    ym,
    setYm,
    filter,
    setFilter,
    accounts,
    investments: scopedInvestments,
    transactions,
    banks,
    reload,
    updateCategory,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run build`
Expected: build passa (o provider ainda não é usado; sem erro de tipos).

- [ ] **Step 3: Lint**

Run: `cd frontend && npm run lint`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/dashboard/DashboardContext.tsx
git commit -m "feat: DashboardContext (estado global + fetches unificados por escopo)"
```

---

### Task 2: Config de navegação das seções

**Files:**
- Create: `frontend/src/dashboard/nav.ts`

**Interfaces:**
- Produces:
  ```ts
  type SectionId = "resumo" | "patrimonio" | "investimentos" | "cartoes" | "gastos" | "transacoes";
  type Section = { id: SectionId; path: string; label: string; icon: string; mobilePrimary: boolean };
  const SECTIONS: Section[];
  ```
  `icon` é um emoji (Fase 1; ícones SVG ficam pra Fase 2). `mobilePrimary=true` aparece na bottom bar; os demais entram em "Mais".

- [ ] **Step 1: Criar o arquivo**

```ts
// frontend/src/dashboard/nav.ts
export type SectionId =
  | "resumo"
  | "patrimonio"
  | "investimentos"
  | "cartoes"
  | "gastos"
  | "transacoes";

export type Section = {
  id: SectionId;
  path: string;
  label: string;
  icon: string; // emoji na Fase 1; SVG na Fase 2
  mobilePrimary: boolean; // true = bottom bar; false = menu "Mais"
};

export const SECTIONS: Section[] = [
  { id: "resumo", path: "/resumo", label: "Resumo", icon: "🏠", mobilePrimary: true },
  { id: "patrimonio", path: "/patrimonio", label: "Patrimônio", icon: "💰", mobilePrimary: false },
  { id: "investimentos", path: "/investimentos", label: "Investimentos", icon: "📈", mobilePrimary: false },
  { id: "cartoes", path: "/cartoes", label: "Cartões", icon: "💳", mobilePrimary: true },
  { id: "gastos", path: "/gastos", label: "Gastos", icon: "📊", mobilePrimary: true },
  { id: "transacoes", path: "/transacoes", label: "Transações", icon: "🧾", mobilePrimary: true },
];
```

- [ ] **Step 2: Typecheck + lint**

Run: `cd frontend && npm run build && npm run lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/dashboard/nav.ts
git commit -m "feat: config de navegação das seções (nav.ts)"
```

---

### Task 3: Sidebar do desktop com rotas

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx` (reescrever conteúdo)

**Interfaces:**
- Consumes: `SECTIONS` de `@/dashboard/nav`; `NavLink` de `react-router-dom`; `ThemeToggle`.
- Produces: `SidebarContent({ onLogout, onNavigate }: { onLogout: () => void; onNavigate?: () => void })` — sem mais props `view`/`onSelect` (a rota ativa vem do `NavLink`). `onNavigate` é chamado ao clicar num link (usado pelo drawer/menu mobile pra fechar).

- [ ] **Step 1: Reescrever o Sidebar**

```tsx
// frontend/src/components/Sidebar.tsx
import { NavLink } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SECTIONS } from "@/dashboard/nav";

export function SidebarContent({
  onLogout,
  onNavigate,
}: {
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      <nav className="space-y-1">
        {SECTIONS.map((s) => (
          <NavLink
            key={s.id}
            to={s.path}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              }`
            }
          >
            <span aria-hidden>{s.icon}</span>
            {s.label}
          </NavLink>
        ))}
      </nav>
      <button
        onClick={onLogout}
        className="mt-6 flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-accent"
      >
        Sair
      </button>
      <div className="mt-6 flex items-center justify-between px-3 md:mt-8">
        <span className="text-sm text-muted-foreground">Tema escuro</span>
        <ThemeToggle />
      </div>
    </>
  );
}
```

> Nota: o `export type View` e o `export const NAV` antigos são removidos. A Task 5 (App.tsx) para de usá-los; nenhum outro arquivo os importa (confirmar com `grep -rn "from \"@/components/Sidebar\"" frontend/src`).

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run build`
Expected: **vai falhar** em `App.tsx` (ainda usa a API antiga do Sidebar). Isso é esperado — App.tsx é reescrito na Task 5. Se quiser um checkpoint verde antes, pule o build até a Task 5; caso contrário, siga.

- [ ] **Step 3: Lint do arquivo isolado**

Run: `cd frontend && npx oxlint src/components/Sidebar.tsx`
Expected: sem erros no arquivo.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Sidebar.tsx
git commit -m "feat: sidebar navega por rotas (NavLink) com as 6 seções"
```

---

### Task 4: GlobalHeader (escopo + usuário + mês + banco + tema)

**Files:**
- Create: `frontend/src/components/GlobalHeader.tsx`

**Interfaces:**
- Consumes: `useDashboard`; `MonthYearPicker` de `@/components/MonthYearPicker`.
- Produces: `GlobalHeader()` (sem props; lê tudo do context).

Regras (do spec): o header carrega **só** escopo, usuário (quando Minhas), mês e banco. Filtro detalhado (tipo/categoria/internos) fica na seção Transações.

- [ ] **Step 1: Criar o componente**

```tsx
// frontend/src/components/GlobalHeader.tsx
import { useDashboard } from "@/dashboard/DashboardContext";
import { MonthYearPicker } from "@/components/MonthYearPicker";

export function GlobalHeader() {
  const { scope, setScope, users, userId, setUserId, ym, setYm, filter, setFilter, banks } =
    useDashboard();
  const sel = "min-h-10 rounded-md border border-border/50 bg-card px-3 py-1.5 text-sm";

  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      {/* Escopo Casal / Minhas */}
      <div className="inline-flex rounded-md border border-border/50 p-0.5">
        {(["couple", "my"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            aria-pressed={scope === s}
            className={`min-h-9 rounded px-3 text-sm transition-colors ${
              scope === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {s === "couple" ? "Casal" : "Minhas"}
          </button>
        ))}
      </div>

      {scope === "my" && (
        <select className={sel} value={userId} onChange={(e) => setUserId(e.target.value)}>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      )}

      <MonthYearPicker value={ym} onChange={setYm} />

      <select
        className={sel}
        value={filter.banco}
        onChange={(e) => setFilter({ ...filter, banco: e.target.value })}
      >
        <option value="">Todos os bancos</option>
        {banks.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Lint do arquivo**

Run: `cd frontend && npx oxlint src/components/GlobalHeader.tsx`
Expected: sem erros. (Build completo só depois da Task 5.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/GlobalHeader.tsx
git commit -m "feat: GlobalHeader (escopo/usuário/mês/banco)"
```

---

### Task 5: BottomTabBar (mobile)

**Files:**
- Create: `frontend/src/components/BottomTabBar.tsx`

**Interfaces:**
- Consumes: `SECTIONS` de `@/dashboard/nav`; `NavLink`, `useLocation` de `react-router-dom`; `useState`.
- Produces: `BottomTabBar({ onLogout }: { onLogout: () => void })`. Mostra as seções `mobilePrimary` + um botão "Mais" que abre um bottom-sheet com as não-primárias (Patrimônio, Investimentos) e o logout/tema.

- [ ] **Step 1: Criar o componente**

```tsx
// frontend/src/components/BottomTabBar.tsx
import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { createPortal } from "react-dom";
import { SECTIONS } from "@/dashboard/nav";
import { ThemeToggle } from "@/components/ThemeToggle";

export function BottomTabBar({ onLogout }: { onLogout: () => void }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  const primary = SECTIONS.filter((s) => s.mobilePrimary);
  const secondary = SECTIONS.filter((s) => !s.mobilePrimary);
  const moreActive = secondary.some((s) => s.path === pathname);

  const tab = "flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px]";

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border/50 bg-card md:hidden">
        {primary.map((s) => (
          <NavLink
            key={s.id}
            to={s.path}
            className={({ isActive }) =>
              `${tab} ${isActive ? "text-primary" : "text-muted-foreground"}`
            }
          >
            <span aria-hidden className="text-lg">
              {s.icon}
            </span>
            {s.label}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          className={`${tab} ${moreActive ? "text-primary" : "text-muted-foreground"}`}
        >
          <span aria-hidden className="text-lg">
            ⋯
          </span>
          Mais
        </button>
      </nav>

      {moreOpen &&
        createPortal(
          <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Mais">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setMoreOpen(false)} />
            <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border/50 bg-card p-4 pb-6 shadow-xl">
              <div className="space-y-1">
                {secondary.map((s) => (
                  <NavLink
                    key={s.id}
                    to={s.path}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      `flex min-h-11 items-center gap-2 rounded-md px-3 text-sm ${
                        isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                      }`
                    }
                  >
                    <span aria-hidden>{s.icon}</span>
                    {s.label}
                  </NavLink>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border/50 px-3 pt-3">
                <span className="text-sm text-muted-foreground">Tema escuro</span>
                <ThemeToggle />
              </div>
              <button
                onClick={() => {
                  setMoreOpen(false);
                  onLogout();
                }}
                className="mt-2 flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm text-muted-foreground hover:bg-accent"
              >
                Sair
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
```

- [ ] **Step 2: Lint do arquivo**

Run: `cd frontend && npx oxlint src/components/BottomTabBar.tsx`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/BottomTabBar.tsx
git commit -m "feat: BottomTabBar (navegação mobile com menu Mais)"
```

---

### Task 6: App shell + rotas com seções-stub (navegação ponta a ponta)

**Files:**
- Modify: `frontend/src/App.tsx` (reescrever)
- Modify: `frontend/src/main.tsx` (redirecionar `/` → `/resumo`)
- Create (stubs temporários): as 6 seções em `frontend/src/views/sections/*.tsx` retornando um placeholder. Serão preenchidas nas Tasks 7–12.

**Interfaces:**
- Consumes: `DashboardProvider` (Task 1), `SidebarContent` (Task 3), `GlobalHeader` (Task 4), `BottomTabBar` (Task 5), `SECTIONS` (Task 2), `Routes`/`Route`/`Navigate`/`useNavigate` de react-router.
- Produces: `App` (shell). As seções são componentes default-less nomeados: `Resumo`, `Patrimonio`, `Investimentos`, `Cartoes`, `Gastos`, `Transacoes`.

- [ ] **Step 1: Criar os 6 stubs**

Cada arquivo `frontend/src/views/sections/<Nome>.tsx` com este conteúdo (trocando o nome):

```tsx
// frontend/src/views/sections/Resumo.tsx
export function Resumo() {
  return <p className="text-muted-foreground">Resumo (em construção)</p>;
}
```

Repetir para `Patrimonio`, `Investimentos`, `Cartoes`, `Gastos`, `Transacoes` (nome do componente = nome do arquivo; texto do placeholder com o nome da seção).

- [ ] **Step 2: Reescrever `App.tsx` como shell**

```tsx
// frontend/src/App.tsx
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { token } from "@/api";
import { DashboardProvider } from "@/dashboard/DashboardContext";
import { SidebarContent } from "@/components/Sidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { BottomTabBar } from "@/components/BottomTabBar";
import { Resumo } from "@/views/sections/Resumo";
import { Patrimonio } from "@/views/sections/Patrimonio";
import { Investimentos } from "@/views/sections/Investimentos";
import { Cartoes } from "@/views/sections/Cartoes";
import { Gastos } from "@/views/sections/Gastos";
import { Transacoes } from "@/views/sections/Transacoes";

function App() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const logout = () => {
    token.clear();
    navigate("/login", { replace: true });
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onEsc);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onEsc);
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <DashboardProvider>
      <div className="flex min-h-screen flex-col md:flex-row">
        {/* Barra superior — só mobile (abre o drawer opcional; a navegação principal é a bottom bar). */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/50 bg-card px-4 py-3 md:hidden">
          <h1 className="text-lg font-semibold">fin-dash</h1>
        </header>

        {/* Sidebar desktop. */}
        <aside className="hidden shrink-0 border-border/50 bg-card p-4 md:flex md:w-60 md:flex-col md:border-r">
          <h1 className="mb-6 px-2 text-lg font-semibold">fin-dash</h1>
          <SidebarContent onLogout={logout} />
        </aside>

        {/* Drawer opcional (mantém ESC/scroll-lock) — não é o caminho principal no mobile. */}
        {menuOpen &&
          createPortal(
            <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
              <div className="absolute inset-y-0 left-0 flex w-72 max-w-[80%] flex-col border-r border-border/50 bg-card p-4 shadow-xl">
                <h1 className="mb-6 px-2 text-lg font-semibold">fin-dash</h1>
                <SidebarContent onLogout={logout} onNavigate={() => setMenuOpen(false)} />
              </div>
            </div>,
            document.body,
          )}

        {/* pb-20 no mobile: espaço pra bottom bar não cobrir o conteúdo. */}
        <main className="min-w-0 flex-1 p-4 pb-20 md:p-8 md:pb-8">
          <GlobalHeader />
          {/* Rotas DESCENDENTES (App é montado em path="/*"): caminhos relativos,
              sem "/" inicial, senão o React Router 7 lança erro. Os to= de NavLink/
              Navigate continuam absolutos ("/resumo"). */}
          <Routes>
            <Route path="resumo" element={<Resumo />} />
            <Route path="patrimonio" element={<Patrimonio />} />
            <Route path="investimentos" element={<Investimentos />} />
            <Route path="cartoes" element={<Cartoes />} />
            <Route path="gastos" element={<Gastos />} />
            <Route path="transacoes" element={<Transacoes />} />
            <Route path="*" element={<Navigate to="/resumo" replace />} />
          </Routes>
        </main>

        <BottomTabBar onLogout={logout} />
      </div>
    </DashboardProvider>
  );
}

export default App;
```

- [ ] **Step 3: Ajustar `main.tsx` para a raiz cair no shell**

O `App` já casa `/*` (ver `main.tsx` atual). A rota curinga `*` dentro do `App` redireciona pra `/resumo`, então `/` já funciona. **Nenhuma mudança em `main.tsx` é necessária** — confirmar lendo o arquivo; se a rota do App não for `path="/*"`, ajustar para `path="/*"`.

- [ ] **Step 4: Typecheck + lint (checkpoint verde)**

Run: `cd frontend && npm run build && npm run lint`
Expected: build e lint passam. (CoupleFinances/MyFinances ainda existem, mas não são mais importados — ok; serão removidos na Task 12.)

- [ ] **Step 5: Verificação manual**

Run: `cd frontend && npm run dev`
Abrir `http://localhost:5173`, logar. Conferir:
- Redireciona para `/resumo`.
- Sidebar (desktop) troca de rota ao clicar; item ativo destacado.
- Header global mostra Casal/Minhas, mês e banco; trocar pra "Minhas" mostra o select de usuário.
- Estreitar a janela (<768px): aparece a bottom bar; "Mais" abre o sheet com Patrimônio/Investimentos.
- Cada rota mostra o placeholder correspondente.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx frontend/src/views/sections/
git commit -m "feat: app shell com rotas de seções (stubs) + bottom bar + header global"
```

---

### Task 7: Seção Patrimônio

**Files:**
- Modify: `frontend/src/views/sections/Patrimonio.tsx` (substituir o stub)

**Interfaces:**
- Consumes: `useDashboard`; `brl`/`signedBalance`/`accountMatchesFilter` de `@/api`; `Card*` de `@/components/ui/card`; `ReservedBalanceCard({ userId?, bank? })`; `ConnectionsStatus({ onSynced? })`.

- [ ] **Step 1: Implementar a seção**

```tsx
// frontend/src/views/sections/Patrimonio.tsx
import { useMemo } from "react";
import { brl, signedBalance, accountMatchesFilter } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReservedBalanceCard } from "@/components/ReservedBalanceCard";
import { ConnectionsStatus } from "@/components/ConnectionsStatus";
import { useDashboard } from "@/dashboard/DashboardContext";

export function Patrimonio() {
  const { accounts, investments, filter, scope, userId, reload } = useDashboard();

  const filteredAccounts = useMemo(
    () => accounts.filter((a) => accountMatchesFilter(a.institution, a.type, filter)),
    [accounts, filter],
  );
  const filteredInvestments = useMemo(
    () => investments.filter((i) => accountMatchesFilter(i.institution, "INVESTMENT", filter)),
    [investments, filter],
  );
  const total =
    filteredAccounts.reduce((s, a) => s + signedBalance(a), 0) +
    filteredInvestments.reduce((s, i) => s + i.balance, 0);
  const byUser = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of filteredAccounts) m.set(a.userName, (m.get(a.userName) ?? 0) + signedBalance(a));
    for (const i of filteredInvestments) m.set(i.userName, (m.get(i.userName) ?? 0) + i.balance);
    return [...m.entries()];
  }, [filteredAccounts, filteredInvestments]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{scope === "couple" ? "Saldo consolidado do casal" : "Saldo total"}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold tracking-tight tabular-nums">{brl(total)}</CardContent>
        </Card>
        {scope === "couple" &&
          byUser.map(([name, balance]) => (
            <Card key={name}>
              <CardHeader>
                <CardTitle>{name}</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold tracking-tight tabular-nums">{brl(balance)}</CardContent>
            </Card>
          ))}
        <ReservedBalanceCard userId={scope === "my" ? userId : undefined} bank={filter.banco} />
      </div>

      {/* Saldos por conta. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredAccounts.map((a) => (
          <Card key={a.id}>
            <CardHeader>
              <CardTitle className="text-sm">
                {a.institution} · {a.type}
                {a.name ? ` · ${a.name}` : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xl font-semibold tabular-nums">{brl(signedBalance(a))}</CardContent>
          </Card>
        ))}
      </div>

      <ConnectionsStatus onSynced={reload} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `cd frontend && npm run build && npm run lint`
Expected: sem erros.

- [ ] **Step 3: Verificação manual**

`npm run dev` → `/patrimonio`. Conferir: saldo consolidado, cards por conta, reservados e status das conexões. Trocar escopo Casal↔Minhas e banco; os valores reagem.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/sections/Patrimonio.tsx
git commit -m "feat: seção Patrimônio (saldos, reservados, conexões)"
```

---

### Task 8: Seção Investimentos

**Files:**
- Modify: `frontend/src/views/sections/Investimentos.tsx`

**Interfaces:**
- Consumes: `useDashboard`; `InvestmentsCard({ bank? })`.

> Limitação conhecida (documentada no spec): `InvestmentsCard` filtra por banco, não por usuário. No escopo Minhas ele ainda mostra por banco; o recorte por usuário fica pra Fase 2.

- [ ] **Step 1: Implementar**

```tsx
// frontend/src/views/sections/Investimentos.tsx
import { InvestmentsCard } from "@/components/InvestmentsCard";
import { useDashboard } from "@/dashboard/DashboardContext";

export function Investimentos() {
  const { filter } = useDashboard();
  return (
    <div className="space-y-6">
      <InvestmentsCard bank={filter.banco} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `cd frontend && npm run build && npm run lint`
Expected: sem erros.

- [ ] **Step 3: Verificação manual**

`/investimentos` mostra o card de investimentos; filtro de banco reage.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/sections/Investimentos.tsx
git commit -m "feat: seção Investimentos"
```

---

### Task 9: Seção Cartões

**Files:**
- Modify: `frontend/src/views/sections/Cartoes.tsx`

**Interfaces:**
- Consumes: `useDashboard`; `applyTxFilters` de `@/api`; `CreditCardInvoicesCard({ userId?, bank? })`; `FutureCommitmentsCard({ userId?, bank? })`; `PaymentMethodSplitCard({ transactions, includeInternal })`.

- [ ] **Step 1: Implementar**

```tsx
// frontend/src/views/sections/Cartoes.tsx
import { useMemo } from "react";
import { applyTxFilters } from "@/api";
import { CreditCardInvoicesCard } from "@/components/CreditCardInvoicesCard";
import { FutureCommitmentsCard } from "@/components/FutureCommitmentsCard";
import { PaymentMethodSplitCard } from "@/components/PaymentMethodSplitCard";
import { useDashboard } from "@/dashboard/DashboardContext";

export function Cartoes() {
  const { transactions, filter, scope, userId } = useDashboard();
  const filtered = useMemo(() => applyTxFilters(transactions, filter), [transactions, filter]);
  const user = scope === "my" ? userId : undefined;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CreditCardInvoicesCard userId={user} bank={filter.banco} />
        <PaymentMethodSplitCard transactions={filtered} includeInternal={filter.incluirInternos} />
      </div>
      <FutureCommitmentsCard userId={user} bank={filter.banco} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `cd frontend && npm run build && npm run lint`
Expected: sem erros.

- [ ] **Step 3: Verificação manual**

`/cartoes`: faturas, split por meio de pagamento e parcelamentos futuros. Escopo/banco reagem.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/sections/Cartoes.tsx
git commit -m "feat: seção Cartões (faturas, split, parcelamentos)"
```

---

### Task 10: Seção Gastos

**Files:**
- Modify: `frontend/src/views/sections/Gastos.tsx`

**Interfaces:**
- Consumes: `useDashboard`; `applyTxFilters` de `@/api`; `MonthFlowCard({ transactions, includeInternal })`; `ExpensesDonut`/`IncomeExpenseBar` de `@/components/charts/*` (props `{ transactions, includeInternal }`); `BudgetCard({ transactions })`; `SubscriptionsCard()`.

- [ ] **Step 1: Implementar**

```tsx
// frontend/src/views/sections/Gastos.tsx
import { useMemo } from "react";
import { applyTxFilters } from "@/api";
import { MonthFlowCard } from "@/components/MonthFlowCard";
import { ExpensesDonut } from "@/components/charts/ExpensesDonut";
import { IncomeExpenseBar } from "@/components/charts/IncomeExpenseBar";
import { BudgetCard } from "@/components/BudgetCard";
import { SubscriptionsCard } from "@/components/SubscriptionsCard";
import { useDashboard } from "@/dashboard/DashboardContext";

export function Gastos() {
  const { transactions, filter } = useDashboard();
  const filtered = useMemo(() => applyTxFilters(transactions, filter), [transactions, filter]);

  return (
    <div className="space-y-6">
      <MonthFlowCard transactions={filtered} includeInternal={filter.incluirInternos} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ExpensesDonut transactions={filtered} includeInternal={filter.incluirInternos} />
        <IncomeExpenseBar transactions={filtered} includeInternal={filter.incluirInternos} />
      </div>
      <BudgetCard transactions={transactions} />
      <SubscriptionsCard />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `cd frontend && npm run build && npm run lint`
Expected: sem erros.

- [ ] **Step 3: Verificação manual**

`/gastos`: fluxo do mês, donut de categorias, entradas×saídas, orçamento e assinaturas.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/sections/Gastos.tsx
git commit -m "feat: seção Gastos (fluxo, gráficos, orçamento, assinaturas)"
```

---

### Task 11: Seção Transações (com filtro detalhado)

**Files:**
- Modify: `frontend/src/views/sections/Transacoes.tsx`

**Interfaces:**
- Consumes: `useDashboard`; `applyTxFilters` de `@/api`; `TransactionFilters({ filter, onChange, banks })`; `TransactionsTable({ transactions, onCategoryChange, userId?, includeInternal })`; `Card*`.

Aqui mora o filtro **detalhado** (tipo/categoria/internos), separado do header global (que só tem banco).

- [ ] **Step 1: Implementar**

```tsx
// frontend/src/views/sections/Transacoes.tsx
import { useMemo } from "react";
import { applyTxFilters } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TransactionFilters } from "@/components/TransactionFilters";
import { TransactionsTable } from "@/components/TransactionsTable";
import { useDashboard } from "@/dashboard/DashboardContext";

export function Transacoes() {
  const { transactions, filter, setFilter, banks, scope, userId, updateCategory } = useDashboard();
  const filtered = useMemo(() => applyTxFilters(transactions, filter), [transactions, filter]);

  return (
    <div className="space-y-6">
      <TransactionFilters filter={filter} onChange={setFilter} banks={banks} />
      <Card>
        <CardHeader>
          <CardTitle>{scope === "couple" ? "Todas as transações" : "Transações"}</CardTitle>
        </CardHeader>
        <CardContent>
          <TransactionsTable
            transactions={filtered}
            onCategoryChange={updateCategory}
            userId={scope === "my" ? userId : undefined}
            includeInternal={filter.incluirInternos}
          />
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `cd frontend && npm run build && npm run lint`
Expected: sem erros.

- [ ] **Step 3: Verificação manual**

`/transacoes`: filtros detalhados (tipo/categoria/internos) + tabela. Trocar categoria de uma transação persiste (recarregar mantém).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/sections/Transacoes.tsx
git commit -m "feat: seção Transações (filtro detalhado + tabela)"
```

---

### Task 12: Tela Resumo (tiles-KPI) + remoção das views antigas

**Files:**
- Modify: `frontend/src/views/sections/Resumo.tsx` (substituir stub)
- Delete: `frontend/src/views/CoupleFinances.tsx`, `frontend/src/views/MyFinances.tsx`

**Interfaces:**
- Consumes: `useDashboard`; `useNavigate` de react-router; `brl`/`signedBalance`/`accountMatchesFilter`/`incomeValue`/`expenseValue`/`applyTxFilters` e tipos `CreditCard`/`CommitmentPlan` de `@/api`; `api` para `cards`/`commitments`/`budgets`; `DueRemindersBanner()`; `Card*`.

KPIs (derivados de dados já existentes):
- **Patrimônio líquido** → `/patrimonio`: soma de `signedBalance(accounts)` + `investments.balance` (respeitando filtro de banco).
- **Fluxo do mês** → `/gastos`: `Σ incomeValue − Σ expenseValue` das transações filtradas.
- **Faturas em aberto** → `/cartoes`: `Σ card.openInvoice.amount`, com contagem de cartões.
- **Comprometido (parcelas)** → `/cartoes`: `Σ commitment.remainingAmount`.
- **Gasto vs orçamento** → `/gastos`: `Σ expenseValue` do mês ÷ `Σ` dos limites de `budgets` (× 100).

- [ ] **Step 1: Implementar o Resumo**

```tsx
// frontend/src/views/sections/Resumo.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  brl,
  signedBalance,
  accountMatchesFilter,
  applyTxFilters,
  incomeValue,
  expenseValue,
  type CreditCard,
  type CommitmentPlan,
} from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DueRemindersBanner } from "@/components/DueRemindersBanner";
import { useDashboard } from "@/dashboard/DashboardContext";

// Tile clicável: rótulo, valor grande e uma linha de contexto; leva à seção de origem.
function KpiTile({
  label,
  value,
  hint,
  to,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  to: string;
  tone?: "positive" | "negative";
}) {
  const navigate = useNavigate();
  const toneCls =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-500"
      : tone === "negative"
        ? "text-rose-600 dark:text-rose-500"
        : "text-foreground";
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => navigate(to)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && navigate(to)}
      className="cursor-pointer transition hover:ring-2 hover:ring-primary/20"
    >
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold tracking-tight tabular-nums ${toneCls}`}>{value}</div>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </CardContent>
    </Card>
  );
}

export function Resumo() {
  const { accounts, investments, transactions, filter, scope, userId } = useDashboard();
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [commitments, setCommitments] = useState<CommitmentPlan[]>([]);
  const [budgets, setBudgets] = useState<Record<string, number>>({});

  const user = scope === "my" ? userId : undefined;
  useEffect(() => {
    api.cards(user).then(setCards).catch(console.error);
    api.commitments(user).then(setCommitments).catch(console.error);
    api.budgets().then(setBudgets).catch(console.error);
  }, [user]);

  // Patrimônio líquido (respeita filtro de banco).
  const netWorth = useMemo(() => {
    const acc = accounts
      .filter((a) => accountMatchesFilter(a.institution, a.type, filter))
      .reduce((s, a) => s + signedBalance(a), 0);
    const inv = investments
      .filter((i) => accountMatchesFilter(i.institution, "INVESTMENT", filter))
      .reduce((s, i) => s + i.balance, 0);
    return acc + inv;
  }, [accounts, investments, filter]);

  // Fluxo do mês (entradas − saídas) sobre as transações filtradas.
  const flow = useMemo(() => {
    const f = applyTxFilters(transactions, filter);
    const inc = f.reduce((s, t) => s + incomeValue(t, filter.incluirInternos), 0);
    const exp = f.reduce((s, t) => s + expenseValue(t, filter.incluirInternos), 0);
    return { inc, exp, net: inc - exp };
  }, [transactions, filter]);

  const cardsFiltered = filter.banco ? cards.filter((c) => c.bank === filter.banco) : cards;
  const openInvoices = cardsFiltered.reduce((s, c) => s + c.openInvoice.amount, 0);

  const commitmentsFiltered = filter.banco
    ? commitments.filter((p) => p.bank === filter.banco)
    : commitments;
  const committed = commitmentsFiltered.reduce((s, p) => s + p.remainingAmount, 0);

  const budgetTotal = Object.values(budgets).reduce((s, v) => s + v, 0);
  const budgetPct = budgetTotal > 0 ? Math.round((flow.exp / budgetTotal) * 100) : null;

  return (
    <div className="space-y-6">
      <DueRemindersBanner />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiTile
          label="Patrimônio líquido"
          value={brl(netWorth)}
          hint="contas + investimentos"
          to="/patrimonio"
        />
        <KpiTile
          label="Fluxo do mês"
          value={brl(flow.net)}
          hint={`entradas ${brl(flow.inc)} · saídas ${brl(flow.exp)}`}
          to="/gastos"
          tone={flow.net >= 0 ? "positive" : "negative"}
        />
        <KpiTile
          label="Faturas em aberto"
          value={brl(openInvoices)}
          hint={`${cardsFiltered.length} cartão${cardsFiltered.length === 1 ? "" : "es"}`}
          to="/cartoes"
          tone="negative"
        />
        <KpiTile
          label="Comprometido (parcelas)"
          value={brl(committed)}
          hint={`${commitmentsFiltered.length} parcelamento${commitmentsFiltered.length === 1 ? "" : "s"}`}
          to="/cartoes"
          tone="negative"
        />
        {budgetPct !== null && (
          <div className="sm:col-span-2">
            <KpiTile
              label="Gasto vs orçamento (mês)"
              value={`${budgetPct}%`}
              hint={`${brl(flow.exp)} de ${brl(budgetTotal)}`}
              to="/gastos"
              tone={budgetPct > 100 ? "negative" : undefined}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Remover as views antigas**

```bash
git rm frontend/src/views/CoupleFinances.tsx frontend/src/views/MyFinances.tsx
```

- [ ] **Step 3: Confirmar que nada mais as importa**

Run: `cd frontend && grep -rn "CoupleFinances\|MyFinances" src` (usar a ferramenta Grep)
Expected: nenhum resultado (fora do git). Se aparecer, remover o import órfão.

- [ ] **Step 4: Typecheck + lint**

Run: `cd frontend && npm run build && npm run lint`
Expected: sem erros.

- [ ] **Step 5: Verificação manual**

`/resumo`: banner de vencimentos (se houver), e os tiles. Clicar cada tile navega pra seção certa. Trocar escopo/mês/banco atualiza os números.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/sections/Resumo.tsx
git commit -m "feat: tela Resumo (tiles-KPI) e remoção das views antigas"
```

---

## Fecho

- [ ] **Build final + push + PR**

```bash
cd frontend && npm run build && npm run lint
cd .. && git push -u origin feat/nav-por-secoes
gh pr create --title "feat: navegação por seções (Fase 1)" --body "Reorganiza o dashboard em 6 seções navegáveis (rotas), com escopo Casal/Minhas + mês + banco no header global, sidebar no desktop e bottom tab bar no mobile. Tela Resumo nova com KPIs. Sem mudança de backend. Fase 2 (polimento visual) separada.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

## Self-Review (cobertura do spec)

- Roteamento por rotas reais → Tasks 2, 6. ✓
- Shell (sidebar desktop + bottom bar mobile + header global) → Tasks 3, 4, 5, 6. ✓
- `DashboardContext` (escopo/mês/banco + fetches unificados) → Task 1. ✓
- Reagrupamento das 6 seções → Tasks 7–11. ✓
- Tela Resumo curada → Task 12. ✓
- Casal/Minhas como escopo global → Task 1 (estado) + Task 4 (controle). ✓
- Persistência de filtro por escopo → Task 1 (`fin-dash-filter-couple`/`-my`). ✓
- Defaults do spec: banner só no Resumo (Task 12) ✓; filtro detalhado só em Transações (Task 11) ✓; "Mais" como bottom-sheet (Task 5) ✓.
- Sem testes automatizados / sem backend → constraints globais. ✓
- Limitação conhecida (investimentos por usuário) documentada → Task 8. ✓
