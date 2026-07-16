import { useState } from 'react'
import type { WorkItem } from '../../../features/myWork/types'
import { WorkItemCard } from './WorkItemCard'

type WorkGroupSectionProps = {
  title: string
  items: WorkItem[]
  onOpen: (item: WorkItem) => void
}

export function WorkGroupSection({ title, items, onOpen }: WorkGroupSectionProps) {
  const [open, setOpen] = useState(true)
  return (
    <section className="work-group-section">
      <button className="work-group-section__head" onClick={() => setOpen((value) => !value)} type="button">
        <span>{open ? '▾' : '▸'} {title}</span>
        <strong>{items.length}건</strong>
      </button>
      {open && (
        <div className="work-card-list">
          {items.length === 0 ? <p className="muted-text">해당 업무가 없습니다.</p> : items.map((item) => (
            <WorkItemCard item={item} key={item.id} onOpen={onOpen} />
          ))}
        </div>
      )}
    </section>
  )
}
