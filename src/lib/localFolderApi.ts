/**
 * localFolderApi.ts
 * 
 * Utility untuk berkomunikasi dengan server lokal (server.cjs)
 * yang berjalan di http://localhost:3456.
 * 
 * Digunakan untuk membuat folder lokal dari web browser.
 */

const LOCAL_SERVER = 'http://localhost:3456';

export type FolderResult = {
  path: string;
  status: 'created' | 'exists' | 'error';
  message?: string;
};

/**
 * Cek apakah server lokal sedang aktif.
 */
export async function pingLocalServer(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_SERVER}/api/ping`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Buat sub-folder dengan nama `folderName` di setiap path dalam `basePaths`.
 * Mengembalikan array hasil per-path.
 */
export async function createLocalFolders(
  basePaths: string[],
  folderName: string
): Promise<FolderResult[]> {
  const filtered = basePaths.filter(p => p.trim());
  if (filtered.length === 0) return [];

  const res = await fetch(`${LOCAL_SERVER}/api/create-folders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ basePaths: filtered, folderName }),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Server error ${res.status}`);
  }

  const data = await res.json() as { results: FolderResult[] };
  return data.results;
}
