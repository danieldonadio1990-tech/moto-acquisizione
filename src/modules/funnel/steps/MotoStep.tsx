"use client";
import { listBrands, listModels, getModel, maxYear, MIN_YEAR, OTHER_MODEL_ID } from "@/modules/catalog";
import { Choices, SelectField, StepTitle, TextField } from "../ui";
import { OTHER_BRAND, type FunnelState } from "../state";

/** Valore della voce finale "Altro" tra le marche */
const OTHER_CHOICE = "__other";

type Moto = FunnelState["moto"];

export function MotoStep({
  moto,
  onChange,
  errors,
}: {
  moto: Moto;
  onChange: (patch: Partial<Moto>) => void;
  errors: Record<string, string>;
}) {
  const brands = listBrands();
  const isFreeBrand = moto.brand === OTHER_BRAND;
  const brandChoice = isFreeBrand ? OTHER_CHOICE : moto.brand;
  const models = moto.brand && !isFreeBrand ? listModels(moto.brand) : [];
  const catalogModel = getModel(moto.modelId);
  const years = Array.from({ length: maxYear() - MIN_YEAR + 1 }, (_, i) => maxYear() - i);

  // "Altro" o marca senza modelli in catalogo: marca/modello si scrivono a mano, senza dover scegliere un modello inesistente
  const setBrand = (brand: string) =>
    onChange({
      brand,
      modelId: brand === OTHER_BRAND || listModels(brand).length === 0 ? OTHER_MODEL_ID : "",
      modelOther: "",
      displacement: "",
    });

  return (
    <>
      <StepTitle>Che moto hai?</StepTitle>
      <div className="space-y-8">
        <Choices
          legend="Marca"
          name="brand"
          columns={2}
          value={brandChoice}
          options={[...brands.map((b) => ({ value: b, label: b })), { value: OTHER_CHOICE, label: "Altro" }]}
          onChange={(v) => setBrand(v === OTHER_CHOICE ? OTHER_BRAND : v)}
          error={!moto.brand ? errors.brand : undefined}
        />

        {isFreeBrand && (
          <div className="step-in">
            <TextField
              label="Scrivi la marca"
              value={moto.brandOther}
              onChange={(e) => onChange({ brandOther: e.target.value })}
              error={errors.brandOther}
              autoComplete="off"
            />
          </div>
        )}

        {moto.brand && !isFreeBrand && models.length > 0 && (
          <div className="step-in">
            <Choices
              legend="Modello"
              name="model"
              columns={models.length + 1 > 4 ? 3 : 2}
              value={moto.modelId}
              options={[...models.map((m) => ({ value: m.id, label: m.name })), { value: OTHER_MODEL_ID, label: "Altro" }]}
              onChange={(v) => onChange({ modelId: v, displacement: "" })}
              error={errors.modelId}
            />
          </div>
        )}

        {moto.modelId === OTHER_MODEL_ID && (
          <div className="step-in">
            <TextField
              label="Scrivi il modello"
              hint={moto.brand === "Piaggio" ? "Per una Vespa scrivi il nome completo, es. Vespa Primavera" : undefined}
              value={moto.modelOther}
              onChange={(e) => onChange({ modelOther: e.target.value })}
              error={errors.modelOther}
              autoComplete="off"
            />
          </div>
        )}

        {moto.modelId && (
          <div className="step-in space-y-8">
            {catalogModel && catalogModel.displacements.length > 1 ? (
              <Choices
                legend="Cilindrata"
                name="displacement"
                columns={catalogModel.displacements.length === 2 ? 2 : catalogModel.displacements.length >= 4 ? 4 : 3}
                value={moto.displacement}
                options={catalogModel.displacements.map((d) => ({ value: String(d), label: `${d} cc` }))}
                onChange={(v) => onChange({ displacement: v })}
                error={errors.displacement}
              />
            ) : !catalogModel ? (
              <TextField
                label="Cilindrata (cc)"
                inputMode="numeric"
                placeholder="es. 125"
                value={moto.displacement}
                onChange={(e) => onChange({ displacement: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                error={errors.displacement}
              />
            ) : null}

            <SelectField
              label="Anno di immatricolazione"
              value={moto.year}
              onChange={(e) => onChange({ year: e.target.value })}
              error={errors.year}
            >
              <option value="" disabled>
                Scegli l&apos;anno
              </option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </SelectField>

            <TextField
              label="Versione"
              hint="Facoltativa, se la conosci (es. ABS, Sport)"
              value={moto.version}
              onChange={(e) => onChange({ version: e.target.value })}
              autoComplete="off"
            />
          </div>
        )}
      </div>
    </>
  );
}

/** Dati moto → payload API (marca risolta, cilindrata unica auto-compilata). */
export function motoPayload(moto: Moto) {
  const model = getModel(moto.modelId);
  const displacement =
    moto.displacement || (model && model.displacements.length === 1 ? String(model.displacements[0]) : "");
  return {
    brand: moto.brand === OTHER_BRAND ? moto.brandOther.trim() : moto.brand,
    modelId: moto.modelId,
    modelOther: moto.modelOther.trim() || undefined,
    version: moto.version.trim() || undefined,
    year: moto.year,
    displacement: displacement || undefined,
  };
}
