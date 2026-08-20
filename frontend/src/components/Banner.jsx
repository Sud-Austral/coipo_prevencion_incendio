import banner from '../assets/banner-conaf-incendios.jpg'

/**
 * Cabecera institucional CONAF / Unidad de Informacion y Analisis / Gerencia de
 * Proteccion contra Incendios Forestales.
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
 *
 * EL ALT NO ES DECORATIVO Y NO PUEDE ABREVIARSE. En movil el asset se pinta a
 * escala 0,3842 (1164,83 / 3032), asi que las tres lineas de «Gerencia de
 * proteccion contra incendios forestales» --15 a 19 px de alto en el archivo--
 * quedan en 5,8 px: estan en pantalla y NO se leen. Medido, no estimado.
 * Ese texto solo llega de verdad al usuario por aqui y por el <title>. Si
 * alguien recorta el alt a «CONAF», la unidad responsable del visor deja de
 * estar declarada en ninguna parte accesible.
 *
 * EL ARCHIVO IMPORTADO NO ES BYTE A BYTE EL DE INSUMO_GRAFICO, y es a proposito.
 * INSUMO_GRAFICO/3_banner_INCENDIOS.jpg pesa 73 858 B; este es el mismo pintado
 * reencodeado a quality=95, sin submuestreo de croma (4:4:4), progresivo y
 * optimizado: 37 596 B, o sea la mitad. El original queda intacto en
 * INSUMO_GRAFICO como procedencia, asi que no se pierde nada recuperable.
 *
 * MEDIDO, no supuesto:
 *   diferencia maxima por canal  9 de 255
 *   pixeles que difieren mas de 4   624 de 536 664 (0,12 %)
 *   campo verde plano  #064928 exacto y dispersion 0 en los dos: no hay costura
 *   a 1 Mbps y 150 ms de RTT, responseEnd del <img> baja de 7 111 a 6 495 ms
 * Y MIRADO: la marca ampliada x2 es indistinguible del original -- el arbol de
 * CONAF, el logotipo UIA, el filete vertical y las versalitas.
 *
 * El anexo de INSUMO_GRAFICO/implementacion_banner.md dice que «tampoco hace
 * falta reoptimizar»; esa frase se escribio sobre banner3.jpg, que pesaba 50 KB,
 * y el §4 del MISMO documento prescribe lo contrario para preparar un asset.
 * Si el banner vuelve a cambiar, rehaz el reencodeado: no es un paso del build.
 */
export default function Banner() {
  return (
    <header className="banner">
      <img
        src={banner}
        width={3032}
        height={177}
        alt="CONAF · Unidad de Información y Análisis · Gerencia de protección contra incendios forestales"
        fetchPriority="high"
        decoding="async"
        draggable={false}
      />
    </header>
  )
}
