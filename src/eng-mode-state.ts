/**
 * Session marker appended by `/eng-mode`. Eng-Advisor and the expert lens stay
 * off until this entry exists on the current branch, so ordinary sessions run
 * on the cheap default model with no background reviewer or classifier calls.
 */
export const ENG_MODE_ENTERED_TYPE = "dev.ajoslin.eng-mode.entered";

export interface EngModeSessionEntry {
  readonly type: string;
  readonly customType?: string;
}

export function engModeActive(branch: readonly EngModeSessionEntry[]): boolean {
  for (let index = branch.length - 1; index >= 0; index--) {
    const entry = branch[index];
    if (entry?.type === "custom" && entry.customType === ENG_MODE_ENTERED_TYPE) return true;
  }
  return false;
}
