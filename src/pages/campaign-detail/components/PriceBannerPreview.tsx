import type { PriceBannerConfig } from '../../../features/campaignDetail/types'

const templateClassName = {
  detail: 'price-banner-preview--detail',
  feed: 'price-banner-preview--feed',
  story: 'price-banner-preview--story',
}

type PriceBannerPreviewProps = {
  config: PriceBannerConfig
}

export function PriceBannerPreview({ config }: PriceBannerPreviewProps) {
  return (
    <div className={`price-banner-preview ${templateClassName[config.template]}`} style={{ background: config.backgroundColor }}>
      <div className="price-banner-preview__content">
        <div className="price-banner-preview__seller" style={{ color: config.accentColor }}>
          {config.headline}
        </div>
        <h3>{config.brandName}</h3>
        <strong>{config.productName}</strong>
        <div className="price-banner-preview__image">
          {config.imageUrl ? <img alt="" src={config.imageUrl} /> : <span>상품 이미지</span>}
        </div>
        <div className="price-banner-preview__price">
          <span>{config.originalPrice}</span>
          <strong style={{ color: config.accentColor }}>{config.groupBuyPrice}</strong>
          <em style={{ background: config.accentColor }}>{config.discountRate} OFF</em>
        </div>
        <dl>
          <div>
            <dt>기간</dt>
            <dd>{config.saleStartDate} ~ {config.saleEndDate}</dd>
          </div>
          <div>
            <dt>배송</dt>
            <dd>{config.shippingText}</dd>
          </div>
          <div>
            <dt>이벤트</dt>
            <dd>{config.eventText}</dd>
          </div>
        </dl>
        <p>{config.cautionText}</p>
      </div>
    </div>
  )
}
