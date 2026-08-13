<script setup lang="ts">
const clientUrl = import.meta.env.VITE_CLIENT_URL ?? 'http://localhost:5173'
</script>

<template>
  <main>
    <section class="hero-section">
      <div class="hero-copy"><span class="eyebrow">带着故事脉络发现动漫</span><h1>找到那个<br /><em>想一直陪伴的故事。</em></h1><p>Sanye Anime 将有深度的内容发现与 AI 助手放在一起，理解你喜欢的每一个故事世界。</p><div class="hero-actions"><a class="primary-cta" :href="clientUrl">打开客户端</a><RouterLink class="secondary-cta" to="/about">了解产品</RouterLink></div></div>
      <div class="hero-visual" aria-label="原创晚霞、山脊与流星场景">
        <svg class="hero-art" viewBox="0 0 760 520" role="img" aria-labelledby="hero-art-title hero-art-description">
          <title id="hero-art-title">晚霞中的流星</title>
          <desc id="hero-art-description">蓝紫色云层、橙粉色晚霞、静态流星和远山组成的原创场景。</desc>
          <defs>
            <linearGradient id="heroSky" x1="0" y1="0" x2="0.88" y2="1">
              <stop offset="0" stop-color="#102d68" />
              <stop offset="0.42" stop-color="#3679ad" />
              <stop offset="0.7" stop-color="#a66491" />
              <stop offset="1" stop-color="#f1a879" />
            </linearGradient>
            <radialGradient id="heroGlow" cx="73%" cy="79%" r="48%">
              <stop offset="0" stop-color="#ffe0a4" stop-opacity=".96" />
              <stop offset=".24" stop-color="#ffad8c" stop-opacity=".75" />
              <stop offset=".58" stop-color="#e9859a" stop-opacity=".2" />
              <stop offset="1" stop-color="#e9859a" stop-opacity="0" />
            </radialGradient>
            <linearGradient id="heroCloudBlue" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stop-color="#202f70" stop-opacity=".9" />
              <stop offset=".5" stop-color="#6b68a1" stop-opacity=".85" />
              <stop offset="1" stop-color="#ed9bb1" stop-opacity=".12" />
            </linearGradient>
            <linearGradient id="heroCloudRose" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stop-color="#4e5fa1" stop-opacity=".16" />
              <stop offset=".55" stop-color="#ca789e" stop-opacity=".78" />
              <stop offset="1" stop-color="#ffc19f" stop-opacity=".68" />
            </linearGradient>
            <linearGradient id="heroMountainFar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#455a86" />
              <stop offset="1" stop-color="#182b53" />
            </linearGradient>
            <linearGradient id="heroMountainNear" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#263b68" />
              <stop offset="1" stop-color="#101f40" />
            </linearGradient>
            <linearGradient id="heroMeteorTailA" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#76dfff" />
              <stop offset=".58" stop-color="#bd9cff" />
              <stop offset="1" stop-color="#fff1d6" />
            </linearGradient>
            <filter id="heroSoftGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="12" />
            </filter>
            <filter id="heroMeteorGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>

          <rect width="760" height="520" fill="url(#heroSky)" />
          <rect width="760" height="520" fill="url(#heroGlow)" />
          <path d="M-30 105 C120 35 175 95 298 58 C430 18 496 92 795 28 L795 0 L-30 0Z" fill="#172b61" opacity=".5" />
          <path d="M-40 133 C80 72 145 136 247 98 C382 48 495 130 800 50 L800 104 C625 165 468 90 320 151 C181 207 92 138 -40 184Z" fill="url(#heroCloudBlue)" opacity=".92" />
          <path d="M-40 178 C88 136 146 178 276 149 C418 118 544 190 800 120 L800 161 C614 220 498 158 337 204 C206 242 93 198 -40 230Z" fill="#91a3d5" opacity=".28" />
          <path d="M-22 282 C92 229 180 276 274 254 C424 219 535 296 782 214 L782 254 C626 330 493 256 330 308 C196 351 96 295 -22 333Z" fill="url(#heroCloudRose)" opacity=".85" />
          <path d="M88 332 C194 295 264 333 345 306 C456 270 539 325 656 280" fill="none" stroke="#f5b2a8" stroke-width="22" opacity=".2" filter="url(#heroSoftGlow)" />

          <g class="hero-constellation" opacity=".8">
            <circle cx="109" cy="77" r="2.2" fill="#fff1cf" />
            <circle cx="162" cy="48" r="1.6" fill="#fff1cf" />
            <circle cx="236" cy="111" r="2" fill="#fff1cf" />
            <circle cx="655" cy="85" r="2.2" fill="#fff1cf" />
            <circle cx="712" cy="153" r="1.6" fill="#fff1cf" />
          </g>

          <g class="hero-meteor hero-meteor-a">
            <path d="M514 74 L666 176" stroke="#85e0ff" stroke-width="8" opacity=".22" filter="url(#heroMeteorGlow)" />
            <path d="M514 74 L666 176" stroke="url(#heroMeteorTailA)" stroke-width="2.4" />
            <circle cx="666" cy="176" r="4.6" fill="#fff5de" />
          </g>
          <g class="hero-meteor hero-meteor-b">
            <path d="M360 46 L532 157" stroke="#f396e8" stroke-width="8" opacity=".22" filter="url(#heroMeteorGlow)" />
            <path d="M360 46 L532 157" stroke="#ffd3e5" stroke-width="2.3" />
            <circle cx="532" cy="157" r="4" fill="#fff5de" />
          </g>
          <g class="hero-meteor hero-meteor-c">
            <path d="M708 189 L604 260" stroke="#ffc57f" stroke-width="7" opacity=".25" filter="url(#heroMeteorGlow)" />
            <path d="M708 189 L604 260" stroke="#ffd99c" stroke-width="2.1" />
            <circle cx="604" cy="260" r="3.8" fill="#fff6d7" />
          </g>

          <circle cx="580" cy="348" r="33" fill="#ffd79d" opacity=".3" filter="url(#heroSoftGlow)" />
          <circle cx="580" cy="348" r="18" fill="#ffe0aa" opacity=".92" />
          <path d="M0 419 C115 375 180 393 276 407 C368 419 450 368 548 383 C646 399 692 370 760 354 L760 520 L0 520Z" fill="url(#heroMountainFar)" />
          <path d="M0 455 C104 422 182 441 279 450 C375 459 463 415 555 430 C641 444 700 419 760 405 L760 520 L0 520Z" fill="url(#heroMountainNear)" />
          <path d="M0 474 C122 445 220 473 316 478 C438 485 527 451 615 461 C687 470 734 454 760 447 L760 520 L0 520Z" fill="#101d3a" />

          <path d="M0 488 C122 459 208 488 303 486 C403 482 493 464 584 477 C666 489 724 478 760 466 L760 520 L0 520Z" fill="#0d1832" opacity=".86" />
          <path d="M25 458 C74 444 105 448 140 455 M625 448 C674 437 706 439 740 445" fill="none" stroke="#f1a78f" stroke-width="2" opacity=".38" />
        </svg>
        <span class="hero-comet comet-primary"></span><span class="hero-comet comet-secondary"></span><span class="visual-caption">你的下一部<br />心动作品<br />正在这里</span><span class="visual-index">01 / 03</span><span class="visual-sky-label">黄昏观测 · 01</span>
      </div>
    </section>
    <section class="intro-section"><div><span class="eyebrow">更清晰的浏览方式</span><h2>少一点切换页面。<br />多一点真正发现。</h2></div><p>在一个安静的工作区中浏览季度新番、完结作品、角色和观看顺序。需要第二个意见时，不离开作品页面就能询问 AI 助手。</p></section>
    <section class="feature-grid"><article><span class="feature-number">01</span><h3>发现</h3><p>首页精选、榜单、排期和搜索，帮助你从好奇走到真正想看的作品。</p></article><article><span class="feature-number">02</span><h3>询问</h3><p>在控制剧透的前提下，获得推荐、剧情、角色和观看顺序解答。</p></article><article><span class="feature-number">03</span><h3>保存</h3><p>收藏作品与对话，让下一次打开时能从上次离开的地方继续。</p></article></section>
  </main>
</template>
