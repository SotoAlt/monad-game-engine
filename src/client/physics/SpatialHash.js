/**
 * Spatial Hash — 2D grid (XZ plane) for fast collision neighbor lookups.
 *
 * Cell size 8: larger than the biggest entities (~6 units on hex_a_gone).
 * Query returns entity IDs in the 3×3 cell neighborhood (~24×24 unit area).
 */

const CELL_SIZE = 8;

const _cells = new Map();       // cellKey -> Set<entityId>
const _entityCells = new Map(); // entityId -> cellKey
let _queryResult = [];

function cellKey(x, z) {
  const cx = Math.floor(x / CELL_SIZE);
  const cz = Math.floor(z / CELL_SIZE);
  return (cx << 16) ^ cz; // fast integer hash
}

export function spatialHashInsert(entityId, x, z) {
  const key = cellKey(x, z);
  _entityCells.set(entityId, key);
  let cell = _cells.get(key);
  if (!cell) {
    cell = new Set();
    _cells.set(key, cell);
  }
  cell.add(entityId);
}

export function spatialHashRemove(entityId) {
  const key = _entityCells.get(entityId);
  if (key === undefined) return;
  _entityCells.delete(entityId);
  const cell = _cells.get(key);
  if (cell) {
    cell.delete(entityId);
    if (cell.size === 0) _cells.delete(key);
  }
}

export function spatialHashUpdate(entityId, x, z) {
  const newKey = cellKey(x, z);
  const oldKey = _entityCells.get(entityId);
  if (oldKey === newKey) return;

  if (oldKey !== undefined) {
    const oldCell = _cells.get(oldKey);
    if (oldCell) {
      oldCell.delete(entityId);
      if (oldCell.size === 0) _cells.delete(oldKey);
    }
  }

  _entityCells.set(entityId, newKey);
  let cell = _cells.get(newKey);
  if (!cell) {
    cell = new Set();
    _cells.set(newKey, cell);
  }
  cell.add(entityId);
}

export function spatialHashClear() {
  _cells.clear();
  _entityCells.clear();
}

export function spatialHashQuery(x, z) {
  _queryResult.length = 0;
  const cx = Math.floor(x / CELL_SIZE);
  const cz = Math.floor(z / CELL_SIZE);

  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const key = ((cx + dx) << 16) ^ (cz + dz);
      const cell = _cells.get(key);
      if (cell) {
        for (const id of cell) {
          _queryResult.push(id);
        }
      }
    }
  }
  return _queryResult;
}
