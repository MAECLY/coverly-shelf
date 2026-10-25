<p align="center">
  <a href="https://coverly-shelf.maecly.com/"><img src="design/icon/app.svg" width="96" height="96" alt="Coverly Shelf"></a>
</p>

<h1 align="center">Cada juego en la estantería, con su portada.</h1>

<p align="center">
  <b>Coverly Shelf</b> es una extensión de navegador que añade carátulas y capturas a las páginas de juegos de 3DS en hShop.<br>
  Solo cambia el aspecto: nunca toca las descargas ni el funcionamiento del sitio.
</p>

<p align="center">
  <b>Gratis</b> · <b>Sin cuenta</b> · <b>Código abierto</b>
</p>

<p align="center">
  <a href="https://github.com/MAECLY/coverly-shelf/releases/latest"><img alt="Última versión" src="https://img.shields.io/github/v/release/MAECLY/coverly-shelf?style=flat-square&label=versi%C3%B3n&color=0E5E6F&labelColor=1B1E1B"></a>
  <a href="LICENSE"><img alt="Licencia: AGPL-3.0" src="https://img.shields.io/badge/licencia-AGPL--3.0-0E5E6F?style=flat-square&labelColor=1B1E1B"></a>
  <a href="#instalación"><img alt="Chrome, Edge y Brave" src="https://img.shields.io/badge/Chrome%20%C2%B7%20Edge%20%C2%B7%20Brave-MV3-0E5E6F?style=flat-square&labelColor=1B1E1B"></a>
  <a href="#por-qué-es-segura"><img alt="Sin telemetría" src="https://img.shields.io/badge/telemetr%C3%ADa-ninguna-0E5E6F?style=flat-square&labelColor=1B1E1B"></a>
</p>

<p align="center">
  <a href="https://coverly-shelf.maecly.com/"><b>Web</b></a> ·
  <a href="#instalación">Instalación</a> ·
  <a href="#por-qué-es-segura">Seguridad</a> ·
  <a href="#desarrollo">Desarrollo</a> ·
  <a href="https://github.com/MAECLY/coverly-roms">Coverly ROMs</a> ·
  <a href="README.md">English</a> · <b>Español</b>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/title-1814-dark-1440.png">
    <img src="docs/screenshots/title-1814-light-1440.png" width="100%" alt="La página de hShop de Batman - Arkham Origins Blackgate con Coverly Shelf instalada. La caja del juego aparece a la derecha de la tabla técnica, algo girada para que se vea el lomo, con el crédito “Art: GameTDB” debajo. Bajo la descripción, una sección Screenshots muestra dos capturas del juego con crédito a Libretro.">
  </picture>
</p>

