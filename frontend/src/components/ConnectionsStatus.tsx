import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { PluggyConnect } from "react-pluggy-connect";
import { api, type ItemStatus, type User } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { BankChip } from "@/components/BankChip";
import { ConnectBankButton } from "@/components/ConnectBankButton";
import { usePersistedState } from "@/lib/usePersistedState";

// Status "saudáveis" — qualquer outro (LOGIN_ERROR, WAITING_USER_INPUT, OUTDATED…) precisa de atenção.
const OK = new Set(["UPDATED", "UPDATING"]);

// "há X" a partir de um ISO, sem dependência (Intl nativo).
const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
function timeAgo(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return rtf.format(-min, "minute");
  const h = Math.round(min / 60);
  if (h < 24) return rtf.format(-h, "hour");
  return rtf.format(-Math.round(h / 24), "day");
}

const badge = (status: string) =>
  status === "UPDATED"
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
    : status === "UPDATING"
      ? "bg-muted text-muted-foreground"
      : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";

const plural = (n: number) => `${n} nova${n === 1 ? "" : "s"}`;

export function ConnectionsStatus({
  onSynced,
  users = [],
  userId = "",
}: {
  onSynced?: () => void;
  users?: User[]; // usuários (donos possíveis) para vincular um banco novo
  userId?: string; // dono padrão do novo banco (o do escopo atual)
}) {
  const [items, setItems] = useState<ItemStatus[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  // Dono escolhido para um novo banco; segue o padrão do escopo até ser trocado.
  const [ownerOverride, setOwnerOverride] = useState("");
  const owner = ownerOverride || userId;
  // Modo update do widget: MeuPluggy (proxy) só coleta de novo via re-autenticação.
  const [update, setUpdate] = useState<{ id: string; pluggyItemId: string; token: string } | null>(null);
  // Último lastChangeAt já visto por conexão (id → ISO). Novidade = mudou desde então.
  const [seen, setSeen] = usePersistedState<Record<string, string>>("fin-dash-conn-seen", {});

  const load = useCallback(() => {
    api.itemsStatus().then(setItems).catch(console.error);
  }, []);

  useEffect(() => load(), [load]);

  // Conexões com transação nova/alterada desde a última vez que o usuário viu.
  const news = useMemo(
    () => items.filter((i) => i.lastChangeAt && seen[i.id] !== i.lastChangeAt),
    [items, seen],
  );
  const hasNews = (i: ItemStatus) => Boolean(i.lastChangeAt) && seen[i.id] !== i.lastChangeAt;

  const markAllSeen = () => {
    const next = { ...seen };
    for (const i of news) if (i.lastChangeAt) next[i.id] = i.lastChangeAt;
    setSeen(next);
  };

  // Abre o widget em modo update para forçar a MeuPluggy a coletar do banco.
  const startUpdate = async (i: ItemStatus) => {
    setBusy(i.id);
    try {
      const { accessToken } = await api.connectToken(i.id);
      setUpdate({ id: i.id, pluggyItemId: i.pluggyItemId, token: accessToken });
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(null);
    }
  };

  // Após re-autenticar, re-puxa os dados agora atualizados para o nosso banco.
  const finishUpdate = async () => {
    const id = update?.id;
    setUpdate(null);
    if (id) {
      try {
        await api.syncItem(id);
      } catch (e) {
        console.error(e);
      }
    }
    load();
    onSynced?.();
  };

  const needAttention = items.filter((i) => !OK.has(i.status));

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Status das Conexões</CardTitle>
          <div className="flex items-center gap-2">
            {users.length > 1 && (
              <select
                aria-label="Dono do novo banco"
                value={owner}
                onChange={(e) => setOwnerOverride(e.target.value)}
                className="min-h-10 rounded-md border border-border/50 bg-card px-2 py-1.5 text-sm"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            )}
            <ConnectBankButton
              userId={owner}
              onConnected={() => {
                load();
                onSynced?.();
              }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {needAttention.map((i) => (
          <Alert key={i.id} variant="warning">
            A conexão com o {i.institution} precisa de atenção.
          </Alert>
        ))}

        {/* Novidades: transações novas/alteradas por banco desde a última visita. */}
        {news.length > 0 && (
          <Alert variant="info">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="eyebrow mb-1.5">Novidades desde sua última visita</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {news.map((i) => (
                    <BankChip
                      key={i.id}
                      institution={i.institution}
                      value={plural(i.lastChangeCount ?? 0)}
                    />
                  ))}
                </div>
              </div>
              <button
                onClick={markAllSeen}
                className="min-h-10 shrink-0 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand/90"
              >
                Marcar como visto
              </button>
            </div>
          </Alert>
        )}

        <ul className="divide-y divide-border/50">
          {items.map((i) => (
            <li
              key={i.id}
              className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-wrap items-center gap-2">
                <BankChip institution={i.institution} dotOnly />
                <span className="font-medium">{i.institution}</span>
                <span className="text-sm text-muted-foreground">· {i.owner}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge(i.status)}`}>
                  {i.status}
                </span>
                {hasNews(i) && (
                  <span className="ledger inline-flex items-center rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                    +{plural(i.lastChangeCount ?? 0)}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">· atualizado {timeAgo(i.updatedAt)}</span>
              </div>
              <button
                onClick={() => startUpdate(i)}
                disabled={busy === i.id}
                className="min-h-10 rounded-md border border-border/50 bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted/50 disabled:opacity-50"
              >
                {busy === i.id ? "Abrindo…" : "Sincronizar Agora"}
              </button>
            </li>
          ))}
          {items.length === 0 && (
            <li className="py-2 text-sm text-muted-foreground">Nenhuma conexão bancária.</li>
          )}
        </ul>
      </CardContent>
    </Card>

    {/* Fora do Card: o overlay do widget é position:fixed e o Card tem transform
        no hover, que criaria um containing block e prenderia o modal no card. */}
    {update &&
      createPortal(
        <PluggyConnect
          connectToken={update.token}
          updateItem={update.pluggyItemId}
          onSuccess={finishUpdate}
          onClose={() => setUpdate(null)}
          onError={() => setUpdate(null)}
        />,
        document.body,
      )}
    </>
  );
}
