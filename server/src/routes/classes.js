const express = require('express');
const { HttpError, wrap } = require('../errors');
const { validate, parseId, classSchema, z } = require('../validation');
const { parseListQuery, paginate, Where } = require('../listQuery');
const { requirePermission } = require('../auth');

const COLUMNS = ['ClassName', 'ClassDescription', 'DifficultyLevel', 'Duration'];

module.exports = function classRoutes({ db }) {
  const router = express.Router();

  const getClass = async (id) => {
    const [found] = await db.query('SELECT * FROM groupfitnessclass WHERE ClassID = ?', [id]);
    if (!found.length) throw new HttpError(404, 'Class not found');
    return found[0];
  };

  router.get(
    '/',
    requirePermission('classes:read'),
    wrap(async (req, res) => {
      const p = parseListQuery(req.query, { difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced']).optional() });
      const where = new Where()
        .search(['g.ClassName', 'g.ClassDescription'], p.q)
        .addIf(p.difficulty, 'g.DifficultyLevel = ?');
      res.json(
        await paginate(db, p, {
          select: 'g.*',
          from: 'FROM groupfitnessclass g',
          where,
          sortable: { id: 'g.ClassID', name: 'g.ClassName', difficulty: 'g.DifficultyLevel', duration: 'g.Duration' },
          defaultSort: { key: 'name' },
          idColumn: 'g.ClassID',
        })
      );
    })
  );

  router.get(
    '/:id',
    requirePermission('classes:read'),
    wrap(async (req, res) => {
      res.json(await getClass(parseId(req.params.id)));
    })
  );

  router.post(
    '/',
    requirePermission('classes:write'),
    wrap(async (req, res) => {
      const d = validate(classSchema, req.body);
      const [result] = await db.query(
        `INSERT INTO groupfitnessclass (${COLUMNS.join(', ')}) VALUES (?, ?, ?, ?)`,
        COLUMNS.map((c) => d[c])
      );
      res.status(201).json(await getClass(result.insertId));
    })
  );

  router.put(
    '/:id',
    requirePermission('classes:write'),
    wrap(async (req, res) => {
      const id = parseId(req.params.id);
      const d = validate(classSchema, req.body);
      const [result] = await db.query(
        `UPDATE groupfitnessclass SET ${COLUMNS.map((c) => `${c} = ?`).join(', ')} WHERE ClassID = ?`,
        [...COLUMNS.map((c) => d[c]), id]
      );
      if (result.affectedRows === 0) throw new HttpError(404, 'Class not found');
      res.json(await getClass(id));
    })
  );

  router.delete(
    '/:id',
    requirePermission('classes:write'),
    wrap(async (req, res) => {
      const [result] = await db.query('DELETE FROM groupfitnessclass WHERE ClassID = ?', [parseId(req.params.id)]);
      if (result.affectedRows === 0) throw new HttpError(404, 'Class not found');
      res.status(204).end();
    })
  );

  return router;
};
