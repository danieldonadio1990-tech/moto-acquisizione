"use client";
import { useCallback, useEffect, useState } from "react";

export type Tri = "yes" | "no" | "unknown";

export type FunnelState = {
  step: number;
  moto: {
    brand: string;
    /** brand non presente in catalogo, scritto a mano */
    brandOther: string;
    modelId: string;
    modelOther: string;
    version: string;
    year: string;
    displacement: string;
  };
  mileage: string;
  condition: {
    isRunning?: boolean;
    accident?: Tri;
    mechanicalIssues?: Tri;
    maintenance?: Tri;
  };
  contact: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    city: string;
    preferredContact: "whatsapp" | "phone" | "email";
    privacyConsent: boolean;
  };
  /** chiave di idempotenza dell'invio: generata al primo tentativo, riusata nei retry */
  submissionId?: string;
  /** valorizzato dopo l'invio dei contatti */
  lead?: { id: string; code: string; uploadToken: string };
  photosSent: number;
};

export const STEPS = ["Moto", "Km", "Condizioni", "Contatti", "Foto"] as const;
export const DONE_STEP = STEPS.length;

export const OTHER_BRAND = "__other_brand";

export const initialState: FunnelState = {
  step: 0,
  moto: { brand: "", brandOther: "", modelId: "", modelOther: "", version: "", year: "", displacement: "" },
  mileage: "",
  condition: {},
  contact: {
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    city: "",
    preferredContact: "whatsapp",
    privacyConsent: false,
  },
  photosSent: 0,
};

const KEY = "funnel-v1";

/** Stato del funnel salvato in sessionStorage: un refresh non fa perdere i dati inseriti. */
export function useFunnelState() {
  const [state, setState] = useState<FunnelState>(initialState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ripristino una tantum da storage
      if (saved) setState({ ...initialState, ...JSON.parse(saved) });
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }, [state, ready]);

  const update = useCallback((patch: Partial<FunnelState> | ((s: FunnelState) => Partial<FunnelState>)) => {
    setState((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) }));
  }, []);

  const reset = useCallback(() => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {}
    setState(initialState);
  }, []);

  return { state, update, reset, ready };
}
