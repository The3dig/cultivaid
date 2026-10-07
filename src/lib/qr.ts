import QRCode from 'qrcode'

/** O QR Code só carrega o endereço do registro; os dados ficam no banco. */
export function publicPlantUrl(codigo: string) {
  return `${window.location.origin}/p/${codigo}`
}

export function qrDataUrl(text: string, size = 512) {
  return QRCode.toDataURL(text, { width: size, margin: 1, errorCorrectionLevel: 'M' })
}
