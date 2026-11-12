/** Only explicit separators identify distinct places. A city/state comma isn't one. */
export function summarizeJobLocation(location: string | null): string {
  if (!location?.trim()) return "Location not listed";
  const locations = [...new Set(location.split(/\s*[;|·]\s*|\r?\n/).map((value) => value.trim()).filter(Boolean))];
  if (!locations.length) return "Location not listed";
  if (locations.length === 1) return locations[0];
  const remaining = locations.length - 1;
  return `${locations[0]} +${remaining} ${remaining === 1 ? "location" : "locations"}`;
}
