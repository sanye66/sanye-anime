<template>
  <div class="ai-layout">
    <aside class="conversation-list">
      <div class="section-heading compact"><h2>对话记录</h2><button class="icon-button" type="button" aria-label="新建对话">+</button></div>
      <div class="conversation active"><span>找一部平静的奇幻动画</span><small>新对话</small></div>
      <div class="conversation"><span>接下来该看什么？</span><small>昨天</small></div>
    </aside>
    <section class="chat-panel">
      <div class="chat-header"><div><span class="eyebrow">AI 动漫助手</span><h2>找一部平静的奇幻动画</h2></div><button class="secondary-button" type="button">清除上下文</button></div>
      <div class="chat-empty"><div class="chat-mark">✦</div><h2>你现在想要什么样的故事？</h2><p>可以询问推荐、角色资料、观看顺序，或要求不剧透地解释剧情。</p><div class="prompt-row"><button type="button">温暖又充满希望</button><button type="button">一部短篇完结作品</button></div></div>
      <div class="chat-input"><input aria-label="询问 AI 助手" placeholder="问问某部动漫……" /><button class="primary-button" type="button">发送</button></div>
    </section>
    <aside class="context-panel"><span class="eyebrow">当前上下文</span><h3>尚未选择作品</h3><p>打开作品详情页后，故事脉络会显示在对话旁边。</p></aside>
  </div>
</template>
