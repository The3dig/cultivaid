import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { must } from '../lib/care'
import { useLoad } from '../lib/hooks'
import { publicPlantUrl, qrDataUrl } from '../lib/qr'
import type { Plant } from '../lib/types'
import { ErrorBox } from '../components/ui'

export default function QrLabel() {
  const { id = '' } = useParams()
  const { data: plant, error, reload } = useLoad(
    async () => must(await supabase.from('plants').select('*').eq('id', id).single()) as Plant, [id])
  const [qr, setQr] = useState<string | null>(null)
  const [copias, setCopias] = useState(1)

  useEffect(() => {
    if (plant) qrDataUrl(publicPlantUrl(plant.codigo_publico)).then(setQr)
  }, [plant])

  if (!plant) return <main className="app"><ErrorBox error={error} /></main>

  async function tornarPublica() {
    must(await supabase.from('plants').update({ publica: true }).eq('id', plant!.id))
    reload()
  }

  return (
    <main className="app">
      <style>{`
        .label { width: 50mm; border: 1px dashed #999; border-radius: 4mm; padding: 3mm; text-align: center; background: #fff; color: #000; break-inside: avoid; }
        .label img { width: 40mm; height: 40mm; }
        .label .cod { font: 700 13pt ui-monospace, monospace; }
        .label .nome { font-size: 9pt; }
        .label .marca { font-size: 7pt; color: #2f6b3a; }
        .labels { display: flex; flex-wrap: wrap; gap: 4mm; }
        @page { margin: 10mm; }
      `}</style>
      <div className="no-print">
        <div className="topbar"><Link className="back" to={`/plantas/${plant.id}`}>←</Link><h1 className="grow">🔖 Etiqueta QR</h1></div>
        <p className="small muted">
          O QR Code leva ao endereço do registro <b>{plant.codigo_publico}</b>. As informações ficam no banco e podem ser
          atualizadas sem reimprimir. Se a etiqueta molhar ou se perder, basta reimprimir — o código da planta não muda.
        </p>
        {!plant.publica && (
          <div className="notice" style={{ marginBottom: 12 }}>
            A página pública desta planta está desativada: quem escanear verá “registro não público”.
            <div style={{ marginTop: 8 }}><button onClick={tornarPublica}>Ativar página pública</button></div>
          </div>
        )}
        <div className="row" style={{ marginBottom: 12 }}>
          <label htmlFor="copias" style={{ margin: 0 }}>Cópias</label>
          <input id="copias" type="number" min={1} max={30} value={copias} style={{ width: 80 }} onChange={(e) => setCopias(Math.max(1, Number(e.target.value)))} />
          <button className="primary" onClick={() => window.print()}>🖨️ Imprimir</button>
        </div>
        <p className="small muted">Dica: plastifique ou use fita transparente para proteger da água.</p>
      </div>
      <div className="labels">
        {Array.from({ length: copias }, (_, i) => (
          <div className="label" key={i}>
            <div className="marca">🌱 Jardim Vivo</div>
            {qr && <img src={qr} alt={`QR ${plant.codigo_publico}`} />}
            <div className="cod">{plant.codigo_publico}</div>
            <div className="nome">{plant.nome_comum}</div>
          </div>
        ))}
      </div>
    </main>
  )
}
