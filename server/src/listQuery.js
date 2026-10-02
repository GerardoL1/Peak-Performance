// Pagination, search and sorting for list endpoints.
//
// Every list returns { data, meta: { page, pageSize, total, totalPages } }.
// Sort keys are looked up in a per-endpoint whitelist that maps a public name to
// a SQL expression, so user input never reaches ORDER BY directly.

const { z, validate, emptyToUndefined } = require('./validation');
const { HttpError } = require('./errors');

const listParams = {
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100000).default(1)),
  pageSize: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100).default(25)),
  sort: z.preprocess(emptyToUndefined, z.string().max(40).optional()),
  order: z.preprocess(emptyToUndefined, z.enum(['asc', 'desc']).optional()),
  q: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
};

/** Validates ?page&pageSize&sort&order&q plus any endpoint-specific filters. */
function parseListQuery(query, filters = {}) {
  return validate(z.object({ ...listParams, ...filters }), query);
}

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Collects WHERE clauses and their bind parameters. */
class Where {
  constructor() {
    this.clauses = [];
    this.params = [];
  }

  add(sql, ...params) {
    this.clauses.push(sql);
    this.params.push(...params);
    return this;
  }

  /** Adds the clause only when value is not undefined. */
  addIf(value, sql, ...params) {
    return value === undefined ? this : this.add(sql, ...(params.length ? params : [value]));
  }

  /** Case-insensitive "contains" across several columns (OR'd together). */
  search(columns, q) {
    if (!q) return this;
    const like = `%${escapeLike(q)}%`;
    return this.add(`(${columns.map((c) => `${c} LIKE ?`).join(' OR ')})`, ...columns.map(() => like));
  }

  toSql() {
    return this.clauses.length ? `WHERE ${this.clauses.join(' AND ')}` : '';
  }
}

/**
 * Runs a count query and a page query with the same FROM/WHERE.
 * @param db       pool or connection
 * @param params   output of parseListQuery
 * @param opts.select      column list
 * @param opts.from        FROM ... JOIN ... clause
 * @param opts.where       Where instance
 * @param opts.sortable    { publicName: 'sql expression' | ['expr1', 'expr2'] }
 * @param opts.defaultSort { key, order }
 * @param opts.idColumn    unique column used as a tie-breaker so pages are stable
 */
async function paginate(db, params, { select, from, where = new Where(), sortable, defaultSort, idColumn }) {
  const sortKey = params.sort ?? defaultSort.key;
  const sortExpr = sortable[sortKey];
  if (!sortExpr) {
    throw new HttpError(400, `Cannot sort by "${sortKey}"`, [
      { field: 'sort', message: `Use one of: ${Object.keys(sortable).join(', ')}` },
    ]);
  }
  const order = (params.order ?? (params.sort ? 'asc' : (defaultSort.order ?? 'asc'))).toUpperCase();
  const orderBy = [...[].concat(sortExpr), idColumn].map((e) => `${e} ${order}`).join(', ');
  const whereSql = where.toSql();

  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total ${from} ${whereSql}`, where.params);
  const offset = (params.page - 1) * params.pageSize;
  const [data] = await db.query(`SELECT ${select} ${from} ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [
    ...where.params,
    params.pageSize,
    offset,
  ]);

  return {
    data,
    meta: {
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
      sort: sortKey,
      order: order.toLowerCase(),
    },
  };
}

module.exports = { parseListQuery, paginate, Where, escapeLike };
