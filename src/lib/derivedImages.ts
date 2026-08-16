import manifest from '../../public/images/_derived/manifest.json';

export type DerivedOutput = {
  width: number;
  path: string;
  format: 'webp';
};

export type DerivedEntry = {
  sourcePath: string;
  sourceSha256: string;
  outputs: DerivedOutput[];
};

const bySource = new Map(
  (manifest.entries as DerivedEntry[]).map((entry) => [entry.sourcePath, entry]),
);

/** Public path of the original (`/images/...`), never a derived URL. */
export function getDerivedEntry(sourcePath: string): DerivedEntry | undefined {
  return bySource.get(sourcePath);
}

export function derivedSrcset(sourcePath: string): string | undefined {
  const entry = bySource.get(sourcePath);
  if (!entry?.outputs.length) return undefined;
  return entry.outputs.map((out) => `${out.path} ${out.width}w`).join(', ');
}

/** Largest derived file, or the original path if none exist yet. */
export function derivedSrc(sourcePath: string): string {
  const entry = bySource.get(sourcePath);
  if (!entry?.outputs.length) return sourcePath;
  return entry.outputs.reduce((best, out) => (out.width > best.width ? out : best)).path;
}
