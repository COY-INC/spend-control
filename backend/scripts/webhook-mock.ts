// Simula a Pluggy chamando nosso webhook: POST /pluggy/webhook com um evento
// de transações novas. O backend então baixa (mock) e faz upsert no Postgres.
// Requer o servidor rodando (`npm run dev`) e o seed aplicado (`npm run seed`).
import "dotenv/config";

const PORT = process.env.PORT || 3333;
// pluggyItemId criado pelo seed (usuário "Marido").
const itemId = process.argv[2] || "pluggy-item-marido";

async function main() {
  const res = await fetch(`http://localhost:${PORT}/pluggy/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "transactions/created", itemId }),
  });
  const body = await res.json();
  console.log(`HTTP ${res.status}`, body);
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error("Falha ao chamar o webhook (o servidor está rodando?):", e.message);
  process.exit(1);
});
