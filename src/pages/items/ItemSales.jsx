import { useMemo } from 'react'
import { useLive } from '../../hooks/useLive'
import { watchClients } from '../../services/clientService'
import LineStats from '../../components/LineStats'

/** Kush e ka blerë artikullin: sasia, çmimi mesatar, totali, fitimi. */
export default function ItemSales({ item }) {
  const { data: clients } = useLive(watchClients, [], { initial: [] })
  const names = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, { label: `${c.kodi} – ${c.emri}`, sub: c.qyteti, link: `/kliente/${c.id}` }])),
    [clients],
  )
  return <LineStats mode="item" id={item.id} names={names} title={`shitjet_${item.kodi}`} />
}
