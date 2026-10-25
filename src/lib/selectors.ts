/**
 * Every hShop selector lives here and nowhere else. Each one was read from the
 * live markup of hshop.erista.me (site v3, assets `?v=2.10`); the copies in
 * test/fixtures/hshop are the reference. If hShop changes its markup, this is
 * the only file to update.
 */
export const SELECTORS = {
  /** Title page (`/t/{id}`) */
  title: {
    /** Left card that holds the name, the technical table and the description. */
    container: '.landing.sectioned-l',
    /** `<h2 class="green bold nospace">Game name</h2>` */
    name: '.title-name > h2',
    /** Breadcrumb links: category then region slug (`/c/games/s/north-america`). */
    breadcrumbLinks: '.title-name > h3 > a',
    /** Technical info table: a list of `<p>Label: <span>value</span></p>`. */
    meta: '.basic-meta',
    metaRows: '.basic-meta > p',
    /** Wrapper of the description and the other extended entries. */
    extendedMeta: '.extended-meta',
    extendedEntry: '.extended-meta > .extended-meta-entry',
    description: '.description-container',
  },
  /** Listing pages (`/c/...`, `/search`) — not used in this iteration. */
  list: {
    entry: 'a.list-entry',
    name: '.base-info > h3',
    metaContent: '.meta > .meta-content',
  },
} as const;

/** Row labels of the technical table, exactly as hShop prints them. */
export const META_LABELS = {
  titleId: 'Title ID',
  productCode: 'Product Code',
} as const;

/** Marker set on the anchor nodes once the extension has enhanced them. */
export const ENHANCED_ATTR = 'data-hshop-enhanced';
