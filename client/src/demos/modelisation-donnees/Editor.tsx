import { useId, useState } from 'react';
import {
  COL_TYPES,
  colById,
  mapColumn,
  mapTable,
  newId,
  removeColumn,
  removeTable,
  tableById,
  uniqueColumnName,
  type ColType,
  type Column,
  type Model,
} from './model';

interface Props {
  model: Model;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAddTable: () => void;
  /** `history` : l'état précédent est mémorisé pour « Annuler ». */
  onChange: (fn: (m: Model) => Model, history?: boolean) => void;
  /** Mémorise l'état courant (avant une saisie au clavier dans un champ). */
  onSnapshot: () => void;
}

/** Panneau d'édition : tables, colonnes, clés, références et index, entièrement au clavier. */
export default function Editor({ model, selectedId, onSelect, onAddTable, onChange, onSnapshot }: Props) {
  const uid = useId();
  const table = selectedId ? tableById(model, selectedId) : undefined;
  const [ixCol, setIxCol] = useState('');

  const setCol = (colId: string, f: (c: Column) => Column, history = true) => table && onChange((m) => mapColumn(m, table.id, colId, f), history);
  const moveCol = (i: number, d: -1 | 1) =>
    table &&
    onChange((m) =>
      mapTable(m, table.id, (t) => {
        const cols = [...t.columns];
        const j = i + d;
        if (j < 0 || j >= cols.length) return t;
        [cols[i], cols[j]] = [cols[j]!, cols[i]!];
        return { ...t, columns: cols };
      }),
    );

  const fkOptions = model.tables.map((t) => ({
    table: t,
    cols: t.columns.filter((c) => c.name.trim()),
  }));

  return (
    <div className="md-editor">
      <div className="md-tablelist" role="group" aria-label="Tables du modèle">
        {model.tables.map((t) => (
          <button key={t.id} type="button" className="md-chip" aria-pressed={t.id === selectedId} onClick={() => onSelect(t.id)}>
            {t.name || '(sans nom)'}
          </button>
        ))}
        <button type="button" className="md-chip md-chip--add" onClick={onAddTable}>
          + Ajouter une table
        </button>
      </div>

      {!table ? (
        <p className="md-empty">Choisissez une table ci-dessus, ou cliquez sur une table du diagramme, pour la modifier.</p>
      ) : (
        <div className="md-tableform">
          <div className="md-field">
            <label htmlFor={`${uid}-tname`}>Nom de la table</label>
            <input
              id={`${uid}-tname`}
              value={table.name}
              spellCheck={false}
              autoComplete="off"
              onFocus={onSnapshot}
              onChange={(e) => onChange((m) => mapTable(m, table.id, (t) => ({ ...t, name: e.target.value })), false)}
            />
          </div>

          <h3 className="md-subh">
            Colonnes <span>{table.columns.length}</span>
          </h3>
          <ol className="md-collist">
            {table.columns.map((c, i) => {
              const base = `${uid}-${c.id}`;
              const fkValue = c.fk ? `${c.fk.tableId}|${c.fk.columnId}` : '';
              const fkBroken = !!c.fk && !colById(tableById(model, c.fk.tableId), c.fk.columnId);
              return (
                <li key={c.id} className="md-col">
                  <fieldset>
                    <legend className="md-sr">Colonne {c.name || i + 1}</legend>
                    <div className="md-col-row">
                      <label className="md-sr" htmlFor={`${base}-n`}>
                        Nom de la colonne
                      </label>
                      <input
                        id={`${base}-n`}
                        className="md-col-name"
                        value={c.name}
                        spellCheck={false}
                        autoComplete="off"
                        onFocus={onSnapshot}
                        onChange={(e) => setCol(c.id, (x) => ({ ...x, name: e.target.value }), false)}
                      />
                      <label className="md-sr" htmlFor={`${base}-t`}>
                        Type
                      </label>
                      <select id={`${base}-t`} value={c.type} onChange={(e) => setCol(c.id, (x) => ({ ...x, type: e.target.value as ColType }))}>
                        {COL_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.value}
                          </option>
                        ))}
                      </select>
                      <span className="md-col-tools">
                        <button type="button" className="md-icon-btn" aria-label={`Monter ${c.name}`} disabled={i === 0} onClick={() => moveCol(i, -1)}>
                          ↑
                        </button>
                        <button
                          type="button"
                          className="md-icon-btn"
                          aria-label={`Descendre ${c.name}`}
                          disabled={i === table.columns.length - 1}
                          onClick={() => moveCol(i, 1)}
                        >
                          ↓
                        </button>
                        <button type="button" className="md-icon-btn md-danger" aria-label={`Supprimer la colonne ${c.name}`} onClick={() => onChange((m) => removeColumn(m, table.id, c.id))}>
                          ×
                        </button>
                      </span>
                    </div>
                    <div className="md-col-row md-col-flags">
                      <label>
                        <input type="checkbox" checked={c.pk} onChange={(e) => setCol(c.id, (x) => ({ ...x, pk: e.target.checked, notNull: e.target.checked || x.notNull }))} />
                        Clé primaire
                      </label>
                      <label>
                        <input type="checkbox" checked={c.notNull || c.pk} disabled={c.pk} onChange={(e) => setCol(c.id, (x) => ({ ...x, notNull: e.target.checked }))} />
                        Non nul
                      </label>
                      <label>
                        <input type="checkbox" checked={c.unique} onChange={(e) => setCol(c.id, (x) => ({ ...x, unique: e.target.checked }))} />
                        Unique
                      </label>
                    </div>
                    <div className="md-col-row">
                      <label htmlFor={`${base}-fk`} className="md-fk-label">
                        Référence
                      </label>
                      <select
                        id={`${base}-fk`}
                        className={fkBroken ? 'is-broken' : ''}
                        value={fkBroken ? '__broken' : fkValue}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) return setCol(c.id, (x) => ({ ...x, fk: null }));
                          const [tableId, columnId] = v.split('|') as [string, string];
                          const target = colById(tableById(model, tableId), columnId);
                          // Une clé étrangère prend le type de la colonne qu'elle vise.
                          setCol(c.id, (x) => ({ ...x, fk: { tableId, columnId }, type: target?.type ?? x.type }));
                        }}
                      >
                        <option value="">Aucune (pas de clé étrangère)</option>
                        {fkBroken && (
                          <option value="__broken" disabled>
                            Cible supprimée
                          </option>
                        )}
                        {fkOptions.map(({ table: t, cols }) => (
                          <optgroup key={t.id} label={t.name || '(sans nom)'}>
                            {cols.map((x) => (
                              <option key={x.id} value={`${t.id}|${x.id}`}>
                                {t.name}.{x.name}
                                {x.pk ? ' (clé)' : x.unique ? ' (unique)' : ''}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  </fieldset>
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            className="md-btn"
            onClick={() =>
              onChange((m) =>
                mapTable(m, table.id, (t) => ({
                  ...t,
                  columns: [...t.columns, { id: newId('c'), name: uniqueColumnName(t, 'nouvelle_colonne'), type: 'TEXT', pk: false, notNull: false, unique: false, fk: null }],
                })),
              )
            }
          >
            + Ajouter une colonne
          </button>

          <h3 className="md-subh">Index</h3>
          {model.indexes.filter((ix) => ix.tableId === table.id).length === 0 ? (
            <p className="md-note">Aucun index en plus de la clé primaire et des colonnes uniques.</p>
          ) : (
            <ul className="md-ixlist">
              {model.indexes
                .filter((ix) => ix.tableId === table.id)
                .map((ix) => (
                  <li key={ix.id}>
                    <code>
                      {ix.unique ? 'UNIQUE ' : ''}({ix.columnIds.map((id) => colById(table, id)?.name ?? '?').join(', ')})
                    </code>
                    <button
                      type="button"
                      className="md-icon-btn md-danger"
                      aria-label={`Supprimer l’index sur ${ix.columnIds.map((id) => colById(table, id)?.name ?? '?').join(', ')}`}
                      onClick={() => onChange((m) => ({ ...m, indexes: m.indexes.filter((x) => x.id !== ix.id) }))}
                    >
                      ×
                    </button>
                  </li>
                ))}
            </ul>
          )}
          <div className="md-col-row">
            <label className="md-sr" htmlFor={`${uid}-ix`}>
              Colonne à indexer
            </label>
            <select id={`${uid}-ix`} value={ixCol} onChange={(e) => setIxCol(e.target.value)}>
              <option value="">Colonne à indexer…</option>
              {table.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="md-btn"
              disabled={!ixCol || !table.columns.some((c) => c.id === ixCol)}
              onClick={() => {
                onChange((m) => ({ ...m, indexes: [...m.indexes, { id: newId('ix'), tableId: table.id, columnIds: [ixCol], unique: false }] }));
                setIxCol('');
              }}
            >
              Ajouter l’index
            </button>
          </div>

          <div className="md-danger-zone">
            <button
              type="button"
              className="md-btn md-btn--danger"
              onClick={() => {
                onChange((m) => removeTable(m, table.id));
                onSelect(null);
              }}
            >
              Supprimer la table {table.name}
            </button>
            <span className="md-note">Les références vers elle resteront signalées dans le diagnostic. « Annuler » la rétablit.</span>
          </div>
        </div>
      )}
    </div>
  );
}
