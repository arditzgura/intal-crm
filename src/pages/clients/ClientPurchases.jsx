import { useMemo } from 'react'
import { useLive } from '../../hooks/useLive'
import { watchItems } from '../../services/itemService'
import LineStats from '../../components/LineStats'

/** Artikujt e blerë nga klienti: sasia, çmimi mesatar, totali, fitimi. */
export default function ClientPurchases({ client, range }) {
  const { data: items } = useLive(watchItems, [], { initial: [] })
  const names = useMemo(
    () => Object.fromEntries(items.map((i) => [i.id, { label: `${i.kodi} – ${i.emri}`, sub: i.kategoria, link: `/artikujt/${i.id}` }])),
    [items],
  )
  return <LineStats mode="client" id={client.id} names={names} title={`blerjet_${client.kodi}`} range={range} hideSummary />
}
