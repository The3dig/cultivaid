import { supabase, PHOTO_BUCKET } from './supabase'
import { addDays, todayISO } from './dates'
import type { CareTipo, Plant, Saude, Species, Task } from './types'

export const CARE_TYPES: { tipo: CareTipo; icon: string; label: string }[] = [
  { tipo: 'rega', icon: '💧', label: 'Rega' },
  { tipo: 'adubação', icon: '🌿', label: 'Adubação' },
  { tipo: 'húmus', icon: '🪱', label: 'Húmus' },
  { tipo: 'poda', icon: '✂️', label: 'Poda' },
  { tipo: 'transplante', icon: '🪴', label: 'Transplante' },
  { tipo: 'floração', icon: '🌸', label: 'Floração' },
  { tipo: 'colheita', icon: '🧺', label: 'Colheita' },
  { tipo: 'tratamento', icon: '🧴', label: 'Tratamento' },
  { tipo: 'limpeza', icon: '🧹', label: 'Limpeza' },
  { tipo: 'outro', icon: '📌', label: 'Outro' },
]

export function careInfo(tipo: string) {
  return CARE_TYPES.find((c) => c.tipo === tipo) ?? { tipo, icon: '📌', label: tipo }
}

export const TASK_ICONS: Record<string, string> = {
  rega: '💧', adubação: '🌿', foto: '📸', avaliação: '🔎', colheita: '🧺', transplante: '🪴', poda: '✂️', outro: '📌',
}

/** Lança o erro do Supabase, se houver, e devolve os dados. */
export function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user.id
  if (!id) throw new Error('Sessão expirada. Entre novamente.')
  return id
}

/**
 * Agenda (ou reagenda) uma tarefa. Mantém no máximo uma tarefa aberta por
 * planta e tipo, para não acumular lembretes repetidos. Com keepEarlier,
 * uma tarefa aberta que vence antes é preservada (ex.: reavaliação urgente).
 */
export async function scheduleTask(
  plantId: string, tipo: string, titulo: string, venceEm: string, notas?: string, keepEarlier = false,
) {
  const open = must(
    await supabase.from('tasks').select('id, vence_em').eq('plant_id', plantId).eq('tipo', tipo).is('concluida_em', null).limit(1),
  )
  if (open?.length) {
    if (keepEarlier && open[0].vence_em <= venceEm) return
    must(await supabase.from('tasks').update({ titulo, vence_em: venceEm, notas: notas ?? null }).eq('id', open[0].id))
  } else {
    must(await supabase.from('tasks').insert({ plant_id: plantId, tipo, titulo, vence_em: venceEm, notas: notas ?? null }))
  }
}

export async function closeOpenTasks(plantId: string, tipo: string) {
  must(
    await supabase.from('tasks').update({ concluida_em: new Date().toISOString() })
      .eq('plant_id', plantId).eq('tipo', tipo).is('concluida_em', null),
  )
}

export async function completeTask(task: Task) {
  must(await supabase.from('tasks').update({ concluida_em: new Date().toISOString() }).eq('id', task.id))
}

export async function postponeTask(task: Task, days: number) {
  must(await supabase.from('tasks').update({ vence_em: addDays(todayISO(), days) }).eq('id', task.id))
}

function regaInterval(species: Species | null) {
  return species?.intervalo_verificacao_rega_dias ?? 2
}

/** Tarefas iniciais quando uma planta é cadastrada. */
export async function initialTasks(plant: Plant, species: Species | null) {
  const hoje = todayISO()
  await scheduleTask(plant.id, 'rega', 'Verificar umidade do substrato', addDays(hoje, 1),
    'Toque o substrato: regue só se os primeiros 2 cm estiverem secos.')
  await scheduleTask(plant.id, 'foto', 'Foto de acompanhamento', addDays(hoje, 7))
  if (species?.intervalo_adubacao_dias && plant.saude !== 'crítica') {
    await scheduleTask(plant.id, 'adubação', 'Avaliar adubação/húmus', addDays(hoje, species.intervalo_adubacao_dias))
  }
  if (species?.dias_ate_colheita && plant.data_plantio) {
    await scheduleTask(plant.id, 'colheita', 'Colheita estimada — verificar ponto',
      addDays(plant.data_plantio, species.dias_ate_colheita))
  }
  if (plant.saude === 'crítica') {
    await scheduleTask(plant.id, 'avaliação', 'Reavaliar planta debilitada', addDays(hoje, 2),
      'Primeiro estabilizar: luz, água e ventilação. Não presuma que adubo ou transplante resolvem.')
  }
}

