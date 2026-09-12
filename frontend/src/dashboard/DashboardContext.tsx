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
  currentUserId,
  EMPTY_FILTER,
  type TxFilter,
  type AccountFull,
  type Investment,
  type Transaction,
  type User,
} from "@/api";
import { usePersistedState } from "@/lib/usePersistedState";
import { sameChargeGroup } from "@/lib/installment";
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
  categories: string[];
  saveCategories: (names: string[]) => Promise<string[]>;
  reload: () => void;
  updateCategory: (id: string, categories: string[]) => void;
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
  // Abre no perfil logado (JWT). O dropdown do escopo "Minhas" segue trocando à vontade.
  const [userId, setUserId] = useState(currentUserId);
  const [ym, setYm] = useState(currentMonth);

  // Um filtro persistido por escopo; ambos os hooks são chamados sempre (regras de hooks).
  // v2: descarta o filtro salvo no shape antigo (categoria → categorias)
  const [filterCouple, setFilterCouple] = usePersistedState<TxFilter>("fin-dash-filter-couple-v2", EMPTY_FILTER);
  const [filterMy, setFilterMy] = usePersistedState<TxFilter>("fin-dash-filter-my-v2", EMPTY_FILTER);
  const filter = scope === "couple" ? filterCouple : filterMy;
  const setFilter = scope === "couple" ? setFilterCouple : setFilterMy;

  const [accounts, setAccounts] = useState<AccountFull[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    api
      .users()
      .then((us) => {
        setUsers(us);
        setUserId((prev) => prev || us[0]?.id || "");
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    api.categories().then(setCategories).catch(console.error);
  }, []);

  const saveCategories = useCallback(async (names: string[]) => {
    const saved = await api.saveCategories(names);
    setCategories(saved);
    return saved;
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

  // Usa scopedInvestments (não o cru): no escopo "Minhas" o dropdown não deve listar
  // banco que só existe nos investimentos do cônjuge.
  const banks = useMemo(
    () =>
      [
        ...new Set([
          ...accounts.map((a) => a.institution),
          ...scopedInvestments.map((i) => i.institution),
        ]),
      ].sort(),
    [accounts, scopedInvestments],
  );

  const updateCategory = useCallback(
    (id: string, categories: string[]) => {
      // Categoria(s) valem pra compra toda: atualiza otimista as parcelas do grupo (mesma
      // tolerância do backend); o servidor propaga igual via updateMany.
      setTransactions((prev) => {
        const target = prev.find((t) => t.id === id);
        if (!target) return prev;
        return prev.map((t) => (sameChargeGroup(t, target) ? { ...t, userCategories: categories } : t));
      });
      api.updateTransaction(id, { userCategories: categories }).catch((e) => {
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
    categories,
    saveCategories,
    reload,
    updateCategory,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
