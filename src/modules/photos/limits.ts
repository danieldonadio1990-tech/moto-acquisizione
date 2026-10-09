/**
 * Limiti delle foto, condivisi tra browser e server.
 *
 * Netlify Functions accettano al massimo 6 MB di payload e codificano i corpi binari in Base64 (+~33%):
 * il corpo reale utilizzabile è ~4,5 MB. Il browser comprime ogni foto (max 1800 px, JPEG) e le invia a
 * gruppi che restano sotto UPLOAD_BATCH_BYTES; 3,4 MB di richiesta diventano ~4,5 MB in Base64,
 * con margine sotto il tetto. Una foto da telefono compressa pesa tipicamente 0,3–1 MB.
 */
export const MAX_PHOTOS_PER_LEAD = 12;
/** Foto per singola richiesta */
export const MAX_FILES_PER_REQUEST = 3;
/** Peso massimo di una singola foto (dopo la compressione nel browser): deve stare in un gruppo da solo */
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
/** Tetto di un gruppo di foto inviato dal browser in una richiesta */
export const UPLOAD_BATCH_BYTES = 3 * 1024 * 1024;
/** Tetto del corpo di una richiesta lato server (margine per l'involucro multipart) */
export const MAX_UPLOAD_REQUEST_BYTES = Math.floor(3.4 * 1024 * 1024);
/** Tempo massimo per ricevere il corpo di una richiesta di upload */
export const UPLOAD_BODY_TIMEOUT_MS = 45_000;
