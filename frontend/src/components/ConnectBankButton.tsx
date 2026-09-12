import { useState } from "react";
import { PluggyConnect } from "react-pluggy-connect";
import { api } from "@/api";
import { Button } from "@/components/ui/button";

// Conectores permitidos no widget. Ex.: "200" = Meu Pluggy (uso pessoal gratuito).
// Vazio = mostra todos os conectores (fluxo de produção, pago).
const CONNECTOR_IDS = String(import.meta.env.VITE_PLUGGY_CONNECTOR_IDS ?? "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

// Abre o fluxo PluggyConnect e, ao conectar, salva o Item novo vinculado ao usuário ativo.
export function ConnectBankButton({
  userId,
  onConnected,
}: {
  userId: string;
  onConnected?: () => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function openConnect() {
    setLoading(true);
    try {
      const { accessToken } = await api.connectToken();
      setToken(accessToken);
    } catch (e) {
      alert("Falha ao obter token de conexão: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSuccess(data: { item: { id: string } }) {
    try {
      await api.saveItem(data.item.id, userId);
      onConnected?.();
    } catch (e) {
      alert("Conta conectada, mas falha ao salvar: " + (e as Error).message);
    } finally {
      setToken(null);
    }
  }

  return (
    <>
      <Button onClick={openConnect} disabled={loading || !userId}>
        {loading ? "Abrindo…" : "+ Conectar banco"}
      </Button>
      {token && (
        <PluggyConnect
          connectToken={token}
          connectorIds={CONNECTOR_IDS.length ? CONNECTOR_IDS : undefined}
          onSuccess={handleSuccess}
          onClose={() => setToken(null)}
          onError={() => setToken(null)}
        />
      )}
    </>
  );
}
