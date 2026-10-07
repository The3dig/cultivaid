import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { initialTasks, must, uploadPhoto } from '../lib/care'
import { todayISO } from '../lib/dates'
import { fetchContainers, fetchSpecies, useLoad } from '../lib/hooks'
import {
  DIFICULDADES, ESTAGIOS, SAUDES, STATUS_ID,
  type Plant, type Species,
} from '../lib/types'
import { ErrorBox, TopBar } from '../components/ui'

type Form = Omit<Plant, 'id' | 'codigo_publico' | 'created_at' | 'updated_at' | 'foto_path' | 'foto_em' | 'ativa' | 'encerrada_em' | 'motivo_encerramento'>

const EMPTY: Form = {
  nome_comum: '', nome_cientifico: null, species_id: null, confianca: null,
  status_identificacao: 'pendente', estagio: 'muda', saude: 'saudável', dificuldade: null,
  origem: null, data_plantio: todayISO(), ambiente: null, luminosidade: null, container_id: null,
  favorita: false, publica: false, notas: null,
}

export default function PlantForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [form, setForm] = useState<Form>(EMPTY)
  const [foto, setFoto] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lookups = useLoad(async () => ({ species: await fetchSpecies(), containers: await fetchContainers() }))

  useEffect(() => {
    if (!id) {
      const nome = params.get('nome')
      if (nome) {
        setForm((f) => ({
          ...f, nome_comum: nome, origem: params.get('origem'),
          data_plantio: params.get('plantio') || f.data_plantio,
        }))
      }
      return
    }
    supabase.from('plants').select('*').eq('id', id).single().then(({ data, error }) => {
      if (error) return setError(error.message)
      const { id: _id, codigo_publico: _c, created_at: _a, updated_at: _u, foto_path: _f, foto_em: _fe,
        ativa: _at, encerrada_em: _e, motivo_encerramento: _m, ...rest } = data as Plant
      setForm(rest)
    })
  }, [id, params])

  // Vindo da sementeira: pré-seleciona a espécie da célula
  const especieParam = params.get('especie')
  const speciesLoaded = Boolean(lookups.data)
  useEffect(() => {
    if (!id && especieParam && speciesLoaded) pickSpecies(especieParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, especieParam, speciesLoaded])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const txt = (k: keyof Form) => (e: { target: { value: string } }) => set(k, (e.target.value || null) as never)

  function pickSpecies(sid: string) {
    const sp = lookups.data?.species.find((s) => s.id === sid) as Species | undefined
    setForm((f) => ({
      ...f,
      species_id: sid || null,
      nome_comum: f.nome_comum || sp?.nome_comum || '',
      nome_cientifico: sp?.nome_cientifico ?? f.nome_cientifico,
      dificuldade: sp?.dificuldade ?? f.dificuldade,
      luminosidade: f.luminosidade ?? sp?.luminosidade ?? null,
      status_identificacao: sp && f.status_identificacao === 'pendente' ? 'confirmado' : f.status_identificacao,
    }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (id) {
        must(await supabase.from('plants').update(form).eq('id', id))
        nav(`/plantas/${id}`, { replace: true })
      } else {
        const plant = must(await supabase.from('plants').insert(form).select().single()) as Plant
        if (plant.container_id) {
          must(await supabase.from('plant_container_history').insert({
            plant_id: plant.id, to_container_id: plant.container_id, motivo: 'Cadastro inicial',
          }))
        }
        const sp = lookups.data?.species.find((s) => s.id === plant.species_id) ?? null
        await initialTasks(plant, sp)
        if (foto) await uploadPhoto(plant, foto, 'Foto do cadastro')
        const celula = params.get('celula')
        if (celula) {
          must(await supabase.from('seed_cells').update({ status: 'transplantada', plant_id: plant.id }).eq('id', celula))
        }
        nav(`/plantas/${plant.id}`, { replace: true })
      }
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  const species = lookups.data?.species ?? []
  const containers = (lookups.data?.containers ?? []).filter((c) => c.ativo || c.id === form.container_id)

  return (
    <>
      <TopBar title={id ? 'Editar planta' : 'Nova planta'} back />
      <form onSubmit={submit}>
        {!id && (
          <div className="field">
            <label>Foto (opcional)</label>
            <input type="file" accept="image/*" capture="environment" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
          </div>
        )}
        <div className="field">
          <label>Espécie do catálogo</label>
          <select value={form.species_id ?? ''} onChange={(e) => pickSpecies(e.target.value)}>
            <option value="">Não sei / outra</option>
            {species.map((s) => <option key={s.id} value={s.id}>{s.nome_comum}{s.nome_cientifico ? ` (${s.nome_cientifico})` : ''}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Nome comum *</label>
          <input required value={form.nome_comum} onChange={(e) => set('nome_comum', e.target.value)} placeholder="Ex.: Manjericão da varanda" />
        </div>
        <div className="field">
          <label>Nome científico</label>
          <input value={form.nome_cientifico ?? ''} onChange={txt('nome_cientifico')} />
        </div>
        <div className="two">
          <div className="field">
            <label>Identificação</label>
            <select value={form.status_identificacao} onChange={(e) => set('status_identificacao', e.target.value as Form['status_identificacao'])}>
              {STATUS_ID.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Confiança (%)</label>
            <input type="number" min={0} max={100} value={form.confianca ?? ''}
              onChange={(e) => set('confianca', e.target.value === '' ? null : Number(e.target.value))} />
          </div>
        </div>
        <div className="two">
          <div className="field">
            <label>Estágio</label>
            <select value={form.estagio} onChange={(e) => set('estagio', e.target.value as Form['estagio'])}>
              {ESTAGIOS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Saúde</label>
            <select value={form.saude} onChange={(e) => set('saude', e.target.value as Form['saude'])}>
              {SAUDES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="two">
          <div className="field">
            <label>Data de plantio</label>
            <input type="date" value={form.data_plantio ?? ''} onChange={txt('data_plantio')} />
          </div>
          <div className="field">
            <label>Dificuldade</label>
            <select value={form.dificuldade ?? ''} onChange={txt('dificuldade')}>
              <option value="">—</option>
              {DIFICULDADES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Vaso / recipiente</label>
          <select value={form.container_id ?? ''} onChange={txt('container_id')} disabled={Boolean(id)}>
            <option value="">Sem vaso definido</option>
            {containers.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.local ? ` — ${c.local}` : ''}</option>)}
          </select>
          {id && <div className="small muted">Para trocar de vaso use “Trocar vaso” na página da planta (fica no histórico).</div>}
        </div>
        <div className="field">
          <label>Origem</label>
          <input value={form.origem ?? ''} onChange={txt('origem')} placeholder="Semente, muda comprada, estaca, espontânea…" />
        </div>
        <div className="two">
          <div className="field">
            <label>Ambiente</label>
            <input value={form.ambiente ?? ''} onChange={txt('ambiente')} placeholder="Varanda, quintal, interno…" />
          </div>
          <div className="field">
            <label>Luminosidade no local</label>
            <input value={form.luminosidade ?? ''} onChange={txt('luminosidade')} placeholder="Sol da manhã, meia-sombra…" />
          </div>
        </div>
        <div className="field">
          <label>Notas</label>
          <textarea value={form.notas ?? ''} onChange={txt('notas')} />
        </div>
        <div className="field">
          <label className="check"><input type="checkbox" checked={form.favorita} onChange={(e) => set('favorita', e.target.checked)} /> Favorita</label>
          <label className="check"><input type="checkbox" checked={form.publica} onChange={(e) => set('publica', e.target.checked)} /> Página pública via QR Code</label>
        </div>
        <ErrorBox error={error ?? lookups.error} />
        <button className="primary block" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
      </form>
    </>
  )
}
