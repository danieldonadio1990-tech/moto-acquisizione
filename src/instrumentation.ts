/**
 * Eseguito una volta all'avvio di ogni istanza del server, prima di accettare richieste.
 * La logica vive in instrumentation-node.ts (solo runtime Node.js).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startup } = await import("./instrumentation-node");
    await startup();
  }
}
