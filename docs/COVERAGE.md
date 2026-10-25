# Listing coverage

Live sweep of every hShop listing page with `bun run e2e:lists` (first page of each listing, built extension at `794d732` on `feat/queue`, 2026-10-25). The sweep passed every check: at most 4 artwork requests and 2 hShop lookups in flight on any page, never an hShop cooldown.

Columns: **rows** = title rows of the main list; **coded** = rows with a usable product code; **images** = thumbnails showing verified box art; **placeholders** = coded rows showing the placeholder; **Top content** = rows of the "Top content" box (thumbnails only resolve once scrolled into view); **lookups** = hShop `/t/{id}` lookups. Themes get no thumbnail by design. Art % = images / coded.

## Totals

| Pages | Rows | Coded | Images | Placeholders | Art % | Top rows | Top thumbnails | Top images | Top placeholders |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 90 | 1114 | 1026 | 777 | 249 | 76% | 2203 | 1990 | 367 | 99 |

## Targeted pages (coverage floors enforced by the sweep)

| Page | Coded rows | GameTDB | Libretro | Placeholder | Art | Floor |
|---|---|---|---|---|---|---|
| /c/virtual-console/s/north-america | 25 | 24 | 1 | 0 | 25 (100%) | 92% |
| /c/updates/s/france | 7 | 7 | 0 | 0 | 7 (100%) | 85% |
| /c/dlc/s/japan | 25 | 19 | 0 | 6 | 19 (76%) | 70% |
| /c/dsiware/s/north-america | 25 | 25 | 0 | 0 | 25 (100%) | 92% |

## Per page

