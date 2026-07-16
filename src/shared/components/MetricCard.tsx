type MetricCardProps = {
  label: string
  value: string
  helper: string
  tone?: 'default' | 'warning' | 'danger'
}

export function MetricCard({ label, value, helper, tone = 'default' }: MetricCardProps) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{helper}</p>
    </article>
  )
}
