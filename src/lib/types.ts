export type Saude = 'saudável' | 'atenção' | 'crítica'
export type Estagio =
  | 'semente' | 'germinação' | 'muda' | 'crescimento'
  | 'floração' | 'frutificação' | 'colheita' | 'dormência'
export type StatusIdentificacao = 'ia' | 'confirmado' | 'pendente' | 'contestado'
export type Dificuldade = 'fácil' | 'média' | 'difícil'
export type CareTipo =
  | 'rega' | 'adubação' | 'húmus' | 'poda' | 'transplante'
  | 'colheita' | 'floração' | 'tratamento' | 'limpeza' | 'outro'
export type CellStatus = 'vazia' | 'plantada' | 'germinada' | 'perdida' | 'transplantada'

export const SAUDES: Saude[] = ['saudável', 'atenção', 'crítica']
export const ESTAGIOS: Estagio[] = [
  'semente', 'germinação', 'muda', 'crescimento', 'floração', 'frutificação', 'colheita', 'dormência',
]
export const STATUS_ID: StatusIdentificacao[] = ['pendente', 'confirmado', 'ia', 'contestado']
export const DIFICULDADES: Dificuldade[] = ['fácil', 'média', 'difícil']
export const CONTAINER_TIPOS = ['vaso', 'jardineira', 'canteiro', 'floreira', 'garrafa', 'saco de cultivo', 'outro']
export const CELL_STATUS: CellStatus[] = ['vazia', 'plantada', 'germinada', 'perdida', 'transplantada']

export interface Species {
  id: string
  owner_id: string | null
  nome_comum: string
  nome_cientifico: string | null
  familia: string | null
  descricao: string | null
  origem: string | null
  dificuldade: Dificuldade | null
  luminosidade: string | null
  rega: string | null
  intervalo_verificacao_rega_dias: number | null
  substrato: string | null
  adubacao: string | null
  intervalo_adubacao_dias: number | null
  temperatura: string | null
  poda: string | null
  transplante: string | null
  floracao: string | null
  colheita: string | null
  dias_ate_colheita: number | null
  pragas: string | null
  deficiencias: string | null
  estagios: string | null
  usos: string | null
  dica: string | null
}

export interface Container {
  id: string
  nome: string
  tipo: string
  tamanho: string | null
  volume_litros: number | null
  material: string | null
  local: string | null
  observacoes: string | null
  ativo: boolean
  created_at: string
}

export interface Plant {
  id: string
  codigo_publico: string
  nome_comum: string
  nome_cientifico: string | null
  species_id: string | null
  confianca: number | null
  status_identificacao: StatusIdentificacao
  estagio: Estagio
  saude: Saude
  dificuldade: Dificuldade | null
  origem: string | null
  data_plantio: string | null
  ambiente: string | null
  luminosidade: string | null
  container_id: string | null
  foto_path: string | null
  foto_em: string | null
  favorita: boolean
  publica: boolean
  ativa: boolean
  encerrada_em: string | null
  motivo_encerramento: string | null
  notas: string | null
  created_at: string
  updated_at: string
}

export interface PlantPhoto {
  id: string
  plant_id: string
  storage_path: string
  legenda: string | null
  tirada_em: string
}

export interface CareEvent {
  id: string
  plant_id: string
  tipo: CareTipo
  data: string
  quantidade: string | null
  notas: string | null
}

export interface Observation {
  id: string
  plant_id: string
  texto: string
  saude: Saude | null
  data: string
}

export interface ContainerMove {
  id: string
  plant_id: string
  from_container_id: string | null
  to_container_id: string | null
  data: string
  motivo: string | null
}

export interface Task {
  id: string
  plant_id: string | null
  tipo: string
  titulo: string
  vence_em: string
  concluida_em: string | null
  notas: string | null
  created_at: string
}

export interface SeedTray {
  id: string
  nome: string
  linhas: number
  colunas: number
  local: string | null
  observacoes: string | null
  created_at: string
}

export interface SeedCell {
  id: string
  tray_id: string
  linha: number
  coluna: number
  species_id: string | null
  semente: string | null
  data_plantio: string | null
  data_germinacao: string | null
  status: CellStatus
  plant_id: string | null
  observacoes: string | null
}
