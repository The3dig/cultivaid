import QRCode from 'qrcode'

/**
 * O QR Code só carrega o endereço do registro; os dados ficam no banco.
 * VITE_PUBLIC_URL fixa o endereço definitivo do app, para que etiquetas impressas
 * durante testes (localhost, IP da rede) não fiquem apontando para o lugar errado.
 */
export const PUBLIC_BASE = ((import.meta.env.VITE_PUBLIC_URL as string | undefined) || window.location.origin).replace(/\/+$/, '')

export const publicBaseIsLocal = /localhost|127\.0\.0\.1|^https?:\/\/(10|192\.168)\./.test(PUBLIC_BASE)

export function publicPlantUrl(codigo: string) {
  return `${PUBLIC_BASE}/p/${codigo}`
}

export function qrDataUrl(text: string, size = 512) {
  return QRCode.toDataURL(text, { width: size, margin: 1, errorCorrectionLevel: 'M' })
}
