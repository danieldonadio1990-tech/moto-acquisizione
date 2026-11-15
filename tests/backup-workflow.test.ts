/**
 * Workflow di backup del database (.github/workflows/backup.yml): nessuna esecuzione, pianificata o manuale,
 * senza BACKUP_ENABLED=true; nessun bypass tramite workflow_dispatch; pianificazione esistente invariata.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const wf = readFileSync(".github/workflows/backup.yml", "utf8");
const ifLine = (wf.match(/^\s*if:\s*.+$/m) ?? [""])[0];

describe("workflow di backup: nessuna esecuzione senza BACKUP_ENABLED=true, nemmeno manuale", () => {
  test("il job gira solo sul ramo main", () => {
    assert.match(ifLine, /github\.ref\s*==\s*'refs\/heads\/main'/);
  });

  test("BACKUP_ENABLED assente o diverso da «true» blocca il job (confronto di stringa esatto, non truthy generico)", () => {
    assert.match(ifLine, /vars\.BACKUP_ENABLED\s*==\s*'true'/, "la condizione deve richiedere ESATTAMENTE 'true', non un valore qualunque");
  });

  test("il lancio manuale (workflow_dispatch) non aggira il controllo: nessun OR che lo esenti da BACKUP_ENABLED", () => {
    assert.doesNotMatch(ifLine, /workflow_dispatch/, "l'evento manuale non deve comparire nella condizione del job come scorciatoia");
    // le due clausole (ramo + variabile) devono essere in AND, non in un OR che le renda alternative
    assert.match(ifLine, /github\.ref\s*==\s*'refs\/heads\/main'\s*&&\s*vars\.BACKUP_ENABLED\s*==\s*'true'/);
  });

  test("la pianificazione esistente (cron notturno + trigger manuale dichiarato) resta invariata", () => {
    assert.match(wf, /cron:\s*"17 2 \* \* \*"/);
    assert.match(wf, /workflow_dispatch:\s*\{\}/);
  });
});
