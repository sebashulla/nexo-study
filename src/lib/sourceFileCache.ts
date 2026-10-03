// Only pending originals live here. Synced originals belong in private Storage.
function database(): Promise<IDBDatabase> {
  return new Promise((resolve,reject) => { const request = indexedDB.open('nexo-pending-sources-v1',1)
    request.onupgradeneeded = () => request.result.createObjectStore('files')
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
}
export async function pendingSourceFile(userId: string, materialId: string, file?: File | null): Promise<File | undefined> {
  const db = await database()
  try { return await new Promise((resolve,reject) => {
    const tx = db.transaction('files',file === undefined ? 'readonly' : 'readwrite'), store = tx.objectStore('files'), key = `${userId}:${materialId}`
    const request = file === undefined ? store.get(key) : file === null ? store.delete(key) : store.put(file,key)
    let result: File | undefined
    request.onsuccess = () => { result = file === undefined ? request.result : undefined }
    tx.oncomplete = () => resolve(result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error)
  }) } finally { db.close() }
}
