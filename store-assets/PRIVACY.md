# Chrome Web Store privacy tab

Answers for the **Privacidad** tab of the store dashboard, in English. Copy
each block into the field named in its heading. Every answer matches the
0.2.0 manifest: `permissions: ['storage']`, `host_permissions` for
`art.gametdb.com` and `thumbnails.libretro.com`, and content scripts on
`hshop.erista.me/t/*`, `/c/*` and `/search/results*`. If a release changes
any of these, update this file before submitting it.

## Single purpose (Una sola finalidad)

### Single purpose description (Descripción de la finalidad única)

```text
Coverly Shelf shows box art and screenshots on 3DS game pages of hShop (hshop.erista.me): a cover next to each game's details, a screenshot gallery, and a cover thumbnail on every row of its game lists. Everything it does serves this one cosmetic purpose; it does not change downloads, links or how the site works.
```

## Permission justification (Justificación de permiso)

### storage justification (Justificación de storage)

```text
Used to cache, per game code, which artwork address worked (or that none did), so the next visit shows the cover at once without probing the image hosts again, and to save the user's one setting: how long cached artwork is kept (this session, 1 day, 7 days, 30 days or until cleared). The cache lives in the browser's extension storage on the device, is deleted when it expires or when the user clicks "Clear cache" on the settings page, and holds no personal data or browsing history.
```

### Host permission justification (Justificación de Permiso de host)

```text
The two image hosts are the artwork sources. art.gametdb.com serves 3DS and DS box art by product code, and thumbnails.libretro.com serves box art, title screens and in-game snaps by game name. Before loading an image, the extension sends a HEAD request to these hosts to check that it exists, so missing art is ruled out without downloading it and no broken image is shown. No other host is requested.

The content scripts match hshop.erista.me/t/*, /c/* and /search/results*: the title, listing and search pages where the covers and thumbnails are drawn. They read only the game title, product code and title ID shown on the page, and run on no other site.
```

### Remote code (¿Utilizas código remoto?)

Select **No, no estoy usando Código remoto**. Every script ships in the
package; the extension loads only images from the two hosts above and has no
`eval()`, no external `<script>` and no remote modules.

## Data usage (Uso de datos)

### What user data do you plan to collect? (¿Qué datos de usuario piensas recoger?)

**Leave every box unchecked.** Coverly Shelf collects none of these: it has no
server, analytics or telemetry, and nothing leaves the browser.

| Box | Checked | Why |
|---|---|---|
| Información de identificación personal | No | Never read or stored. |
| Información sanitaria | No | Never read or stored. |
| Datos financieros y de pagos | No | Never read or stored. |
| Información de autenticación | No | Never read or stored. |
| Comunicaciones personales | No | Never read or stored. |
| Ubicación | No | Never read. The image hosts see the browser's IP address as with any image request, but the extension does not collect it. |
| Historial web | No | It does not record which pages are visited. |
| Actividad del usuario | No | No click, scroll, key or network monitoring. |
| Contenido del sitio web | No | It reads the game's title, product code and title ID on hShop pages only to choose the artwork, and keeps only the product code with the artwork address in the local cache. Nothing is sent to the developer. |

### Certifications (Certifico que las siguientes afirmaciones son ciertas)

Check **all three**; each is true:

- [x] No vendo ni transfiero datos de usuario a terceros, fuera de los casos prácticos aprobados
- [x] No uso ni transfiero datos de usuario para fines no relacionados con la finalidad única de mi elemento
- [x] No uso ni transfiero datos de usuarios para determinar su situación crediticia ni para ofrecer préstamos

## Privacy policy (Política de Privacidad)

### Privacy policy URL (URL de la Política de Privacidad)

```text
https://coverly-shelf.maecly.com/en/privacy/
```

The same policy in Spanish is at `https://coverly-shelf.maecly.com/privacy/`.
Its source is `site/en/privacy/index.html` and `site/privacy/index.html` in
[MAECLY/coverly-shelf-landing](https://github.com/MAECLY/coverly-shelf-landing).