/** Registra um cuidado e agenda o próximo lembrete coerente com ele. */
export async function logCare(
  plant: Plant, species: Species | null, tipo: CareTipo,
  opts: { quantidade?: string; notas?: string; data?: string } = {},
) {
  must(await supabase.from('care_events').insert({
    plant_id: plant.id, tipo,
    quantidade: opts.quantidade || null,
    notas: opts.notas || null,
    data: opts.data ?? new Date().toISOString(),
  }))

  const hoje = todayISO()
  switch (tipo) {
    case 'rega':
      await closeOpenTasks(plant.id, 'rega')
      await scheduleTask(plant.id, 'rega', 'Verificar umidade do substrato', addDays(hoje, regaInterval(species)),
        'Regue só se o substrato estiver seco ao toque.')
      break
    case 'adubação':
    case 'húmus':
      await closeOpenTasks(plant.id, 'adubação')
      if (plant.saude !== 'crítica') {
        await scheduleTask(plant.id, 'adubação', 'Avaliar adubação/húmus',
          addDays(hoje, species?.intervalo_adubacao_dias ?? 30))
      }
      break
    case 'transplante':
      await closeOpenTasks(plant.id, 'transplante')
      await scheduleTask(plant.id, 'avaliação', 'Avaliar adaptação após transplante', addDays(hoje, 5),
        'Murcha leve nos primeiros dias é normal. Evite adubar logo após o transplante.', true)
      break
    case 'poda':
      await closeOpenTasks(plant.id, 'poda')
      break
    case 'colheita':
      await closeOpenTasks(plant.id, 'colheita')
      break
  }
}

/** Redimensiona a foto no próprio aparelho antes de enviar (economiza dados). */
async function compressImage(file: File, maxSide = 1600): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.82))
  } catch {
    return file
  }
}

export async function uploadPhoto(plant: Plant, file: File, legenda?: string) {
  const uid = await currentUserId()
  const blob = await compressImage(file)
  const path = `${uid}/${plant.id}/${Date.now()}.jpg`
  must(await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg' }))
  const agora = new Date().toISOString()
  must(await supabase.from('plant_photos').insert({ plant_id: plant.id, storage_path: path, legenda: legenda || null, tirada_em: agora }))
  must(await supabase.from('plants').update({ foto_path: path, foto_em: agora }).eq('id', plant.id))
  await closeOpenTasks(plant.id, 'foto')
  await scheduleTask(plant.id, 'foto', 'Foto de acompanhamento', addDays(todayISO(), plant.saude === 'saudável' ? 14 : 7))
  return path
}

export async function addObservation(plant: Plant, texto: string, saude: Saude | null) {
  must(await supabase.from('observations').insert({ plant_id: plant.id, texto, saude }))
  if (saude && saude !== plant.saude) {
    must(await supabase.from('plants').update({ saude }).eq('id', plant.id))
  }
  if (saude === 'crítica') {
    // planta debilitada: suspende adubação até estabilizar
    await closeOpenTasks(plant.id, 'adubação')
    await scheduleTask(plant.id, 'avaliação', 'Reavaliar planta debilitada', addDays(todayISO(), 2),
      'Primeiro estabilizar: luz, água e ventilação. Não presuma que adubo ou transplante resolvem.')
  } else if (saude === 'atenção') {
    await scheduleTask(plant.id, 'avaliação', 'Reavaliar sinais de atenção', addDays(todayISO(), 4))
  } else if (saude === 'saudável') {
    await closeOpenTasks(plant.id, 'avaliação')
  }
}

/** Troca de vaso: o ID da planta é mantido e o histórico registra a mudança. */
export async function moveToContainer(plant: Plant, species: Species | null, toId: string | null, motivo: string) {
  must(await supabase.from('plant_container_history').insert({
    plant_id: plant.id, from_container_id: plant.container_id, to_container_id: toId, motivo: motivo || null,
  }))
  must(await supabase.from('plants').update({ container_id: toId }).eq('id', plant.id))
  if (plant.container_id) {
    await logCare(plant, species, 'transplante', { notas: motivo })
  }
}
