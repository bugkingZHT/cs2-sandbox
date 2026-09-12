export const fileKey = (file: File) => file.name;

/** Picker and drop use the same accumulation, validation and duplicate rules. */
export function mergeImportFiles(current: File[], incoming: File[], knownNames: string[] = []) {
  const files = [...current];
  const seen = new Set(current.map(fileKey));
  const rejected: string[] = [];
  const duplicates: string[] = [], parsed: string[] = [];
  const known = new Set(knownNames);
  for (const file of incoming) {
    if (!/\.(dem|zip)$/i.test(file.name)) { rejected.push(file.name); continue; }
    const key = fileKey(file);
    if (known.has(key)) { parsed.push(file.name); continue; }
    if (seen.has(key)) { duplicates.push(file.name); continue; }
    files.push(file); seen.add(key);
  }
  return { files, rejected, duplicates, parsed };
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
