<template>
  <div class="page-stack narrow-page">
    <section class="section-heading"><div><span class="eyebrow">宫水三叶的个人空间</span><h2>个人中心</h2></div></section>
    <section class="profile-panel"><div class="avatar profile-avatar">S</div><div><h3>欢迎来到 sanye_anime</h3><p>管理你的收藏、历史记录和 AI 对话，让每一次相遇都被好好记录。</p></div><button class="primary-button" type="button">登录</button></section>
    <div class="mine-library-grid">
      <section class="mine-library-panel">
        <div class="mine-library-heading"><div><span class="eyebrow">已保存的作品</span><h3>收藏</h3></div><span class="mine-library-count">0 部</span></div>
        <div class="mine-library-empty"><span class="mine-library-icon" aria-hidden="true">◇</span><p>还没有收藏作品，遇到喜欢的动漫就保存下来。</p><RouterLink class="text-button" to="/">去发现动漫 →</RouterLink></div>
      </section>
      <section class="mine-library-panel">
        <div class="mine-library-heading"><div><span class="eyebrow">最近看过的作品</span><h3>历史记录</h3></div><span class="mine-library-count">0 条</span></div>
        <div class="mine-library-empty"><span class="mine-library-icon" aria-hidden="true">◷</span><p>看过的动漫和作品详情会记录在这里。</p><RouterLink class="text-button" to="/">开始浏览 →</RouterLink></div>
      </section>
    </div>
    <div class="settings-list personal-settings-list">
      <RouterLink class="settings-entry" to="/mine/model-config"><span class="settings-entry-icon" aria-hidden="true">✦</span><span class="settings-entry-copy"><strong>模型配置</strong><small>选择 AI 模型，调整回答参数和上下文长度。</small></span><span class="settings-entry-arrow" aria-hidden="true">→</span></RouterLink>
      <RouterLink class="settings-entry" to="/mine/feedback"><span class="settings-entry-icon" aria-hidden="true">⌁</span><span class="settings-entry-copy"><strong>问题反馈</strong><small>告诉我们遇到的问题，帮助完善你的使用体验。</small></span><span class="settings-entry-arrow" aria-hidden="true">→</span></RouterLink>
    </div>
  </div>
</template>
