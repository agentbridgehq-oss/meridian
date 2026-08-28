/** Ken finalize gate. Default STOP. Unknown is not yes. */
export const GO_AHEAD_PHRASE = "yes lets go ahead with this";

export function isKenGoAhead(input) {
  const raw = String(input?.phrase || input?.confirm || input || "").trim().toLowerCase();
  if (!raw) return false;
  const compact = raw.replace(/[^’'\w\s]/g, " ").replace(/\s+/g, " ").trim();
  return compact === "yes lets go ahead with this" || compact === "yes let's go ahead with this";
}
