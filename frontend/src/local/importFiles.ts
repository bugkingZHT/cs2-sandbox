export const fileKey = (file: File) => JSON.stringify([file.name, file.size, file.lastModified]);

/** Picker and drop use the same accumulation, validation and duplicate rules. */
export function mergeImportFiles(current: File[], incoming: File[]) {
  const files = [...current];
  const seen = new Set(current.map(fileKey));
  const rejected: string[] = [];
  for (const file of incoming) {
    if (!/\.(dem|zip)$/i.test(file.name)) { rejected.push(file.name); continue; }
    const key = fileKey(file);
    if (!seen.has(key)) { files.push(file); seen.add(key); }
  }
  return { files, rejected };
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
