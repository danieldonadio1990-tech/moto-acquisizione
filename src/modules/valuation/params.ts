import { z } from "zod";

/**
 * Parametri economici del motore. Sono DATI CONFIGURATI e approvati da un amministratore (tabella valuation_settings),
 * mai valori nel codice e mai inviati dal browser del cliente. Importi in centesimi, percentuali in punti base (100 bp = 1%).
 *
 *  - margine LORDO obiettivo: il guadagno che l'azienda vuole ottenere prima delle imposte (margin);
 *  - costi VARIABILI: proporzionali al valore di rivendita (sellingPctBp, contingencyPctBp, taxesPctBp);
 *  - costi FISSI per moto: trasporto, controlli, preparazione, pratiche, garanzia, altri.
 */
const cents = z.number().int().min(0).max(100_000_000);
const bp = (max = 10_000) => z.number().int().min(0).max(max);

export const valuationParamsSchema = z
  .object({
    resale: z.object({
      /** da quale statistica partire: la più prudente tra mediana e 25° percentile, o una sola */
      basis: z.enum(["median", "p25", "lower_of_median_p25"]),
      /** sconto prudenziale sul valore di mercato */
      haircutBp: bp(5000),
    }),
    /** riduzioni (bp del valore di rivendita) per le condizioni dichiarate */
    conditionAdjustmentsBp: z.object({
      notRunning: bp(5000),
      accident: bp(5000),
      mechanicalIssues: bp(5000),
      noRegularMaintenance: bp(5000),
    }),
    costs: z.object({
      transportCents: cents,
      inspectionCents: cents,
      preparationCents: cents,
      adminCents: cents,
      warrantyCents: cents,
      otherCents: cents,
      /** costi commerciali di vendita, % del valore di rivendita */
      sellingPctBp: bp(3000),
      /** riserva per imprevisti, % del valore di rivendita */
      contingencyPctBp: bp(3000),
      /** imposte e oneri proporzionali, % del valore di rivendita */
      taxesPctBp: bp(5000),
    }),
    margin: z.object({
      targetCents: cents,
      /** margine minimo come % del valore di rivendita (si applica il maggiore tra i due) */
      minPctBp: bp(5000),
    }),
    offer: z.object({
      minCents: cents,
      maxCents: cents,
      /** l'offerta si arrotonda per difetto a questo multiplo (es. 5000 = 50 €) */
      roundingStepCents: z.number().int().min(1).max(100_000),
    }),
    confidence: z.object({
      minOfferBp: bp(),
      minRangeBp: bp(),
      minSamples: z.number().int().min(1).max(10_000),
      maxMarketAgeDays: z.number().int().min(1).max(3650),
      /** (p75-p25)/mediana oltre il quale l'affidabilità scende */
      maxDispersionBp: bp(20_000),
      penaltyUnknownAnswerBp: bp(),
      penaltyFamilyMatchBp: bp(),
      penaltyAskingPriceBp: bp(),
    }),
    review: z.object({
      /** con queste condizioni dichiarate la valutazione è sempre manuale */
      manualIfAccident: z.boolean(),
      manualIfNotRunning: z.boolean(),
      manualIfMechanicalIssues: z.boolean(),
    }),
    range: z.object({
      /** la fascia indicativa va da (offerta massima − questa %) all'offerta massima */
      lowerBp: bp(5000),
    }),
    /**
     * Offerta automatica. SPENTA se manca (le versioni approvate prima di questo campo restano valide e senza automatismo).
     * Con autoOffer acceso, alla creazione della richiesta il motore crea da solo l'offerta (stato «Offerta fatta», NON comunicata
     * al cliente) ma solo per un risultato «offerta preliminare» che rispetta margine, tetti e soglie di affidabilità.
     */
    automation: z.object({ autoOffer: z.boolean() }).default({ autoOffer: false }),
  })
  .superRefine((p, ctx) => {
    const issue = (path: string[], message: string) => ctx.addIssue({ code: "custom", path, message });
    if (p.offer.minCents > p.offer.maxCents) issue(["offer", "minCents"], "Il minimo non può superare il massimo");
    if (p.confidence.minRangeBp > p.confidence.minOfferBp) {
      issue(["confidence", "minRangeBp"], "La soglia della fascia non può superare quella dell'offerta");
    }
    if (p.margin.targetCents <= 0 && p.margin.minPctBp <= 0) issue(["margin", "targetCents"], "Serve un margine obiettivo maggiore di zero");
    if (p.offer.maxCents <= 0) issue(["offer", "maxCents"], "Serve un tetto massimo di offerta maggiore di zero");
  });

export type ValuationParams = z.infer<typeof valuationParamsSchema>;

/**
 * BOZZA IPOTETICA: valori di partenza per compilare il modulo di configurazione, NON dati di mercato e NON approvati.
 * Gli importi di costo e margine ripetono l'esempio illustrativo (valore 5.000 €, costi 700 €, margine 800 € → massimo 3.500 €)
 * perché servono a vedere la formula funzionare; il proprietario deve sostituirli con i propri costi reali prima di approvare.
 * Il codice non usa mai questa bozza da sola: senza parametri APPROVATI il motore non produce nessuna offerta.
 */
export const HYPOTHETICAL_DRAFT_PARAMS: ValuationParams = {
  resale: { basis: "lower_of_median_p25", haircutBp: 0 },
  conditionAdjustmentsBp: { notRunning: 0, accident: 0, mechanicalIssues: 0, noRegularMaintenance: 0 },
  costs: {
    transportCents: 7_500,
    inspectionCents: 7_500,
    preparationCents: 35_000,
    adminCents: 0,
    warrantyCents: 0,
    otherCents: 20_000,
    sellingPctBp: 0,
    contingencyPctBp: 0,
    taxesPctBp: 0,
  },
  margin: { targetCents: 80_000, minPctBp: 0 },
  offer: { minCents: 20_000, maxCents: 500_000, roundingStepCents: 5_000 },
  confidence: {
    minOfferBp: 7_000,
    minRangeBp: 4_500,
    minSamples: 10,
    maxMarketAgeDays: 90,
    maxDispersionBp: 3_500,
    penaltyUnknownAnswerBp: 800,
    penaltyFamilyMatchBp: 1_500,
    penaltyAskingPriceBp: 1_500,
  },
  review: { manualIfAccident: true, manualIfNotRunning: true, manualIfMechanicalIssues: true },
  range: { lowerBp: 1_000 },
  automation: { autoOffer: false },
};
