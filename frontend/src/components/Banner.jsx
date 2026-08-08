import banner from '../assets/banner-conaf-uia.jpg'

/**
 * Cabecera institucional CONAF / Unidad de Informacion y Analisis.
 *
 * Un <header> que no esta dentro de article/aside/main/nav/section YA es el
 * landmark `banner`, asi que role="banner" sobra. El <header> del panel no
 * compite: va dentro de un <aside> y ahi no se promueve a landmark.
 *
 * Los atributos width/height con las medidas ORIGINALES no son decorativos: le
 * dan al navegador un aspect-ratio con el que reservar el alto en el layout,
 * antes de pedir un solo byte de la imagen. De eso depende que Leaflet mida
 * bien .mapa (el mapa se crea en un useEffect [] que corre despues del layout)
 * y que fitBounds encuadre igual en cada carga. Comprobado: con la imagen
 * bloqueada, la banda sigue midiendo 80 px a 1366. No los quites -- la
 * asercion A2 de scripts/verify-banner.mjs falla si desaparecen.
 *
 * Sin loading="lazy": esto esta sobre el pliegue. Sin enlace al inicio: es una
 * SPA de una sola vista. Sin titulo ni acciones a la derecha: ahi vive el
 * remate decorativo, y sus verdes (#5E8F19 3,88:1, #629D1C 3,30:1) no alcanzan
 * AA con texto normal.
 */
export default function Banner() {
  return (
    <header className="banner">
      <img
        src={banner}
        width={3032}
        height={177}
        alt="CONAF · Unidad de Información y Análisis"
        fetchPriority="high"
        decoding="async"
        draggable={false}
      />
    </header>
  )
}
