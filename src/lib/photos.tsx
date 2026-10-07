import { useEffect, useState, type ImgHTMLAttributes } from 'react'
import { PHOTO_BUCKET, supabase } from './supabase'

/*
 * Fotos ficam em bucket PRIVADO. Para exibir, pedimos URLs assinadas
 * (válidas por 1 h), agrupando os pedidos de uma tela em uma só chamada.
 */
const TTL_S = 3600
const cache = new Map<string, { url: string; exp: number }>()
const waiting = new Map<string, ((url: string | null) => void)[]>()
let timer: ReturnType<typeof setTimeout> | undefined

async function flush() {
  timer = undefined
  const paths = [...waiting.keys()]
  const resolvers = new Map(waiting)
  waiting.clear()
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, TTL_S)
  const byPath = new Map((data ?? []).filter((d) => d.signedUrl && !d.error).map((d) => [d.path, d.signedUrl]))
  for (const p of paths) {
    const url = byPath.get(p) ?? null
    if (url) cache.set(p, { url, exp: Date.now() + (TTL_S - 120) * 1000 })
    for (const r of resolvers.get(p) ?? []) r(url)
  }
}

export function signedPhotoUrl(path: string): Promise<string | null> {
  const hit = cache.get(path)
  if (hit && hit.exp > Date.now()) return Promise.resolve(hit.url)
  return new Promise((resolve) => {
    waiting.set(path, [...(waiting.get(path) ?? []), resolve])
    timer ??= setTimeout(flush, 20)
  })
}

export function usePhotoUrl(path: string | null | undefined): string | null {
  const cached = path ? cache.get(path) : undefined
  const [url, setUrl] = useState<string | null>(cached && cached.exp > Date.now() ? cached.url : null)
  useEffect(() => {
    let alive = true
    if (!path) { setUrl(null); return }
    signedPhotoUrl(path).then((u) => { if (alive) setUrl(u) })
    return () => { alive = false }
  }, [path])
  return url
}

/** <img> de uma foto privada; mostra o fallback enquanto a URL não chega. */
export function Photo({ path, fallback = null, ...img }: { path: string | null | undefined; fallback?: React.ReactNode } & ImgHTMLAttributes<HTMLImageElement>) {
  const url = usePhotoUrl(path)
  if (!url) return <>{fallback}</>
  return <img src={url} {...img} />
}
