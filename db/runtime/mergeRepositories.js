/**
 * Merge repository objects while preserving getters/setters.
 * Object.assign invokes getters once and copies static values — broken for live store data.
 */
export function mergeRepositories(...parts) {
  const target = {};
  for (const part of parts) {
    if (!part) continue;
    Object.defineProperties(target, Object.getOwnPropertyDescriptors(part));
  }
  return target;
}