| Page | Rows | Coded | Images | Placeholders | Art % | Top rows | Top thumbnails | Top images | Top placeholders | Lookups |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `/c/games` | 0 | 0 | 0 | 0 | — | 50 | 50 | 6 | 0 | 6 |
| `/c/games/s/australia` | 4 | 4 | 4 | 0 | 100% | 4 | 4 | 4 | 0 | 0 |
| `/c/games/s/canada` | 2 | 2 | 1 | 1 | 50% | 2 | 2 | 1 | 1 | 0 |
| `/c/games/s/china` | 2 | 2 | 0 | 2 | 0% | 2 | 2 | 0 | 2 | 0 |
| `/c/games/s/digital-demos` | 25 | 25 | 21 | 4 | 84% | 50 | 50 | 6 | 0 | 6 |
| `/c/games/s/europe` | 25 | 25 | 25 | 0 | 100% | 50 | 50 | 6 | 0 | 6 |
| `/c/games/s/france` | 25 | 25 | 25 | 0 | 100% | 50 | 50 | 6 | 0 | 4 |
| `/c/games/s/germany` | 25 | 25 | 25 | 0 | 100% | 27 | 27 | 6 | 0 | 1 |
| `/c/games/s/italy` | 10 | 10 | 10 | 0 | 100% | 10 | 10 | 6 | 0 | 0 |
| `/c/games/s/japan` | 25 | 25 | 14 | 11 | 56% | 50 | 50 | 48 | 2 | 49 |
| `/c/games/s/kiosk-demos` | 25 | 25 | 23 | 2 | 92% | 50 | 50 | 6 | 0 | 2 |
| `/c/games/s/korea` | 25 | 25 | 24 | 1 | 96% | 50 | 50 | 6 | 0 | 5 |
| `/c/games/s/netherlands` | 2 | 2 | 2 | 0 | 100% | 2 | 2 | 2 | 0 | 0 |
| `/c/games/s/north-america` | 25 | 25 | 22 | 3 | 88% | 50 | 50 | 6 | 0 | 6 |
| `/c/games/s/russia` | 1 | 1 | 1 | 0 | 100% | 1 | 1 | 1 | 0 | 0 |
| `/c/games/s/spain` | 15 | 15 | 15 | 0 | 100% | 15 | 15 | 6 | 0 | 0 |
| `/c/games/s/taiwan` | 25 | 25 | 24 | 1 | 96% | 50 | 50 | 6 | 0 | 6 |
| `/c/games/s/united-kingdom` | 1 | 1 | 1 | 0 | 100% | 1 | 1 | 1 | 0 | 0 |
| `/c/games/s/unknown-other` | 25 | 25 | 1 | 24 | 4% | 49 | 49 | 0 | 6 | 3 |
| `/c/games/s/world` | 25 | 25 | 22 | 3 | 88% | 27 | 27 | 6 | 0 | 0 |
| `/c/updates` | 0 | 0 | 0 | 0 | — | 50 | 50 | 6 | 0 | 6 |
| `/c/updates/s/australia` | 3 | 3 | 3 | 0 | 100% | 3 | 3 | 3 | 0 | 0 |
| `/c/updates/s/demo-updates` | 1 | 1 | 0 | 1 | 0% | 1 | 1 | 0 | 1 | 0 |
| `/c/updates/s/europe` | 25 | 25 | 25 | 0 | 100% | 50 | 50 | 6 | 0 | 5 |
| `/c/updates/s/france` | 7 | 7 | 7 | 0 | 100% | 7 | 7 | 6 | 0 | 0 |
| `/c/updates/s/germany` | 4 | 4 | 4 | 0 | 100% | 4 | 4 | 4 | 0 | 0 |
| `/c/updates/s/italy` | 5 | 5 | 5 | 0 | 100% | 5 | 5 | 5 | 0 | 0 |
| `/c/updates/s/japan` | 25 | 25 | 22 | 3 | 88% | 50 | 50 | 5 | 0 | 5 |
| `/c/updates/s/korea` | 25 | 25 | 24 | 1 | 96% | 29 | 29 | 6 | 0 | 1 |
| `/c/updates/s/north-america` | 25 | 25 | 25 | 0 | 100% | 50 | 50 | 6 | 0 | 2 |
| `/c/updates/s/spain` | 7 | 7 | 7 | 0 | 100% | 7 | 7 | 6 | 0 | 0 |
| `/c/updates/s/taiwan` | 9 | 9 | 9 | 0 | 100% | 9 | 9 | 6 | 0 | 0 |
| `/c/updates/s/unknown-other` | 1 | 1 | 0 | 1 | 0% | 1 | 1 | 0 | 1 | 0 |
| `/c/updates/s/world` | 13 | 13 | 11 | 2 | 85% | 13 | 13 | 6 | 0 | 0 |
| `/c/dlc` | 0 | 0 | 0 | 0 | — | 50 | 50 | 6 | 0 | 6 |
| `/c/dlc/s/australia` | 1 | 1 | 1 | 0 | 100% | 1 | 1 | 1 | 0 | 0 |
| `/c/dlc/s/china` | 1 | 1 | 1 | 0 | 100% | 1 | 1 | 1 | 0 | 0 |
| `/c/dlc/s/europe` | 25 | 25 | 25 | 0 | 100% | 50 | 50 | 6 | 0 | 4 |
| `/c/dlc/s/france` | 1 | 1 | 1 | 0 | 100% | 1 | 1 | 1 | 0 | 0 |
| `/c/dlc/s/germany` | 1 | 1 | 1 | 0 | 100% | 1 | 1 | 1 | 0 | 0 |
| `/c/dlc/s/italy` | 1 | 1 | 1 | 0 | 100% | 1 | 1 | 1 | 0 | 0 |
| `/c/dlc/s/japan` | 25 | 25 | 19 | 6 | 76% | 50 | 50 | 5 | 0 | 5 |
| `/c/dlc/s/korea` | 25 | 25 | 24 | 1 | 96% | 27 | 27 | 5 | 1 | 0 |
| `/c/dlc/s/north-america` | 25 | 25 | 25 | 0 | 100% | 50 | 50 | 6 | 0 | 2 |
| `/c/dlc/s/spain` | 1 | 1 | 1 | 0 | 100% | 1 | 1 | 1 | 0 | 0 |
| `/c/dlc/s/taiwan` | 8 | 8 | 7 | 1 | 88% | 8 | 8 | 6 | 0 | 0 |
| `/c/virtual-console` | 0 | 0 | 0 | 0 | — | 50 | 50 | 6 | 0 | 6 |
| `/c/virtual-console/s/europe` | 25 | 25 | 24 | 1 | 96% | 50 | 50 | 48 | 2 | 45 |
| `/c/virtual-console/s/france` | 1 | 1 | 1 | 0 | 100% | 1 | 1 | 1 | 0 | 0 |
| `/c/virtual-console/s/germany` | 3 | 3 | 3 | 0 | 100% | 3 | 3 | 3 | 0 | 0 |
| `/c/virtual-console/s/japan` | 25 | 25 | 25 | 0 | 100% | 50 | 50 | 5 | 0 | 5 |
| `/c/virtual-console/s/korea` | 3 | 3 | 3 | 0 | 100% | 3 | 3 | 3 | 0 | 0 |
| `/c/virtual-console/s/north-america` | 25 | 25 | 25 | 0 | 100% | 50 | 50 | 6 | 0 | 3 |
| `/c/virtual-console/s/world` | 25 | 25 | 25 | 0 | 100% | 34 | 34 | 6 | 0 | 0 |
| `/c/dsiware` | 0 | 0 | 0 | 0 | — | 50 | 50 | 6 | 0 | 6 |
| `/c/dsiware/s/australia` | 4 | 4 | 4 | 0 | 100% | 4 | 4 | 4 | 0 | 0 |
| `/c/dsiware/s/europe` | 25 | 25 | 25 | 0 | 100% | 50 | 50 | 5 | 1 | 4 |
| `/c/dsiware/s/france` | 4 | 4 | 3 | 1 | 75% | 4 | 4 | 3 | 1 | 0 |
| `/c/dsiware/s/germany` | 6 | 6 | 4 | 2 | 67% | 6 | 6 | 4 | 2 | 0 |
| `/c/dsiware/s/italy` | 3 | 3 | 2 | 1 | 67% | 3 | 3 | 2 | 1 | 0 |
| `/c/dsiware/s/japan` | 25 | 25 | 20 | 5 | 80% | 50 | 50 | 2 | 3 | 5 |
| `/c/dsiware/s/korea` | 25 | 25 | 0 | 25 | 0% | 31 | 31 | 0 | 6 | 2 |
| `/c/dsiware/s/netherlands` | 3 | 3 | 2 | 1 | 67% | 3 | 3 | 2 | 1 | 0 |
| `/c/dsiware/s/north-america` | 25 | 25 | 25 | 0 | 100% | 50 | 50 | 6 | 0 | 1 |
| `/c/dsiware/s/spain` | 3 | 3 | 2 | 1 | 67% | 3 | 3 | 2 | 1 | 0 |
| `/c/dsiware/s/unknown-other` | 1 | 1 | 0 | 1 | 0% | 1 | 1 | 0 | 1 | 0 |
| `/c/videos` | 0 | 0 | 0 | 0 | — | 50 | 50 | 1 | 5 | 6 |
| `/c/videos/s/china` | 1 | 1 | 0 | 1 | 0% | 1 | 1 | 0 | 1 | 0 |
| `/c/videos/s/europe` | 25 | 25 | 4 | 21 | 16% | 50 | 50 | 0 | 6 | 4 |
| `/c/videos/s/france` | 7 | 7 | 0 | 7 | 0% | 7 | 7 | 0 | 6 | 0 |
| `/c/videos/s/germany` | 6 | 6 | 0 | 6 | 0% | 6 | 6 | 0 | 6 | 0 |
| `/c/videos/s/italy` | 12 | 12 | 0 | 12 | 0% | 12 | 12 | 0 | 6 | 0 |
| `/c/videos/s/japan` | 25 | 25 | 0 | 25 | 0% | 50 | 50 | 0 | 5 | 4 |
| `/c/videos/s/korea` | 3 | 3 | 0 | 3 | 0% | 3 | 3 | 0 | 3 | 0 |
| `/c/videos/s/netherlands` | 1 | 1 | 0 | 1 | 0% | 1 | 1 | 0 | 1 | 0 |
| `/c/videos/s/north-america` | 25 | 25 | 7 | 18 | 28% | 33 | 33 | 1 | 5 | 0 |
| `/c/videos/s/spain` | 13 | 13 | 0 | 13 | 0% | 13 | 13 | 0 | 6 | 0 |
| `/c/videos/s/taiwan` | 2 | 2 | 0 | 2 | 0% | 2 | 2 | 0 | 2 | 0 |
| `/c/videos/s/unknown-other` | 2 | 2 | 0 | 2 | 0% | 2 | 2 | 0 | 2 | 0 |
| `/c/extras` | 0 | 0 | 0 | 0 | — | 50 | 50 | 4 | 2 | 6 |
| `/c/extras/s/custom-dsiware` | 2 | 2 | 1 | 1 | 50% | 2 | 2 | 1 | 1 | 0 |
| `/c/extras/s/devapps-misc` | 8 | 7 | 3 | 4 | 43% | 8 | 7 | 1 | 4 | 0 |
| `/c/extras/s/hb` | 25 | 20 | 0 | 20 | 0% | 42 | 36 | 0 | 5 | 1 |
| `/c/extras/s/rom-hacks` | 25 | 19 | 17 | 2 | 89% | 28 | 22 | 6 | 0 | 0 |
| `/c/extras/s/translated-games` | 25 | 25 | 22 | 3 | 88% | 37 | 37 | 5 | 0 | 1 |
| `/c/themes` | 0 | 0 | 0 | 0 | — | 50 | 0 | 0 | 0 | 0 |
| `/c/themes/s/europe` | 25 | 0 | 0 | 0 | — | 50 | 0 | 0 | 0 | 0 |
| `/c/themes/s/japan` | 25 | 0 | 0 | 0 | — | 50 | 0 | 0 | 0 | 0 |
| `/c/themes/s/north-america` | 25 | 0 | 0 | 0 | — | 50 | 0 | 0 | 0 | 0 |
| `/search/results?q=mario&qt=Text` | 25 | 24 | 22 | 2 | 92% | 0 | 0 | 0 | 0 | 0 |

Regenerate with `bun run e2e:lists` and copy its "coverage" tables here. Numbers move as hShop adds titles and as GameTDB and Libretro add art.
