import type { BannerApprovalStatus, PriceBannerConfig, PriceBannerTemplate } from '../../../features/campaignDetail/types'
import { PriceBannerPreview } from './PriceBannerPreview'

type PriceBannerEditorProps = {
  config: PriceBannerConfig
  notice: string
  onChange: (config: PriceBannerConfig) => void
  onMockAction: (message: string) => void
}

const templates: { label: string; value: PriceBannerTemplate }[] = [
  { label: '상세페이지용 1080 × 1350', value: 'detail' },
  { label: '인스타그램 피드용 1080 × 1080', value: 'feed' },
  { label: '인스타그램 스토리용 1080 × 1920', value: 'story' },
]

function updateStatus(label: string): BannerApprovalStatus {
  if (label === '초안 저장') return '초안'
  if (label === '매니저 검수 요청') return '매니저 검수 대기'
  if (label === '배너 확정') return '확정'
  return '수정 요청'
}

export function PriceBannerEditor({ config, notice, onChange, onMockAction }: PriceBannerEditorProps) {
  const updateField = (key: keyof PriceBannerConfig, value: string) => {
    onChange({ ...config, [key]: value })
  }

  return (
    <div className="banner-editor-grid">
      <section className="detail-card">
        <div className="checklist-head">
          <div>
            <h3>가격 배너 편집</h3>
            <p>입력값과 템플릿 변경이 미리보기에 즉시 반영됩니다.</p>
          </div>
          <span className="campaign-status campaign-status--warning">{config.status}</span>
        </div>

        <div className="banner-template-list">
          {templates.map((template) => (
            <button
              className={config.template === template.value ? 'view-tab is-active' : 'view-tab'}
              key={template.value}
              onClick={() => onChange({ ...config, template: template.value })}
              type="button"
            >
              {template.label}
            </button>
          ))}
        </div>

        <div className="banner-form">
          {[
            ['sellerName', '셀러명'],
            ['headline', '배너 상단 문구'],
            ['brandName', '브랜드명'],
            ['productName', '상품명'],
            ['originalPrice', '정상가'],
            ['groupBuyPrice', '공동구매가'],
            ['discountRate', '할인율'],
            ['saleStartDate', '판매 시작일'],
            ['saleEndDate', '판매 종료일'],
            ['shippingText', '배송비 안내'],
            ['eventText', '이벤트 문구'],
            ['imageUrl', '상품 이미지 URL'],
            ['cautionText', '주의 문구'],
          ].map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <input
                onChange={(event) => updateField(key as keyof PriceBannerConfig, event.target.value)}
                value={String(config[key as keyof PriceBannerConfig])}
              />
            </label>
          ))}

          <label>
            <span>배경색</span>
            <input onChange={(event) => updateField('backgroundColor', event.target.value)} type="color" value={config.backgroundColor} />
          </label>
          <label>
            <span>포인트 컬러</span>
            <input onChange={(event) => updateField('accentColor', event.target.value)} type="color" value={config.accentColor} />
          </label>
        </div>

        <div className="action-row">
          <button className="secondary-button" onClick={() => onMockAction('미리보기를 현재 입력값으로 새로고침했습니다.')} type="button">
            미리보기 새로고침
          </button>
          {['초안 저장', '매니저 검수 요청', '배너 확정'].map((label) => (
            <button
              className={label === '배너 확정' ? 'primary-button' : 'secondary-button'}
              key={label}
              onClick={() => {
                onChange({ ...config, status: updateStatus(label) })
                onMockAction(`${label} 상태로 mock 저장했습니다.`)
              }}
              type="button"
            >
              {label}
            </button>
          ))}
          <button className="secondary-button" onClick={() => onMockAction('이미지 저장 기능은 다음 단계에서 연결됩니다.')} type="button">
            이미지 저장
          </button>
        </div>
        {notice && <p className="mock-notice">{notice}</p>}
      </section>

      <section className="detail-card banner-preview-card">
        <h3>배너 미리보기</h3>
        <PriceBannerPreview config={config} />
      </section>
    </div>
  )
}
