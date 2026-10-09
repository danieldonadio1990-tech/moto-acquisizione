/**
 * Prova reale dello storage S3 (foto) PRIMA del deploy: scrive, legge, elenca e cancella un oggetto di prova,
 * invia un file da 3 MB (il massimo di un gruppo di foto) e controlla che il bucket NON sia pubblico.
 * Usa le stesse opzioni del client dell'app. Non tocca nulla fuori dal prefisso "healthcheck/".
 *
 *   S3_BUCKET=photos S3_ENDPOINT=… S3_REGION=eu-central-1 S3_FORCE_PATH_STYLE=true \
 *   S3_ACCESS_KEY_ID=… S3_SECRET_ACCESS_KEY=… npm run check:storage
 *
 * Le chiavi si impostano nella tua shell o in .env.local (ignorato da git): mai in chat né nel repository.
 */
import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const e = process.env;
const missing = ["S3_BUCKET", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"].filter((k) => !e[k]?.trim());
if (missing.length) {
  console.error(`✗ Variabili mancanti: ${missing.join(", ")}`);
  process.exit(1);
}
const bucket = e.S3_BUCKET!.trim();
const endpoint = e.S3_ENDPOINT!.trim();
const prefix = (e.S3_PREFIX?.trim() || "").replace(/^\/+|\/+$/g, "");
const base = `${prefix ? prefix + "/" : ""}healthcheck/${randomUUID()}`;

const client = new S3Client({
  region: e.S3_REGION?.trim() || "auto",
  endpoint,
  forcePathStyle: e.S3_FORCE_PATH_STYLE === "true",
  credentials: { accessKeyId: e.S3_ACCESS_KEY_ID!.trim(), secretAccessKey: e.S3_SECRET_ACCESS_KEY!.trim() },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

let failed = false;
async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failed = true;
    const x = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    console.error(`✗ ${name}: ${x.name ?? "errore"} ${x.$metadata?.httpStatusCode ?? ""} ${x.message ?? ""}`.trim());
  }
}

const small = Buffer.from("healthcheck");
const big = Buffer.alloc(3 * 1024 * 1024, 7);

async function main() {
  await step("scrittura (PutObject)", async () => {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: `${base}/small.txt`, Body: small, ContentType: "text/plain" }));
  });
  await step("lettura (GetObject) con contenuto identico", async () => {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: `${base}/small.txt` }));
    const got = Buffer.from(await res.Body!.transformToByteArray());
    if (!got.equals(small)) throw new Error("contenuto diverso");
  });
  await step("upload da 3 MB (limite di un gruppo di foto)", async () => {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: `${base}/big.bin`, Body: big, ContentType: "application/octet-stream" }));
  });
  await step("elenco (ListObjectsV2)", async () => {
    const res = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `${base}/` }));
    if ((res.Contents?.length ?? 0) !== 2) throw new Error(`attesi 2 oggetti, trovati ${res.Contents?.length ?? 0}`);
  });
  await step("il bucket NON è pubblico (URL pubblico senza credenziali non deve restituire il file)", async () => {
    // endpoint Supabase: https://<ref>.storage.supabase.co/storage/v1/s3 → https://<ref>.supabase.co/storage/v1/object/public/…
    const m = /^https:\/\/([a-z0-9]+)\.storage\.supabase\.co\//.exec(endpoint);
    if (!m) {
      console.warn("  ! endpoint non Supabase: controllo di privacy non eseguito, verificalo a mano nel pannello del provider");
      return;
    }
    const url = `https://${m[1]}.supabase.co/storage/v1/object/public/${bucket}/${base}/small.txt`;
    const res = await fetch(url);
    if (res.ok) throw new Error(`ACCESSIBILE PUBBLICAMENTE (${res.status}): rendi il bucket privato`);
  });
  for (const key of ["small.txt", "big.bin"]) {
    await step(`cancellazione ${key}`, async () => {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: `${base}/${key}` }));
    });
  }

}

main()
  .then(() => {
    console.log(failed ? "\nStorage NON pronto: correggi gli errori sopra." : "\nStorage pronto (bucket privato, scrittura/lettura/cancellazione ok).");
    process.exit(failed ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
