"use client";
import { listBrands, listModels, getModel, maxYear, MIN_YEAR, OTHER_MODEL_ID } from "@/modules/catalog";
import { Choices, SelectField, StepTitle, TextField } from "../ui";
import { OTHER_BRAND, type FunnelState } from "../state";

const FEATURED = ["Honda", "Piaggio", "Kymco"];

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
  const otherBrands = brands.filter((b) => !FEATURED.includes(b));
  const brandIsFeatured = FEATURED.includes(moto.brand);
  const brandChoice = brandIsFeatured ? moto.brand : moto.brand ? "__more" : "";
  const isFreeBrand = moto.brand === OTHER_BRAND;
  const models = moto.brand && !isFreeBrand ? listModels(moto.brand) : [];
  const catalogModel = getModel(moto.modelId);
  const years = Array.from({ length: maxYear() - MIN_YEAR + 1 }, (_, i) => maxYear() - i);

  const setBrand = (brand: string) => onChange({ brand, modelId: brand === OTHER_BRAND ? OTHER_MODEL_ID : "", displacement: "" });

  return (
    <>
      <StepTitle>Che moto hai?</StepTitle>
      <div className="space-y-8">
        <Choices
          legend="Marca"
          name="brand"
          columns={2}
          value={brandChoice}
          options={[...FEATURED.map((b) => ({ value: b, label: b })), { value: "__more", label: "Altra marca" }]}
          onChange={(v) => (v === "__more" ? onChange({ brand: otherBrands[0] ?? "", modelId: "", displacement: "" }) : setBrand(v))}
          error={!moto.brand ? errors.brand : undefined}
        />

        {brandChoice === "__more" && (
          <div className="step-in space-y-4">
            <SelectField label="Quale marca?" value={moto.brand} onChange={(e) => setBrand(e.target.value)}>
              {otherBrands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
              <option value={OTHER_BRAND}>Non è in elenco</option>
            </SelectField>
            {isFreeBrand && (
              <TextField
                label="Scrivi la marca"
                value={moto.brandOther}
                onChange={(e) => onChange({ brandOther: e.target.value })}
                error={errors.brandOther}
                autoComplete="off"
              />
            )}
          </div>
        )}

        {moto.brand && !isFreeBrand && (
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
