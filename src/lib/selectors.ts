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
  /**
   * "Related Content" box of a title page (`/t/6881`): `.related` holds an
   * `<h3>` and `a.list-entry` rows built exactly like main-list rows (so the
   * `list` selectors read them), minus the "content in" line, plus a
   * `Relation: …` badge in the row's `.base-info > .meta`.
   */
  related: {
    container: '.landing.sectioned-l > .related',
    /** Badge that reads `Relation: Base Title` (see RELATIONS). */
    relation: ':scope > .base-info > .meta > .meta-content',
  },
  /**
   * Listing pages (`/c/{cat}`, `/c/{cat}/s/{slug}`, `/search/results`). See
   * "Listing pages" in docs/REFERENCE.md. Row-relative selectors start with
   * `:scope >` so the badge box nested in `.base-info` (its own `.meta`) never
   * matches the row's meta.
   */
  list: {
    /** Every row of every list. Category roots also list subcategories (`/c/…/s/…`): filter by href. */
    entry: 'a.list-entry',
    /** Title rows only (`/t/{id}`): main list, top list and search. */
    titleEntry: 'a.list-entry[href^="/t/"]',
    /** "Top content in this subcategory" box: rows with no product code. */
    topList: '.list.top-list',
    /** Main list name: `<h3 class="green bold nospace">Name</h3>`. */
    name: ':scope > .base-info > h3',
    /** Top list name: `<h3>N. <span class="green bold">Name</span></h3>`. */
    topName: ':scope > .base-info > h3 > span.green',
    /** Name, "Also known as" and "content in … ➞ slug" lines; tell them apart by text. */
    infoLines: ':scope > .base-info > h4',
    /** Labelled values: first span = value, last span = label (`Product Code`, `Title ID`, …). */
    metaContent: ':scope > .meta > .meta-content',
  },
} as const;

/** Row labels of the title page table and list row meta, exactly as hShop prints them. */
export const META_LABELS = {
  titleId: 'Title ID',
  productCode: 'Product Code',
} as const;

/** Text that starts a related row's badge: `Relation: Base Title`. */
export const RELATION_PREFIX = 'Relation:';

/** Every relation hShop was seen printing (docs/REFERENCE.md, "Related Content"). */
export const RELATIONS = {
  base: 'Base Title',
  demo: 'Demo Title',
  update: 'Update Data',
  dlc: 'Downloadable Content',
} as const;

/** Text that starts the breadcrumb `<h4>` of a list row (`content in games ➞ japan`). */
export const LIST_BREADCRUMB_PREFIX = 'content in';

/** Marker set on the anchor nodes once the extension has enhanced them. */
export const ENHANCED_ATTR = 'data-hshop-enhanced';
