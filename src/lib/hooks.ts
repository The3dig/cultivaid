import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import type { Container, Species } from './types'

/** Executa uma consulta assíncrona e expõe dados, erro e recarga. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps)

  // Só a resposta da chamada mais recente é aplicada: uma resposta antiga que
  // chegue depois (ex.: consulta feita antes do login) não sobrescreve a nova.
  const latest = useRef(0)
  const reload = useCallback(async () => {
    const call = ++latest.current
    setLoading(true)
    try {
      const result = await run()
      if (call !== latest.current) return
      setData(result)
      setError(null)
    } catch (e) {
      if (call !== latest.current) return
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (call === latest.current) setLoading(false)
    }
  }, [run])

  useEffect(() => { reload() }, [reload])

  return { data, error, loading, reload }
}

export async function fetchSpecies(): Promise<Species[]> {
  const { data, error } = await supabase.from('plant_species').select('*').order('nome_comum')
  if (error) throw new Error(error.message)
  return data as Species[]
}

export async function fetchContainers(): Promise<Container[]> {
  const { data, error } = await supabase.from('containers').select('*').order('nome')
  if (error) throw new Error(error.message)
  return data as Container[]
}
