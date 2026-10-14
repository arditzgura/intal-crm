import { useLive } from '../../hooks/useLive'
import { watchMovementsForItem } from '../../services/stockService'
import { errorMessage } from '../../services/authService'
import { MovementTable } from '../inventory/InventoryPage'

/** Lëvizjet e stokut të një artikulli. */
export default function ItemMovements({ item }) {
  const { data: rows, error } = useLive((ok, ko) => watchMovementsForItem(item.id, ok, ko), [item.id], { initial: [] })
  return (
    <div className="card no-pad">
      {error && <div className="alert error">{errorMessage(error)}</div>}
      <MovementTable rows={rows} hideItem />
    </div>
  )
}
