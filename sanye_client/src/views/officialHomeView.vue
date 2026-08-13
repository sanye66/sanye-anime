<template>
  <div class="page-stack narrow-page official-home-page">
    <section class="hero-panel official-home-hero">
      <div>
        <span class="eyebrow">official 公开入口</span>
        <h2>发现下一部值得追的作品。</h2>
        <p>在一个清晰的 PC 工作区中浏览动漫内容，并在需要时进入 AI 动漫助手。</p>
        <div class="hero-actions">
          <RouterLink class="primary-button" to="/">进入 sanye_anime</RouterLink>
          <RouterLink class="download-button" to="/official/download"><span aria-hidden="true">↓</span>下载客户端</RouterLink>
          <RouterLink class="secondary-button" to="/official/about">了解产品</RouterLink>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <span class="art-label">官网入口</span>
        <strong>从发现<br />开始。</strong>
      </div>
    </section>

    <section class="download-strip"><div class="download-strip-mark" aria-hidden="true">S</div><div><span class="eyebrow">电脑客户端</span><h3>把这段星空带在身边。</h3><p>下载 sanye_anime PC 客户端，获得更完整的动漫发现与 AI 对话工作区。</p></div><RouterLink class="download-link" to="/official/download">查看下载信息 <span aria-hidden="true">→</span></RouterLink></section>

    <section>
      <div class="section-heading">
        <div>
          <span class="eyebrow">公开信息</span>
          <h2>一个入口，三类能力。</h2>
        </div>
      </div>
      <div class="content-grid">
        <article class="anime-card card-coral"><span>01</span><h3>内容发现</h3><p>浏览作品、榜单和排期。</p></article>
        <article class="anime-card card-blue"><span>02</span><h3>AI 助手</h3><p>围绕作品进行问答和推荐。</p></article>
        <article class="anime-card card-lime"><span>03</span><h3>个人管理</h3><p>保存收藏、历史和会话。</p></article>
      </div>
    </section>
  </div>
</template>
