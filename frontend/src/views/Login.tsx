import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, token, type User } from "@/api";

export function Login() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    auth
      .users()
      .then((u) => {
        setUsers(u);
        setUserId(u[0]?.id ?? "");
      })
      .catch(() => setError("Não foi possível carregar os usuários."));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { token: jwt } = await auth.login(userId, pin);
      token.set(jwt);
      navigate("/", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-5 rounded-xl border border-border/50 bg-card p-6 shadow-sm"
      >
        <div>
          <h1 className="text-lg font-semibold tracking-tight">fin-dash</h1>
          <p className="text-sm text-muted-foreground">Entre com seu PIN para continuar.</p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Usuário</span>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full rounded-md border border-border/50 bg-card px-3 py-2 text-sm"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">PIN</span>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            className="w-full rounded-md border border-border/50 bg-card px-3 py-2 text-sm tracking-widest"
            placeholder="••••"
          />
        </label>

        {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

        <button
          type="submit"
          disabled={loading || !userId || !pin}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
