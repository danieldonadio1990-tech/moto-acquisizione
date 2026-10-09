/**
 * Limiti delle foto, condivisi tra browser e server.
 *
 * Vercel accetta al massimo 4,5 MB per richiesta verso una funzione: il browser comprime ogni foto
 * (max 1800 px, JPEG) e le invia a gruppi che restano sotto UPLOAD_BATCH_BYTES. Una foto da telefono
 * compressa pesa tipicamente 0,3–1 MB.
 */
export const MAX_PHOTOS_PER_LEAD = 12;
/** Foto per singola richiesta */
export const MAX_FILES_PER_REQUEST = 3;
/** Peso massimo di una singola foto (dopo la compressione nel browser) */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
/** Tetto di un gruppo di foto inviato dal browser in una richiesta */
export const UPLOAD_BATCH_BYTES = 4 * 1024 * 1024;
/** Tetto del corpo di una richiesta lato server (margine per l'involucro multipart) */
export const MAX_UPLOAD_REQUEST_BYTES = Math.floor(4.4 * 1024 * 1024);
/** Tempo massimo per ricevere il corpo di una richiesta di upload */
export const UPLOAD_BODY_TIMEOUT_MS = 45_000;