> [!NOTE]
> **Primeros pasos, dicho claro.** Coverly Shelf 0.1.0 mejora solo las páginas
> de cada título (`/t/…`); los listados vienen después. Está probada de punta a
> punta en Chromium sobre el sitio real, todavía no en Firefox. Si una página se
> ve mal, abrir un [issue](https://github.com/MAECLY/coverly-shelf/issues) con
> su URL ayuda mucho.

---

## Qué hace

**Una caja para cada juego.** En la página de un título, la portada aparece
junto a la tabla técnica como una pequeña caja en 3D, girada para que se vea el
lomo. Sigue el tema claro u oscuro de hShop y, en el móvil, se coloca encima de
la tabla.

**Capturas, cuando las hay.** Bajo la descripción, una sección de capturas
muestra la pantalla de título y escenas del juego. Al pulsar una se abre en
grande: las flechas izquierda y derecha pasan de una a otra, Esc cierra y el
foco no sale del visor hasta que lo cierras.

**Primero la región correcta.** La portada sale de la región del propio juego
(leída de su código de producto, por ejemplo `CTR-P-AZEE` → EE. UU.), después
de las otras regiones en inglés y después de las carátulas de Libretro. Si no
hay nada, ocupa su sitio una portada sencilla con las iniciales del juego, así
la página nunca muestra una imagen rota.

**También los juegos solo digitales.** Los juegos de eShop (`CTR-N-…`) tienen
su portada; la extensión se salta los tipos de imagen que solo existen para
ediciones en caja.

**Créditos en la página.** Cada imagen dice de dónde sale (“Art: GameTDB”,
“Art: Libretro”).

**Discreta y rápida.** La portada elegida y la lista de capturas se guardan en
caché 7 días, fallos incluidos, así que una segunda visita no hace peticiones
nuevas y no se vuelve a pedir lo que no existe. Nunca hay más de 4 peticiones
de imagen a la vez.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/lightbox-1440.png" alt="El visor de capturas abierto sobre la página, con la pantalla de título de Batman en grande, flechas de anterior y siguiente y el contador “1 / 2”."></td>
    <td width="50%"><img src="docs/screenshots/title-digital-18761-1440.png" alt="La página de hShop de 3D Classics Excitebike, un juego solo digital, con su caja junto a la tabla técnica."></td>
  </tr>
  <tr>
    <td align="center"><sub>El visor de capturas</sub></td>
    <td align="center"><sub>Un juego solo digital (3D Classics Excitebike)</sub></td>
  </tr>
</table>

## Por qué es segura

- **Solo aspecto.** Añade dos elementos a la página, cada uno en su propio
  shadow root, más la marca `data-hshop-enhanced`, y nada más. No lee, cambia
  ni pulsa los botones de descarga, el código QR ni ningún enlace. Si algo
  falla (cambió la maquetación, falta una imagen, no hay red), quita lo que
  añadió y la página queda exactamente como estaba.
- **Permisos mínimos.** El manifiesto pide `storage` (la caché de 7 días) y
  acceso solo a dos servidores de imágenes: `art.gametdb.com` y
  `thumbnails.libretro.com`. El content script solo se ejecuta en
  `hshop.erista.me/t/*`. Sin `tabs`, sin `<all_urls>`, sin acceso a otros
  sitios.
- **Sin rastreo.** Sin analítica, sin telemetría, sin cuenta y sin servidor
  propio. Las únicas peticiones que hace son imágenes de esos dos servidores. La
  tabla que relaciona códigos de producto con nombres de Libretro va dentro de
  la extensión.
- **Código abierto.** Todo el código está aquí, bajo la AGPL-3.0.

## Instalación

Coverly Shelf aún no está en la Chrome Web Store. Se instala desde una versión
publicada:

1. Descarga `coverly-shelf-<versión>-chrome.zip` de la
   [última versión](https://github.com/MAECLY/coverly-shelf/releases/latest) y
   descomprímelo.
2. Abre `chrome://extensions` (o `edge://extensions`, `brave://extensions`) y
   activa el **Modo de desarrollador**.
3. Pulsa **Cargar descomprimida** y elige la carpeta descomprimida.
4. Abre cualquier juego en [hShop](https://hshop.erista.me/), por ejemplo una
   página bajo `/t/`.

Para actualizar, descomprime la nueva versión sobre la misma carpeta y pulsa el
botón de recargar en la tarjeta de la extensión.

## Desarrollo

Necesitas [Bun](https://bun.sh/) 1.4 o posterior y Chrome o Chromium.

```sh
bun install            # instala las dependencias (también ejecuta `wxt prepare`)
bun run dev            # abre Chrome con la extensión cargada y recarga en vivo
bun run check          # tipos, tests unitarios (vitest + happy-dom) y build de producción
bun run build          # genera .output/chrome-mv3
bun run zip            # genera el zip de la versión en .output/
bun run gen:libretro   # regenera public/libretro-3ds.json desde libretro-database
bun run e2e            # compila y prueba la extensión en el sitio real con Playwright
bun scripts/icons.ts   # vuelve a generar public/icon/*.png desde design/icon/
```

Para probar un build en tu navegador de siempre: ejecuta `bun run build`, abre
`chrome://extensions`, activa el **Modo de desarrollador**, pulsa **Cargar
descomprimida** y elige `.output/chrome-mv3`. Tras recompilar, pulsa el botón de
recargar en la tarjeta.

`bun run e2e` necesita red: carga páginas reales de hShop e imágenes reales.
Guarda las capturas en [docs/screenshots](docs/screenshots). Con
`E2E_HEADED=1` ves la ventana mientras corre.

Hay builds para Firefox (`bun run build:firefox`), pero no están probados ni
listos para AMO.

### Arquitectura

```
extract  →  sources  →  resolver  →  ui
```

| Paso | Archivos | Qué hace |
|---|---|---|
| **extract** | `src/lib/extract.ts`, `selectors.ts` | Lee de la página el título, el código de producto, el Title ID y la región. Sin código de producto (temas, homebrew) no hay nada que hacer. |
| **sources** | `src/lib/sources/gametdb.ts`, `libretro.ts`, `public/libretro-3ds.json` | Convierte un juego en URLs de imagen ordenadas: portadas de GameTDB por región y carátulas, pantallas de título y capturas de Libretro por nombre No-Intro. |
| **resolver** | `src/lib/resolver.ts`, `probe.ts`, `queue.ts`, `cache.ts` | Prueba los candidatos en orden (gana el primero que existe, como mucho 4 a la vez) y guarda el resultado 7 días. |
| **ui** | `src/ui/*`, `src/entrypoints/title.content/` | Dibuja la caja, la portada de reserva, la galería y el visor en shadow roots, con los colores del propio hShop. |

El service worker (`src/entrypoints/background.ts`) responde a dos mensajes:
los nombres de Libretro de un código de producto y una descarga de imagen que
queda de reserva para el día en que hShop añada una Content Security Policy
(`IMAGE_MODE` en `src/lib/config.ts`).

Cada selector, color y patrón de URL que usa el código está anotado en
[docs/REFERENCE.md](docs/REFERENCE.md). Lo que aún hay que comprobar en el sitio
real está en [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md).

**Siguiente paso:** portadas en los listados (`/c/…`), con el mismo resolver.

## Créditos

- [GameTDB](https://www.gametdb.com/), por las portadas de 3DS.
- [Libretro](https://www.libretro.com/):
  [libretro-thumbnails](https://github.com/libretro-thumbnails/libretro-thumbnails)
  por las carátulas, pantallas de título y capturas, y
  [libretro-database](https://github.com/libretro/libretro-database) por los
  nombres No-Intro que hay detrás.
- [WXT](https://wxt.dev/), [Tailwind CSS](https://tailwindcss.com/),
  [Vitest](https://vitest.dev/) y [Playwright](https://playwright.dev/).

Las imágenes se cargan desde sus servidores al ver la página; la extensión no
incluye ninguna. El arte de los juegos pertenece a sus dueños. hShop no tiene
relación con este proyecto. Fuentes, patrones de URL y qué se verificó:
[docs/REFERENCE.md](docs/REFERENCE.md).

## Licencia

Coverly Shelf es software libre, con licencia
[GNU Affero General Public License v3.0 only](LICENSE) (`AGPL-3.0-only`).
Copyright © 2026 Miguel Angel Esparza Calero (MAECLY).

Forma parte de la familia Coverly. Su hermana,
[Coverly ROMs](https://github.com/MAECLY/coverly-roms), rellena las portadas que
faltan en la tarjeta SD de tu consola portátil.

---

<p align="center">
  <sub>Hecho por Miguel Angel Esparza Calero · <a href="https://coverly-shelf.maecly.com/">coverly-shelf.maecly.com</a></sub>
</p>
