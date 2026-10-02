import type { ImageAttachment } from './imageUtils'

// Unsaved chat images stay in the browser, outside the small localStorage chat record.
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('nexo-resolver-images-v1', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('images')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function storeResolverImages(userId: string, workspaceId: string, turnId: string, images: ImageAttachment[]) {
  const db = await database()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('images', 'readwrite')
      transaction.objectStore('images').put(images, `${userId}:${workspaceId}:${turnId}`)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  } finally { db.close() }
}

export async function loadResolverImages(userId: string, workspaceId: string, turnId: string): Promise<ImageAttachment[]> {
  const db = await database()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('images', 'readonly').objectStore('images').get(`${userId}:${workspaceId}:${turnId}`)
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : [])
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}

export async function clearResolverImages(userId: string, workspaceId: string, turnIds: string[]) {
  const db = await database()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('images', 'readwrite')
      for (const id of turnIds) transaction.objectStore('images').delete(`${userId}:${workspaceId}:${id}`)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  } finally { db.close() }
}

export async function pruneResolverImages(userId: string, workspaceId: string, activeTurnIds: string[]) {
  const db = await database()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('images', 'readwrite')
      const store = transaction.objectStore('images')
      const prefix = `${userId}:${workspaceId}:`
      const retained = new Set(activeTurnIds.map(id => `${prefix}${id}`))
      // Visit keys only; never read every image into memory.
      const request = store.openKeyCursor(IDBKeyRange.bound(prefix, `${prefix}\uffff`))
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return
        if (!retained.has(String(cursor.key))) store.delete(cursor.key)
        cursor.continue()
      }
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  } finally { db.close() }
}
