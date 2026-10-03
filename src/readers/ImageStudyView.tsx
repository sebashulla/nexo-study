import { useEffect, useState } from 'react'
import { signedSourceUrl } from '../lib/sourceRepository'
import { DocumentReader, type ReaderProps } from './DocumentReader'
export function ImageStudyView(props: ReaderProps) {
  const [url,setUrl] = useState(''), [error,setError] = useState('')
  useEffect(() => { let live = true; if (props.material.storagePath) void signedSourceUrl(props.material).then(value => { if (live) setUrl(value) }).catch(() => { if (live) setError('No pudimos abrir la imagen original. Reintenta con conexión.') }); return () => { live=false } },[props.material.storagePath])
  return <div className="image-study-reader">{url && <details className="reader-image" open><summary>Imagen original</summary><img src={url} alt={props.material.title}/></details>}{error && <p role="status">{error}</p>}{props.material.text && <><p className="utility-note">Contenido extraído por Nexo. Comprueba los detalles con el original.</p><DocumentReader {...props}/></>}</div>
}
