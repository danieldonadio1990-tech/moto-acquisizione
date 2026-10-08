/**
 * Catalogo statico (MVP). In futuro sostituibile con un database/API di modelli
 * senza cambiare il resto: tutto passa da src/modules/catalog/index.ts.
 *
 * `family` raggruppa le varianti (es. tutti gli SH) ed è usata dalla Buy Box.
 */
export type CatalogModel = {
  id: string;
  brand: string;
  family: string;
  name: string;
  displacements: number[];
};

export const CATALOG: CatalogModel[] = [
  // Honda
  { id: "honda-sh", brand: "Honda", family: "SH", name: "SH", displacements: [125, 150, 300, 350] },
  { id: "honda-sh-mode", brand: "Honda", family: "SH Mode", name: "SH Mode", displacements: [125] },
  { id: "honda-pcx", brand: "Honda", family: "PCX", name: "PCX", displacements: [125, 150] },
  { id: "honda-forza", brand: "Honda", family: "Forza", name: "Forza", displacements: [125, 300, 350, 750] },
  { id: "honda-xadv", brand: "Honda", family: "X-ADV", name: "X-ADV", displacements: [750] },
  // Piaggio
  { id: "piaggio-liberty", brand: "Piaggio", family: "Liberty", name: "Liberty", displacements: [50, 125, 150] },
  { id: "piaggio-beverly", brand: "Piaggio", family: "Beverly", name: "Beverly", displacements: [300, 350, 400, 500] },
  { id: "piaggio-medley", brand: "Piaggio", family: "Medley", name: "Medley", displacements: [125, 150] },
  { id: "piaggio-mp3", brand: "Piaggio", family: "MP3", name: "MP3", displacements: [300, 400, 500, 530] },
  // Vespa
  { id: "vespa-primavera", brand: "Vespa", family: "Primavera", name: "Primavera", displacements: [50, 125, 150] },
  { id: "vespa-sprint", brand: "Vespa", family: "Sprint", name: "Sprint", displacements: [50, 125, 150] },
  { id: "vespa-gts", brand: "Vespa", family: "GTS", name: "GTS", displacements: [125, 300, 310] },
  // Kymco
  { id: "kymco-agility", brand: "Kymco", family: "Agility", name: "Agility", displacements: [50, 125, 150, 200] },
  { id: "kymco-people", brand: "Kymco", family: "People", name: "People S", displacements: [125, 150, 200, 300] },
  { id: "kymco-xtown", brand: "Kymco", family: "X-Town", name: "X-Town", displacements: [125, 300] },
  { id: "kymco-downtown", brand: "Kymco", family: "Downtown", name: "Downtown", displacements: [125, 300, 350] },
  // Yamaha
  { id: "yamaha-xmax", brand: "Yamaha", family: "X-MAX", name: "X-MAX", displacements: [125, 250, 300, 400] },
  { id: "yamaha-nmax", brand: "Yamaha", family: "NMAX", name: "NMAX", displacements: [125, 155] },
  { id: "yamaha-tmax", brand: "Yamaha", family: "T-MAX", name: "T-MAX", displacements: [500, 530, 560] },
  // SYM
  { id: "sym-symphony", brand: "SYM", family: "Symphony", name: "Symphony", displacements: [50, 125, 150, 200] },
  { id: "sym-jet", brand: "SYM", family: "Jet", name: "Jet 14", displacements: [50, 125, 200] },
  // Aprilia
  { id: "aprilia-srgt", brand: "Aprilia", family: "SR GT", name: "SR GT", displacements: [125, 200] },
  // Suzuki
  { id: "suzuki-burgman", brand: "Suzuki", family: "Burgman", name: "Burgman", displacements: [125, 200, 400, 650] },
  // BMW
  { id: "bmw-c400", brand: "BMW", family: "C 400", name: "C 400 X / GT", displacements: [350] },
];

/** Valore speciale per "il mio modello non c'è" */
export const OTHER_MODEL_ID = "other";
