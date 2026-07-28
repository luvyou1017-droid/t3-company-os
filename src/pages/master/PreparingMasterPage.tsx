export function PreparingMasterPage({ title }: { title: string }) {
  return <section className="master-page"><div className="master-page__heading"><div><p className="page-eyebrow">Master Management</p><h1>{title}</h1><p>업무 흐름과 권한 정책을 준비하고 있습니다.</p></div></div><div className="master-empty"><strong>{title} 관리</strong><p>상품 마스터 V1 검증 후 순차적으로 연결됩니다.</p></div></section>
}
