const animeCatalog = [
  {
    id: 'skyline',
    title: '星海回声',
    originalTitle: '城市回声',
    type: '原创动画',
    meta: '2025 · 12 集 · 科幻 / 群像',
    summary: '在漂浮城市群之间，一支负责修复旧广播塔的少女小队，听见了来自失落地表的求救信号。',
    color: 'coral',
    score: '9.2',
    schedule: '周三 22:00',
    updated: '2025 年 9 月',
    tags: ['科幻', '冒险', '群像', '成长'],
  },
  {
    id: 'afterglow',
    title: '夏末余晖',
    originalTitle: '八月余晖',
    type: '电视动画',
    meta: '2024 · 13 集 · 青春 / 日常',
    summary: '转学后的最后一个夏天，两个不擅长告别的人决定把每个黄昏都记录下来。',
    color: 'blue',
    score: '8.8',
    schedule: '已完结',
    updated: '2024 年 8 月',
    tags: ['青春', '治愈', '日常'],
  },
  {
    id: 'paper-moon',
    title: '纸月计划',
    originalTitle: '纸月协议',
    type: '剧场版',
    meta: '2025 · 118 分钟 · 悬疑 / 近未来',
    summary: '当城市所有人的梦境开始共享，一个只在纸上存在的月亮成为破案的唯一线索。',
    color: 'lime',
    score: '9.0',
    schedule: '剧场版',
    updated: '2025 年 8 月',
    tags: ['悬疑', '近未来', '心理'],
  },
  {
    id: 'blue-hour',
    title: '蓝色时刻',
    originalTitle: '蓝色时刻',
    type: '电视动画',
    meta: '2025 · 24 集 · 奇幻 / 冒险',
    summary: '只有在日落后的七分钟里，少年才能看见城市中被遗忘的另一面。',
    color: 'blue',
    score: '8.6',
    schedule: '周五 21:30',
    updated: '2025 年 9 月',
    tags: ['奇幻', '冒险', '城市'],
  },
  {
    id: 'north-wind',
    title: '向北的风',
    originalTitle: '向北之风',
    type: '网络动画',
    meta: '2025 · 10 集 · 旅行 / 温情',
    summary: '一辆没有固定终点的列车，带着三位旅人驶向他们不敢面对的答案。',
    color: 'coral',
    score: '8.4',
    schedule: '周日 20:00',
    updated: '2025 年 7 月',
    tags: ['旅行', '温情', '公路'],
  },
];

const entryProduct = document.documentElement.dataset.entryProduct === 'official' ? 'official' : 'client';

function readStoredTheme() {
  try {
    return window.localStorage.getItem('sanyePrototypeTheme');
  } catch {
    return null;
  }
}

function storeTheme(value) {
  try {
    window.localStorage.setItem('sanyePrototypeTheme', value);
  } catch {
    // 某些浏览器会禁用 file 协议存储，当前页面内的主题切换仍然有效。
  }
}

const state = {
  product: entryProduct,
  theme: readStoredTheme() === 'light' ? 'light' : 'dark',
  page: entryProduct === 'official' ? 'official-home' : 'home',
  previousPage: 'home',
  selectedAnime: 'skyline',
  searchQuery: '',
  repositoryType: '全部类型',
  repositoryYear: '全部年份',
  repositoryStatus: '全部状态',
  heroSlide: 0,
  activeConversation: 'skyline-chat',
  contextAnime: 'skyline',
  citeWorks: true,
  recommendWorks: true,
  simulateFailure: false,
  lastQuestion: '',
  quotaRemaining: 24,
  searchChip: '全部',
  legalTab: 'privacy',
  adminRole: '超级管理员',
  adminLogin: false,
  contentQuery: '',
  contentTab: '全部',
  contentDetailId: 'skyline',
  editingAnime: '',
  contentDraft: {},
  savingContent: false,
  feedbackTab: '全部',
  feedbackDetailId: 'feedback-01',
  feedbackHistory: {
    'feedback-01': ['10 分钟前 · 用户提交反馈', '林默 · 正在核实 AI 剧透来源'],
    'feedback-02': ['1 小时前 · 用户提交反馈', '陈编辑 · 已定位角色资料条目'],
    'feedback-03': ['昨天 · 用户提交反馈', '赵运营 · 已转产品需求池'],
  },
  adminUsers: [
    { id: 'u1', name: '陈编辑', role: '内容编辑', status: '启用', lastLogin: '今天 09:02' },
    { id: 'u2', name: '李审核', role: '内容审核员', status: '启用', lastLogin: '昨天 17:40' },
    { id: 'u3', name: '赵运营', role: '客服运营', status: '停用', lastLogin: '8 月 10 日' },
  ],
  adminTasks: [
    { id: 'schedule', name: '动漫排期同步', key: 'sanye_schedule_sync', type: '定时同步', time: '今天 09:00', duration: '02:18', status: '运行正常' },
    { id: 'index', name: '搜索索引增量更新', key: 'sanye_anime_index', type: '事件触发', time: '今天 08:42', duration: '00:36', status: '重试中' },
    { id: 'cache', name: '首页缓存刷新', key: 'sanye_home_cache', type: '定时刷新', time: '今天 06:00', duration: '00:08', status: '运行正常' },
    { id: 'cleanup', name: '过期会话清理', key: 'sanye_session_cleanup', type: '每日清理', time: '昨天 03:00', duration: '01:42', status: '失败' },
  ],
  auditLogs: [
    { time: '10 分钟前', operator: '陈编辑', role: '内容编辑', action: '提交审核', target: '《纸月计划》' },
    { time: '1 小时前', operator: 'AI 运营', role: 'AI 运营', action: '更新安全规则', target: '剧透安全规则 v1.4' },
    { time: '2 小时前', operator: '林默', role: '超级管理员', action: '处理反馈', target: '反馈 #FB-0281' },
  ],
  historyItems: [
    { kind: 'anime', id: 'skyline', date: '今天', time: '20:42', title: '星海回声', note: '作品详情 · 停留 3 分钟' },
    { kind: 'ai', id: '', page: 'ai', date: '昨天', time: '22:18', title: '找一部温柔的夏日动画', note: 'AI 会话 · 7 条消息' },
  ],
  conversations: [
    { id: 'skyline-chat', icon: '✦', title: '星海回声的角色关系', time: '刚刚 · 3 条消息' },
    { id: 'afterglow-chat', icon: '◌', title: '找一部温柔的夏日动画', time: '昨天 · 7 条消息' },
    { id: 'paper-moon-chat', icon: '◌', title: '推荐悬疑剧场版', time: '9 月 12 日 · 5 条消息' },
  ],
  spoilerMode: false,
  favorites: new Set(['afterglow']),
  sentMessage: '',
  pendingAnswer: false,
  messages: [
    { role: 'assistant', text: '你好，我可以帮你找番、梳理剧情，或者解释角色关系。你想从哪部作品开始？' },
  ],
  contentStatus: {
    skyline: '已发布',
    afterglow: '已发布',
    'paper-moon': '待审核',
    'blue-hour': '草稿',
  },
  feedbackStatus: {
    'feedback-01': '待处理',
    'feedback-02': '处理中',
    'feedback-03': '已关闭',
  },
};

const app = document.querySelector('#prototype-app');

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getAnime(id = state.selectedAnime) {
  return animeCatalog.find((anime) => anime.id === id) || animeCatalog[0];
}
function currentContextAnime() {
  return state.contextAnime ? getAnime(state.contextAnime) : null;
}

function pageLabel(page) {
  const labels = { home: '首页', repository: '番剧仓库', search: '搜索结果', schedule: '一周排期', ai: 'AI 对话', mine: '我的', settings: '设置', 'official-home': '官网首页', detail: '作品详情' };
  return labels[page] || '首页';
}

function conversationTitle() {
  if (state.activeConversation === 'new') return '新会话';
  const found = state.conversations.find((conv) => conv.id === state.activeConversation);
  return found ? found.title : '新会话';
}

function conversationItem(conv) {
  return `<button class="conversation-item ${state.activeConversation === conv.id ? 'is-active' : ''}" data-action="load-chat" data-chat="${conv.id}"><span class="conversation-icon">${conv.icon}</span><span><strong>${conv.title}</strong><small>${conv.time}</small></span><span class="conversation-more">···</span></button>`;
}

function aiDemoReply() {
  const anime = currentContextAnime() || getAnime();
  const replies = {
    skyline: { spoil: '在避免剧透的范围内，白石澄离开地表的原因和她对信号的执着有关。更具体的解释会涉及后续集数，你可以继续观看后再问我。', safe: '白石澄离开地表，是因为她发现旧广播塔的信号并不是故障，而是一段被人为隐藏的求救记录。她希望在修复信号之前，先确认发出它的人是否还在等待。' },
    afterglow: { spoil: '两人约定把最后一个夏天的每个黄昏都记录下来，是因为转学之后他们将不再同校；整部作品在平淡的日常里完成了告别。', safe: '这部作品的重点是两个不擅长告别的人如何面对转学，不急着制造冲突，看完会觉得很安静。' },
    'paper-moon': { spoil: '共享梦境是由城市中枢的一次实验泄漏引发的，纸月其实是记录所有梦境锚点的可视化装置。', safe: '破案线索集中在“纸月”这个只存在于纸上的月亮，主角需要先弄清为什么梦境会开始共享。' },
    'blue-hour': { spoil: '少年能看到城市被遗忘的另一面，是因为日落后的七分钟正好是两座城市交叠的时间窗口。', safe: '这部作品用“日落后的七分钟”作为界限，少年会在那个时间段看到城市不为人知的一面。' },
    'north-wind': { spoil: '列车没有固定终点，是因为它只会开往每个人真正需要面对的地方，而不是他们想去的地方。', safe: '这是一部公路式作品，重点在三位旅人如何面对各自逃避的答案，适合慢慢看。' },
  };
  const entry = replies[anime.id] || replies.skyline;
  return state.spoilerMode ? entry.spoil : entry.safe;
}

function aiRecommendation() {
  const current = currentContextAnime() || getAnime();
  const index = animeCatalog.findIndex((item) => item.id === current.id);
  const next = animeCatalog[(index + 1) % animeCatalog.length];
  return next.id === current.id ? null : next;
}

function showToast(text) {
  const toast = document.querySelector('.prototype-toast');
  if (!toast) return;
  toast.textContent = text;
  toast.classList.add('is-visible');
  window.clearTimeout(window.__sanyeToastTimer);
  window.__sanyeToastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function legalTabs() {
  return [
    { id: 'privacy', label: '隐私政策', meta: '2026.09' },
    { id: 'terms', label: '使用条款', meta: '2026.09' },
    { id: 'copyright', label: '版权与内容来源', meta: '2026.09' },
    { id: 'contact', label: '联系我们', meta: 'support@sanye.example' },
  ];
}

function legalCopy() {
  const copy = {
    privacy: '<h2>隐私政策摘要</h2><p>sanye_anime 只在提供账户、收藏、历史和 AI 会话功能所必需的范围内处理用户数据。你可以在客户端设置中查看、导出或删除属于自己的数据。</p><h3>AI 内容说明</h3><p>AI 回答是基于已发布作品信息生成的辅助内容，不应替代官方来源。你可以使用避免剧透模式，并在发现内容问题时提交反馈。</p><h3>内容与链接</h3><p>公开作品信息、图片和外部链接需要经过审核。产品不提供未授权的观看、下载或资源聚合。</p>',
    terms: '<h2>使用条款摘要</h2><p>sanye_anime 提供动漫内容发现、搜索与 AI 对话服务，公开内容仅用于信息展示。</p><h3>账户与内容</h3><p>用户应对自己提交的问题、反馈和账户操作负责；运营人员对内容审核与发布负责。</p><h3>服务边界</h3><p>产品不提供未授权的观看、下载或资源聚合，外部链接是否可访问以来源方规则为准。</p>',
    copyright: '<h2>版权与内容来源</h2><p>作品信息、图片和外部链接必须经过来源审核，并在发布记录中保留授权范围与有效期。</p><h3>引用规则</h3><p>公开作品信息只引用已核验的来源；AI 回答属于辅助内容，不应替代官方来源。</p><h3>删除与下架</h3><p>权利人提出异议后，相关内容会按流程下架并保留审计记录。</p>',
    contact: '<h2>联系我们</h2><p>关于隐私、内容来源和账号数据的疑问，可以发送邮件至 support@sanye.example。</p><h3>处理时限</h3><p>我们会在收到请求后尽快处理，并在必要时与你确认身份信息。</p><h3>正式渠道</h3><p>以上邮箱为原型演示占位信息，正式上线前替换为实际联系渠道。</p>',
  };
  return copy[state.legalTab] || copy.privacy;
}

function icon(name) {
  const icons = {
    home: '⌂',
    search: '⌕',
    ai: '✦',
    mine: '◌',
    detail: '▣',
    dashboard: '▦',
    content: '◫',
    feedback: '◔',
    tasks: '↻',
    users: '▤',
    audit: '≣',
    settings: '⚙',
    moon: '☾',
    sun: '☀',
    arrow: '→',
    star: '☆',
    check: '✓',
  };
  return icons[name] || '·';
}

function productSwitcher() {
  return `
    <div class="product-switcher" role="tablist" aria-label="产品入口">
      <button class="product-tab ${state.product === 'client' ? 'is-active' : ''}" data-product="client" role="tab" aria-selected="${state.product === 'client'}">客户端</button>
      <button class="product-tab ${state.product === 'official' ? 'is-active' : ''}" data-product="official" role="tab" aria-selected="${state.product === 'official'}">official</button>
      <button class="product-tab ${state.product === 'admin' ? 'is-active' : ''}" data-product="admin" role="tab" aria-selected="${state.product === 'admin'}">管理平台</button>
    </div>
  `;
}

function topbar() {
  const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
  return `
    <header class="prototype-topbar">
      <a class="prototype-brand" href="#" data-action="reset-client" aria-label="返回 sanye_anime 原型首页">
        <span class="brand-symbol">S</span>
        <span><strong>sanye_anime</strong><small>三叶动漫</small></span>
      </a>
      ${productSwitcher()}
      <div class="prototype-meta"><button class="theme-toggle" data-action="toggle-theme" aria-label="切换到${nextTheme === 'light' ? '亮色' : '暗色'}主题" aria-pressed="${state.theme === 'light'}" title="切换到${nextTheme === 'light' ? '亮色' : '暗色'}主题"><span>${icon(nextTheme === 'light' ? 'sun' : 'moon')}</span></button><span class="live-dot"></span>页面原型 · 可交互预览</div><div class="prototype-toast" role="status" aria-live="polite"></div>
    </header>
  `;
}

function clientSidebar() {
  const items = [
    ['home', '首页', 'home'],
    ['detail', '番剧仓库', 'repository'],
    ['ai', 'AI 动漫助手', 'ai'],
    ['tasks', '一周排期', 'schedule'],
    ['mine', '我的', 'mine'],
  ];
  return `
    <aside class="app-sidebar client-sidebar">
      <div class="sidebar-caption">观影工作台</div>
      <nav class="sidebar-nav" aria-label="客户端导航">
        ${items.map(([key, label, page]) => `<button class="sidebar-link ${state.page === page ? 'is-active' : ''}" data-page="${page}"><span class="nav-icon">${icon(key)}</span><span>${label}</span>${page === 'ai' ? '<span class="nav-count">3</span>' : ''}</button>`).join('')}
      </nav>
      <div class="sidebar-divider"></div>
      <div class="sidebar-caption">最近观看</div>
      <button class="recent-item" data-anime="afterglow"><span class="mini-cover cover-blue"></span><span><strong>夏末余晖</strong><small>看到第 08 集</small></span></button>
      <button class="recent-item" data-anime="skyline"><span class="mini-cover cover-coral"></span><span><strong>星海回声</strong><small>看到第 03 集</small></span></button>
      <div class="sidebar-bottom"><button class="sidebar-link" data-page="settings"><span class="nav-icon">${icon('settings')}</span><span>设置</span></button><div class="user-chip"><span class="user-avatar">林</span><span><strong>林默</strong><small>普通用户</small></span><span class="user-more">···</span></div></div>
    </aside>
  `;
}

function clientHeader() {
  return `
    <div class="client-header">
      <div><span class="section-kicker">${state.page === 'home' ? '星期四 · 9 月 18 日' : 'sanye_anime / 用户空间'}</span><h1>${state.page === 'home' ? '晚上好，林默。' : clientPageTitle()}</h1></div>
      <div class="header-actions"><button class="icon-only" title="通知" aria-label="通知">◌<span class="notification-dot"></span></button><button class="avatar-button" data-page="mine">林</button></div>
    </div>
  `;
}

function clientPageTitle() {
  const titles = { repository: '浏览全部番剧', search: '找到下一部想看的作品', schedule: '查看本周排期', ai: '把问题交给动漫助手', mine: '你的观看记录', detail: getAnime().title, settings: '设置' };
  return titles[state.page] || 'sanye_anime';
}

function coverArt(anime, size = '') {
  return `<div class="cover-art cover-${anime.color} ${size}" data-anime="${anime.id}"><span class="cover-stamp">${anime.type}</span><strong>${anime.title}</strong><small>${anime.originalTitle}</small><em>${anime.score}</em><i></i></div>`;
}

function animeCard(anime, compact = false) {
  return `<button class="anime-card ${compact ? 'is-compact' : ''}" data-anime="${anime.id}">${coverArt(anime, compact ? 'card-cover' : '')}<span class="anime-card-copy"><strong>${anime.title}</strong><small>${anime.meta}</small><span class="card-rating">★ ${anime.score}</span></span></button>`;
}

function homePage() {
  const slides = [getAnime('skyline'), getAnime('blue-hour'), getAnime('afterglow')];
  const feature = slides[state.heroSlide];
  const slideCopy = [
    ['今晚，去听一听', '城市之外的回声。', '今晚 22:00 更新'],
    ['在日落后的七分钟', '看见城市的另一面。', '本周五 21:30 更新'],
    ['把夏末的黄昏', '留在最后一页。', '全 13 集已完结'],
  ][state.heroSlide];
  return `
    <div class="page-content client-page">
      ${clientHeader()}
      <form class="home-search-static" data-action="search-home"><span>${icon('search')}</span><input id="home-search-input" placeholder="搜索番剧、类型或故事线索" /><button type="submit" title="搜索">${icon('arrow')}</button></form>
      <section class="client-hero">
        <div class="hero-copy"><div class="hero-slide-meta"><span class="hero-label">本周焦点</span><small>${slideCopy[2]}</small></div><h2>${slideCopy[0]}<br><em>${slideCopy[1]}</em></h2><p>${feature.summary}</p><div class="hero-actions"><button class="button button-primary" data-anime="${feature.id}">查看作品 <span>${icon('arrow')}</span></button><button class="button button-quiet" data-page="ai"><span>${icon('ai')}</span>问问 AI</button></div><div class="hero-index"><button data-action="previous-slide" aria-label="上一张">←</button>${slides.map((_, index) => `<button class="${state.heroSlide === index ? 'is-current' : ''}" data-action="select-slide" data-slide="${index}" aria-label="查看第 ${index + 1} 张">${String(index + 1).padStart(2, '0')}</button>`).join('')}<button data-action="next-slide" aria-label="下一张">→</button></div></div>
        <button class="hero-visual hero-poster poster-${feature.color}" data-anime="${feature.id}" aria-label="查看${feature.title}"><div class="visual-orbit orbit-one"></div><div class="visual-orbit orbit-two"></div><div class="visual-star star-one">✦</div><div class="visual-star star-two">✧</div><span class="static-meteor"></span><div class="visual-label">精选动漫<br>${String(state.heroSlide + 1).padStart(2, '0')} / 03</div><div class="hero-poster-title"><strong>${feature.title}</strong><small>${feature.tags.slice(0, 2).join(' · ')}</small></div></button>
      </section>

      <section class="ai-strip"><div class="ai-strip-mark">✦</div><div class="ai-strip-copy"><span class="section-kicker">AI 动漫助手</span><strong>不知道下一部看什么？</strong><p>告诉我你最近喜欢的作品，我来帮你找到相似的故事。</p></div><div class="ai-prompts"><button data-page="ai">“想看一部节奏慢一点的科幻番”</button><button data-page="ai">“帮我回忆《星海回声》的角色关系”</button></div><button class="round-arrow" data-page="ai" title="打开 AI 动漫助手">${icon('arrow')}</button></section>

      <section class="content-section"><div class="section-heading"><div><span class="section-kicker">刚刚抵达片库</span><h2>最近更新</h2></div><button class="text-link" data-page="repository">查看番剧仓库 ${icon('arrow')}</button></div><div class="anime-grid">${animeCatalog.slice(0, 3).map((anime) => animeCard(anime)).join('')}</div></section>

      <section class="content-section split-section"><div class="section-heading"><div><span class="section-kicker">正在被更多人打开</span><h2>热门动漫</h2></div><button class="text-link" data-page="repository">更多作品 ${icon('arrow')}</button></div><div class="anime-grid">${animeCatalog.slice(2, 5).map((anime) => animeCard(anime)).join('')}</div></section>

      <section class="schedule-section"><div class="section-heading"><div><span class="section-kicker">本周 · 星期四</span><h2>黄昏排期</h2></div><button class="date-chip" data-page="schedule">查看一周排期 <span>${icon('arrow')}</span></button></div><div class="schedule-board"><div class="schedule-day is-today"><span>今天</span><strong>18</strong><small>周四</small></div><div class="schedule-day"><span>明天</span><strong>19</strong><small>周五</small></div><div class="schedule-day"><span>后天</span><strong>20</strong><small>周六</small></div><div class="schedule-day"><span>周日</span><strong>21</strong><small>周日</small></div><div class="schedule-day"><span>周一</span><strong>22</strong><small>周一</small></div><div class="schedule-items"><button data-anime="blue-hour"><span class="schedule-time">21:30</span><span class="schedule-dot dot-blue"></span><span><strong>蓝色时刻</strong><small>第 11 集 · 更新</small></span></button><button data-anime="skyline"><span class="schedule-time">22:00</span><span class="schedule-dot dot-coral"></span><span><strong>星海回声</strong><small>第 04 集 · 更新</small></span></button></div></div></section>
    </div>
  `;
}

function repositoryPage() {
  const years = ['全部年份', '2026', '2025', '2024', '2023', '2022', '2021', '2020'];
  const results = animeCatalog.filter((anime) => {
    const matchesQuery = !state.searchQuery || `${anime.title}${anime.originalTitle}${anime.tags.join('')}`.toLowerCase().includes(state.searchQuery.toLowerCase());
    const matchesType = state.repositoryType === '全部类型' || anime.type === state.repositoryType;
    const matchesYear = state.repositoryYear === '全部年份' || anime.meta.startsWith(state.repositoryYear);
    const matchesStatus = state.repositoryStatus === '全部状态' || (state.repositoryStatus === '连载中' ? anime.schedule !== '已完结' && anime.schedule !== '剧场版' : anime.schedule === '已完结');
    return matchesQuery && matchesType && matchesYear && matchesStatus;
  });
  return `
    <div class="page-content client-page repository-page">
      ${clientHeader()}
      <section class="repository-heading"><div><span class="section-kicker">作品内容库 · 全部作品</span><h2>番剧仓库</h2><p>集中浏览全部番剧，按关键词、类型、状态和年份找到下一部作品。</p></div><strong>${results.length}<small>部作品</small></strong></section>
      <section class="repository-toolbar-static"><label><span>搜索</span><input id="repository-search" value="${escapeHtml(state.searchQuery)}" placeholder="输入作品或标签" /></label><label><span>类型</span><select data-filter="type">${['全部类型', '原创动画', '电视动画', '剧场版', '网络动画'].map((item) => `<option ${state.repositoryType === item ? 'selected' : ''}>${item}</option>`).join('')}</select></label><label><span>状态</span><select data-filter="status">${['全部状态', '连载中', '已完结'].map((item) => `<option ${state.repositoryStatus === item ? 'selected' : ''}>${item}</option>`).join('')}</select></label><label><span>年份</span><select data-filter="year">${years.map((item) => `<option ${state.repositoryYear === item ? 'selected' : ''}>${item}</option>`).join('')}</select></label></section>
      <div class="repository-result-line"><span>当前显示 ${results.length} 部作品</span><button class="text-link" data-action="clear-filters">清除筛选</button></div>
      ${results.length ? `<section class="repository-static-grid">${results.map((anime) => `<article class="repository-static-card">${coverArt(anime, 'repository-cover')}<div><span class="repository-card-meta">${anime.schedule === '已完结' ? '已完结' : '连载中'} · 热度 ${anime.score}</span><h3>${anime.title}</h3><p>${anime.meta}</p><small>${anime.summary}</small><div class="tag-list">${anime.tags.slice(0, 3).map((tag) => `<em>${tag}</em>`).join('')}</div><button class="button button-outline" data-anime="${anime.id}">查看详情 ${icon('arrow')}</button></div></article>`).join('')}</section>` : `<div class="empty-state"><span class="empty-mark">⌕</span><h3>没有符合条件的作品</h3><p>调整年份、类型或搜索关键词后再试。</p><button class="button button-primary" data-action="clear-filters">清除筛选</button></div>`}
    </div>
  `;
}

function schedulePage() {
  const days = [
    ['周一', '09 月 15 日', '雨停之后', '19:30'], ['周二', '09 月 16 日', '向北的风', '20:00'],
    ['周三', '09 月 17 日', '纸月计划', '20:45'], ['周四', '09 月 18 日', '星海回声', '22:00'],
    ['周五', '09 月 19 日', '蓝色时刻', '21:30'], ['周六', '09 月 20 日', '潮汐与月光', '23:15'],
    ['周日', '09 月 21 日', '夏末余晖', '20:30'],
  ];
  return `<div class="page-content client-page schedule-page-static">${clientHeader()}<section class="schedule-static-heading"><div><span class="section-kicker">09 月 15 日 — 09 月 21 日</span><h2>一周排期总览</h2><p>按星期查看本周作品更新时间，点击作品可进入详情。</p></div><strong>7<small>天</small></strong></section><section class="weekly-board">${days.map(([day, date, title, time], index) => { const anime = animeCatalog[index % animeCatalog.length]; return `<article class="weekly-day ${day === '周四' ? 'is-today' : ''}"><header><span>${day}</span><small>${date}</small></header><button data-anime="${anime.id}"><time>${time}</time><span><strong>${title}</strong><small>${day === '周四' ? '今天更新' : '计划更新'} · 第 ${String(index + 4).padStart(2, '0')} 集</small></span><b>${icon('arrow')}</b></button></article>`; }).join('')}</section></div>`;
}

function searchPage() {
  const query = state.searchQuery.trim().toLowerCase();
  const results = (query ? animeCatalog.filter((anime) => `${anime.title}${anime.originalTitle}${anime.tags.join('')}`.toLowerCase().includes(query)) : animeCatalog).filter((anime) => {
    if (state.searchChip === '全部') return true;
    if (state.searchChip === '电视动画' || state.searchChip === '剧场版') return anime.type === state.searchChip;
    return anime.tags.includes(state.searchChip);
  });
  return `
    <div class="page-content client-page">
      ${clientHeader()}
      <section class="search-panel"><div class="large-search"><span>${icon('search')}</span><input id="search-input" value="${escapeHtml(state.searchQuery)}" placeholder="搜索作品、角色、类型或关键词" autofocus /><kbd>⌘ K</kbd></div><div class="filter-row">${['全部', '电视动画', '剧场版', '科幻', '治愈'].map((chip) => `<button class="filter-chip ${state.searchChip === chip ? 'is-active' : ''}" data-action="search-filter" data-value="${chip}">${chip}</button>`).join('')}<span class="result-count">${results.length} 部作品</span></div></section>
      <section class="search-results"><div class="section-heading"><div><span class="section-kicker">搜索结果</span><h2>${query ? `关于“${escapeHtml(state.searchQuery)}”` : '推荐作品'}</h2></div><span class="sort-label">按热度排序 ⌄</span></div>${results.length ? `<div class="result-list">${results.map((anime, index) => `<button class="result-row" data-anime="${anime.id}"><span class="result-rank">${String(index + 1).padStart(2, '0')}</span>${coverArt(anime, 'result-cover')}<span class="result-copy"><strong>${anime.title}</strong><small>${anime.originalTitle}</small><p>${anime.summary}</p><span class="tag-list">${anime.tags.map((tag) => `<em>${tag}</em>`).join('')}</span></span><span class="result-score"><strong>★ ${anime.score}</strong><small>${anime.meta}</small></span><span class="result-arrow">${icon('arrow')}</span></button>`).join('')}</div>` : `<div class="empty-state"><span class="empty-mark">⌕</span><h3>还没有找到匹配作品</h3><p>换一个关键词，或者让 AI 帮你找到更合适的作品。</p><button class="button button-primary" data-page="ai">让 AI 帮我找番 ${icon('arrow')}</button></div>`}</section>
    </div>
  `;
}

function detailPage() {
  const anime = getAnime();
  const isFavorite = state.favorites.has(anime.id);
  return `
    <div class="page-content client-page">
      ${clientHeader()}
      <button class="back-link" data-page="${state.previousPage || 'home'}">← 返回${pageLabel(state.previousPage || 'home')}</button>
      <section class="detail-hero"><div class="detail-cover-wrap">${coverArt(anime, 'detail-cover')}<span class="cover-glow"></span></div><div class="detail-main"><div class="detail-topline"><span class="status-pill">${anime.type}</span><span class="detail-score">★ ${anime.score} <small>用户评分</small></span></div><h2>${anime.title}</h2><p class="original-title">${anime.originalTitle}</p><p class="detail-summary">${anime.summary}</p><div class="tag-list">${anime.tags.map((tag) => `<em>${tag}</em>`).join('')}</div><div class="detail-actions"><button class="button button-primary" data-action="ask-ai"><span>${icon('ai')}</span>围绕这部作品提问</button><button class="button ${isFavorite ? 'button-favorite' : 'button-outline'}" data-action="toggle-favorite"><span>${isFavorite ? '★' : icon('star')}</span>${isFavorite ? '已收藏' : '收藏作品'}</button></div><div class="detail-facts"><span><small>状态</small>${anime.schedule}</span><span><small>集数</small>${anime.meta.split('·')[1].trim()}</span><span><small>更新</small>${anime.updated}</span></div></div></section>
      <section class="detail-columns"><div><div class="section-heading"><div><span class="section-kicker">故事与角色</span><h2>作品信息</h2></div></div><div class="detail-text"><p>${anime.summary} 这部作品把宏大的城市想象，放进几位普通角色的日常选择里。适合喜欢慢慢建立世界观、关注人物关系的观众。</p><p>建议观看顺序：正篇第 1 集 → 正篇第 2 集 → 特别篇《广播塔日志》。</p></div><div class="cast-grid"><div><span class="cast-avatar cast-pink">澄</span><span><strong>白石澄</strong><small>修复师 / 主角</small></span></div><div><span class="cast-avatar cast-blue">遥</span><span><strong>渡边遥</strong><small>信号分析师</small></span></div><div><span class="cast-avatar cast-green">零</span><span><strong>零号塔</strong><small>未知信号源</small></span></div></div></div><aside class="detail-aside"><div class="aside-box"><span class="section-kicker">观看建议</span><strong>先别急着搜索答案。</strong><p>这部作品的悬念会在第 04 集开始集中展开。如果你介意剧透，可以让 AI 只回答当前集数之前的信息。</p><button class="text-link" data-action="ask-ai-safe">开启无剧透对话 ${icon('arrow')}</button></div><div class="aside-box aside-dark"><span class="section-kicker">相似作品</span>${animeCatalog.filter((item) => item.id !== anime.id).slice(0, 2).map((item) => `<button class="similar-item" data-anime="${item.id}">${coverArt(item, 'tiny-cover')}<span><strong>${item.title}</strong><small>★ ${item.score} · ${item.tags[0]}</small></span><span>${icon('arrow')}</span></button>`).join('')}</div></aside></section>
    </div>
  `;
}

function aiPage() {
  const context = currentContextAnime();
  return `
    <div class="page-content client-page ai-page-content">
      ${clientHeader()}
      <section class="ai-workspace"><aside class="conversation-panel"><div class="conversation-heading"><div><span class="section-kicker">你的空间</span><h2>会话</h2></div><button class="icon-only dark-icon" data-action="new-chat" title="新建会话">＋</button></div><button class="new-chat-button" data-action="new-chat">＋ 新建会话</button><div class="conversation-group"><span class="group-label">今天</span>${state.conversations.slice(0, 2).map((conv) => conversationItem(conv)).join('')}</div><div class="conversation-group"><span class="group-label">更早</span>${state.conversations.slice(2).map((conv) => conversationItem(conv)).join('')}</div><div class="conversation-bottom"><span class="ai-usage"><i></i><span><strong>今日 AI 额度</strong><small>还剩 ${state.quotaRemaining} / 30 次</small></span></span><button class="text-link">查看规则</button></div></aside><main class="chat-panel"><div class="chat-top"><div><span class="section-kicker">当前会话</span><h2>${conversationTitle()}</h2></div><div class="chat-top-actions">${state.pendingAnswer ? '<button class="icon-only stop-button" data-action="stop-answer" title="停止回答" aria-label="停止回答">■</button>' : ''}<button class="icon-only" title="搜索会话">⌕</button><button class="icon-only" title="更多操作">···</button></div></div><div class="chat-messages">${state.messages.map((message) => `<div class="message-row ${message.role}"><span class="message-avatar ${message.role === 'assistant' ? 'assistant-avatar' : 'user-avatar'}">${message.role === 'assistant' ? '✦' : '林'}</span><div class="message-bubble"><span class="message-name">${message.role === 'assistant' ? '三叶助手' : '林默'}</span><p>${escapeHtml(message.text)}</p>${message.failed ? '<div class="message-actions"><button class="text-link" data-action="regenerate">重试回答 →</button></div>' : ''}${message.stopped ? '<div class="message-actions"><button class="text-link" data-action="regenerate">重新生成 →</button></div>' : ''}${message.recommendation ? `<button class="message-recommendation" data-anime="${message.recommendation.id}">${coverArt(message.recommendation, 'message-cover')}<span><strong>${message.recommendation.title}</strong><small>与你的问题有关 · ★ ${message.recommendation.score}</small></span><span>${icon('arrow')}</span></button>` : ''}</div></div>`).join('')}${state.pendingAnswer ? `<div class="message-row assistant"><span class="message-avatar assistant-avatar">✦</span><div class="message-bubble pending-bubble"><span class="message-name">三叶助手</span><div class="typing-dots"><i></i><i></i><i></i></div></div></div>` : ''}</div><div class="chat-composer"><div class="composer-tools"><button class="composer-tool ${state.spoilerMode ? 'is-active' : ''}" data-action="toggle-spoiler"><span>${state.spoilerMode ? '◉' : '◎'}</span>${state.spoilerMode ? '允许剧透' : '避免剧透'}</button><button class="composer-tool">＋ 添加作品</button><button class="composer-tool ${state.simulateFailure ? 'is-active' : ''}" data-action="toggle-failure"><span>⚠</span>模拟失败</button></div><form class="composer-form" data-action="send-ai"><input id="ai-input" placeholder="问问关于动漫的任何事……" autocomplete="off" /><button class="send-button" type="submit" title="发送问题">${icon('arrow')}</button></form><div class="suggestion-row"><button data-action="fill-ai" data-prompt="不用剧透，介绍一下这部作品">不用剧透，介绍这部作品</button><button data-action="fill-ai" data-prompt="推荐几部和这部作品相似的作品">推荐相似作品</button><button data-action="fill-ai" data-prompt="这部作品适合什么心情的时候看？">适合什么心情看？</button></div></div></main><aside class="context-panel"><div class="context-heading"><span class="section-kicker">当前上下文</span><button class="icon-only" title="移除上下文" data-action="clear-context">×</button></div><div class="context-anime">${context ? `${coverArt(context, 'context-cover')}<strong>${context.title}</strong><small>${context.meta}</small><button data-anime="${context.id}">查看详情 ${icon('arrow')}</button>` : '<strong>尚未选择作品</strong><small>打开作品详情页后，故事脉络会显示在对话旁边。</small>'}</div><div class="context-setting"><span class="section-kicker">回答设置</span><label><span>剧透模式</span><button class="toggle ${state.spoilerMode ? 'is-on' : ''}" data-action="toggle-spoiler"><i></i></button></label><label><span>引用作品信息</span><button class="toggle ${state.citeWorks ? 'is-on' : ''}" data-action="toggle-cite" aria-pressed="${state.citeWorks}"><i></i></button></label><label><span>推荐相似作品</span><button class="toggle ${state.recommendWorks ? 'is-on' : ''}" data-action="toggle-recommend" aria-pressed="${state.recommendWorks}"><i></i></button></label></div><div class="context-note"><span>ⓘ</span><p>回答会优先参考已发布的作品信息。AI 生成内容仅供参考。</p></div></aside></section>
    </div>
  `;
}

function minePage() {
  return `
    <div class="page-content client-page">
      ${clientHeader()}
      <section class="profile-overview"><div class="profile-avatar">林</div><div><span class="section-kicker">当前账号</span><h2>林默</h2><p>从 2025 年 8 月开始探索 sanye_anime</p></div><button class="button button-outline" data-page="settings">编辑资料</button></section>
      <section class="mine-grid"><div class="mine-block"><div class="section-heading"><div><span class="section-kicker">已收藏作品</span><h2>我的收藏 <small>${state.favorites.size}</small></h2></div><button class="text-link" data-page="repository">查看全部 ${icon('arrow')}</button></div><div class="saved-list">${animeCatalog.filter((anime) => state.favorites.has(anime.id)).map((anime) => `<button class="saved-item" data-anime="${anime.id}">${coverArt(anime, 'saved-cover')}<span><strong>${anime.title}</strong><small>${anime.meta}</small><em>已收藏 · ★ ${anime.score}</em></span><span>${icon('arrow')}</span></button>`).join('')}</div></div><div class="mine-block"><div class="section-heading"><div><span class="section-kicker">最近浏览</span><h2>最近浏览</h2></div><button class="text-link" data-action="clear-history">清空记录</button></div><div class="history-list">${state.historyItems.length ? state.historyItems.map((item) => item.kind === 'anime' ? `<button class="history-item" data-anime="${item.id}"><span class="history-time">${item.date}<br><strong>${item.time}</strong></span><span class="history-mark cover-coral"></span><span><strong>${item.title}</strong><small>${item.note}</small></span></button>` : `<button class="history-item" data-page="${item.page}"><span class="history-time">${item.date}<br><strong>${item.time}</strong></span><span class="history-mark ai-history">✦</span><span><strong>${item.title}</strong><small>${item.note}</small></span></button>`).join('') : '<div class="empty-state"><span class="empty-mark">◷</span><h3>还没有浏览记录</h3><p>看过的作品和 AI 会话会记录在这里。</p></div>'}</div></div></section><section class="settings-section"><div class="section-heading"><div><span class="section-kicker">偏好设置</span><h2>偏好设置</h2></div></div><div class="preference-list"><button><span><strong>默认剧透模式</strong><small>新建 AI 会话时的默认回答方式</small></span><strong class="pref-value">避免剧透 <span>›</span></strong></button><button><span><strong>通知</strong><small>作品更新、会话结果和产品消息</small></span><strong class="pref-value">已开启 <span>›</span></strong></button><button><span><strong>隐私与数据</strong><small>管理你的收藏、历史和对话数据</small></span><strong class="pref-value">管理 <span>›</span></strong></button></div></section>
    </div>
  `;
}

function settingsPage() {
  return `<div class="page-content client-page">${clientHeader()}<section class="settings-section settings-page"><div class="section-heading"><div><span class="section-kicker">账号设置</span><h2>设置</h2></div></div><div class="preference-list"><button><span><strong>账户与登录</strong><small>当前登录设备和安全设置</small></span><strong class="pref-value">林默 <span>›</span></strong></button><button><span><strong>默认剧透模式</strong><small>控制 AI 回答中是否展示剧情信息</small></span><strong class="pref-value">避免剧透 <span>›</span></strong></button><button><span><strong>数据与隐私</strong><small>导出或删除你的个人数据</small></span><strong class="pref-value">管理 <span>›</span></strong></button></div><button class="button button-danger" data-action="logout">退出登录</button></section></div>`;
}

function officialNav() {
  return `<nav class="website-nav"><button class="website-nav-link ${state.page === 'official-home' ? 'is-active' : ''}" data-page="official-home">首页</button><button class="website-nav-link ${state.page === 'official-about' ? 'is-active' : ''}" data-page="official-about">产品</button><button class="website-nav-link ${state.page === 'official-download' ? 'is-active' : ''}" data-page="official-download">下载</button><button class="website-nav-link ${state.page === 'official-legal' ? 'is-active' : ''}" data-page="official-legal">隐私与条款</button><button class="button button-dark website-entry" data-action="enter-client">进入 sanye_anime ${icon('arrow')}</button></nav>`;
}

function officialHome() {
  return `<div class="website-page"><header class="website-header"><a class="website-brand" data-action="reset-official"><span class="brand-symbol">S</span><span><strong>official</strong><small>三叶动漫</small></span></a>${officialNav()}</header><main><section class="website-hero"><div class="website-hero-copy"><span class="eyebrow-light">为每一次观看，找到更多线索</span><h1>你的下一部动漫，<br><em>不必靠运气。</em></h1><p>sanye_anime 把作品发现、角色信息和 AI 对话放在同一张桌面上。先找到想看的故事，再决定要不要深入其中。</p><div class="website-hero-actions"><button class="button button-light" data-action="enter-client">打开 sanye_anime <span>${icon('arrow')}</span></button><button class="website-text-button" data-page="official-download">下载客户端 <span>↓</span></button><button class="website-text-button" data-page="official-about">了解产品 <span>${icon('arrow')}</span></button></div></div><div class="website-hero-art"><div class="hero-art-grid"></div><div class="hero-art-ring ring-a"></div><div class="hero-art-ring ring-b"></div><span class="official-meteor meteor-primary"></span><span class="official-meteor meteor-secondary"></span><span class="hero-art-note">好故事<br>就在<br>下一页</span><span class="hero-art-slice">三叶 / 01</span></div></section><section class="official-download-strip"><span class="brand-symbol">S</span><div><span class="eyebrow-dark">电脑客户端</span><h3>把这段星空带在身边。</h3><p>下载 sanye_anime PC 客户端，获得完整的动漫发现与 AI 对话工作区。</p></div><button class="website-text-button" data-page="official-download">查看下载信息 ${icon('arrow')}</button></section><section class="website-section intro-section"><div><span class="eyebrow-dark">三种方式，进入一部作品</span><h2>从“想看什么”<br>到“为什么喜欢”。</h2></div><div class="feature-columns"><article><span class="feature-number">01</span><h3>先发现</h3><p>从精选、新番、榜单和排期开始，不错过下一部刚好适合你的作品。</p></article><article><span class="feature-number">02</span><h3>再理解</h3><p>打开作品详情，快速了解角色、标签、观看顺序和不剧透的内容提示。</p></article><article><span class="feature-number">03</span><h3>继续问</h3><p>让 AI 帮你找番、梳理剧情和解释关系，但答案永远给你选择权。</p></article></div></section><section class="website-section public-picks"><div class="section-heading website-heading"><div><span class="eyebrow-dark">公开精选</span><h2>最近值得打开的故事</h2></div><button class="website-text-button" data-action="enter-repository">浏览全部 ${icon('arrow')}</button></div><div class="website-pick-grid">${animeCatalog.slice(0, 3).map((anime) => `<button data-anime="${anime.id}">${coverArt(anime, 'website-cover')}<span><strong>${anime.title}</strong><small>${anime.tags.slice(0, 2).join(' · ')} · ★ ${anime.score}</small></span></button>`).join('')}</div></section></main><footer class="website-footer"><span>© 2026 official</span><span>公开内容 · 使用条款 · 隐私政策</span><span>一个为动漫爱好者制作的发现工具</span></footer></div>`;
}

function officialAbout() {
  return `<div class="website-page"><header class="website-header"><a class="website-brand" data-action="reset-official"><span class="brand-symbol">S</span><span><strong>official</strong><small>三叶动漫</small></span></a>${officialNav()}</header><main><section class="website-inner-hero"><span class="eyebrow-dark">产品介绍</span><h1>让动漫的“下一步”，<br><em>变得更容易。</em></h1><p>sanye_anime 不是一个把所有内容堆在一起的目录，而是一张连接作品、问题和观看体验的桌面。</p></section><section class="about-manifesto"><div class="manifesto-mark">✦</div><div><span class="eyebrow-dark">我们相信</span><h2>好的推荐，不只是告诉你“看什么”，还应该让你知道“为什么是它”。</h2><p>所以我们把搜索、作品信息和 AI 动漫助手放在一起，让每一次探索都能自然地继续下去。</p></div></section><section class="about-grid"><article><span>客户端</span><h3>一张为长时间观看准备的桌面</h3><p>多栏信息、清晰状态和快速切换，让你在作品、会话和收藏之间保持上下文。</p><button class="website-text-button" data-action="enter-client">进入 sanye_anime ${icon('arrow')}</button></article><article><span>AI 助手</span><h3>先理解，再决定要不要被剧透</h3><p>你可以控制回答范围，带着一部作品的上下文提问，也可以只说一句“帮我找一部类似的”。</p><button class="website-text-button" data-action="enter-client-ai">试用 AI 工作区 ${icon('arrow')}</button></article></section></main><footer class="website-footer"><span>© 2026 official</span><span>产品介绍</span><span>联系我们</span></footer></div>`;
}

function officialLegal() {
  return `<div class="website-page"><header class="website-header"><a class="website-brand" data-action="reset-official"><span class="brand-symbol">S</span><span><strong>official</strong><small>三叶动漫</small></span></a>${officialNav()}</header><main><section class="legal-layout"><div><span class="eyebrow-dark">法律信息</span><h1>使用前，<br><em>先了解边界。</em></h1><p>这里展示产品使用、隐私和内容来源相关的公开说明。正式上线前，文案需要经过审查并替换为最终版本。</p></div><div class="legal-menu">${legalTabs().map((tab) => `<button class="${state.legalTab === tab.id ? 'is-active' : ''}" data-action="legal-tab" data-tab="${tab.id}">${tab.label} <span>${tab.meta}</span></button>`).join('')}</div></section><section class="legal-copy">${legalCopy()}</section></main><footer class="website-footer"><span>© 2026 official</span><span>隐私政策</span><span>使用条款</span></footer></div>`;
}

function officialDownload() {
  return `<div class="website-page"><header class="website-header"><a class="website-brand" data-action="reset-official"><span class="brand-symbol">S</span><span><strong>official</strong><small>三叶动漫</small></span></a>${officialNav()}</header><main><section class="download-static-hero"><div><button class="back-link" data-page="official-home">← 返回官网首页</button><span class="eyebrow-light">sanye_anime / 电脑客户端</span><h1>让每一次打开，<br><em>都像看见黄昏。</em></h1><p>这里是 sanye_anime 的 PC 客户端入口。当前静态原型可以直接体验全部页面交互，不需要启动本地服务。</p><div class="website-hero-actions"><button class="button button-light" data-action="enter-client">直接体验客户端 ${icon('arrow')}</button><button class="website-text-button" data-action="show-download-message">查看安装包状态</button></div></div><div class="download-static-visual"><span class="official-meteor meteor-primary"></span><span class="official-meteor meteor-secondary"></span><span class="download-orbit"></span><strong>三</strong><small>宫水三叶<br>资料档案</small></div></section><section class="download-static-status"><div><span class="eyebrow-dark">当前版本</span><h2>交互原型 0.1.0</h2><p>网页静态原型已可直接打开。Windows、macOS 安装包将在正式开发与签名完成后提供。</p></div><span>静态演示版</span></section><section class="download-static-features"><article><span>01</span><h3>直接打开</h3><p>双击 HTML 文件即可查看，不需要 Node、Vite 或本地服务。</p></article><article><span>02</span><h3>完整交互</h3><p>页面导航、主题、轮播、筛选、收藏和 AI 模拟均可操作。</p></article><article><span>03</span><h3>离线展示</h3><p>样式和脚本使用本地相对路径，可以整体复制后离线演示。</p></article></section></main><footer class="website-footer"><span>© 2026 official</span><span>客户端下载</span><span>版本 0.1.0 · 原型</span></footer></div>`;
}

function adminRoleOptions() {
  return ['超级管理员', '内容编辑', '内容审核员', '审计员'].map((role) => `<option ${state.adminRole === role ? 'selected' : ''}>${role}</option>`).join('');
}

function adminRolePermissions() {
  const map = {
    '超级管理员': { pages: ['dashboard', 'content', 'feedback', 'users', 'tasks', 'audit'], canCreate: true, canReview: true, canPublish: true, canManageUsers: true },
    '内容编辑': { pages: ['dashboard', 'content', 'tasks'], canCreate: true, canReview: false, canPublish: false, canManageUsers: false },
    '内容审核员': { pages: ['dashboard', 'content', 'feedback', 'tasks'], canCreate: false, canReview: true, canPublish: true, canManageUsers: false },
    '审计员': { pages: ['dashboard', 'audit'], canCreate: false, canReview: false, canPublish: false, canManageUsers: false },
  };
  return map[state.adminRole] || map['超级管理员'];
}

function adminCanView(page) {
  const perm = adminRolePermissions();
  if (perm.pages.includes(page)) return true;
  if (page === 'content-form' || page === 'content-detail') return perm.pages.includes('content');
  if (page === 'feedback-detail') return perm.pages.includes('feedback');
  return false;
}

function adminLoginPage() {
  return `<div class="page-content client-page admin-login-page"><section class="admin-login-card"><span class="brand-symbol">S</span><span class="section-kicker">三叶动漫 · 运营管理平台</span><h2>登录管理平台</h2><p>原型演示：点击登录进入超级管理员工作台，可在右上角切换角色查看权限可见性。</p><label><span>账号</span><input value="admin" readonly /></label><label><span>密码</span><input type="password" value="••••••••" readonly /></label><button class="button admin-primary" data-action="admin-login">登录</button></section></div>`;
}

function adminFeedbackItems() {
  return [
    { id: 'feedback-01', title: 'AI 回答包含了未观看集数的内容', user: '用户 10382', type: '剧透反馈', priority: '高', time: '10 分钟前', color: 'orange', desc: '在《星海回声》第 03 集的讨论中，AI 提到了第 08 集才出现的剧情，建议核查剧透模式是否生效。' },
    { id: 'feedback-02', title: '《星海回声》角色资料有一处错误', user: '用户 10211', type: '内容纠错', priority: '中', time: '1 小时前', color: 'blue', desc: '角色“渡边遥”的职位描述与正篇第 05 集不一致，请核对后修正。' },
    { id: 'feedback-03', title: '希望增加按情绪找番', user: '用户 09931', type: '功能建议', priority: '低', time: '昨天', color: 'purple', desc: '希望可以按“治愈”“热血”“平静”等情绪关键词找番。' },
  ];
}

function pushAudit(action, target) {
  state.auditLogs.push({ time: '刚刚', operator: '林默', role: state.adminRole, action, target });
  if (state.auditLogs.length > 30) state.auditLogs.shift();
}

function adminSidebar() {
  const perm = adminRolePermissions();
  const items = [
    ['dashboard', '仪表盘', 'dashboard'],
    ['content', '内容管理', 'content'],
    ['feedback', '用户反馈', 'feedback'],
    ['users', '用户管理', 'users'],
    ['tasks', '任务管理', 'tasks'],
    ['audit', '权限与审计', 'audit'],
  ].filter((item) => perm.pages.includes(item[2]));
  return `<aside class="app-sidebar admin-sidebar"><div class="admin-side-brand"><span class="brand-symbol">S</span><span><strong>sanye_anime</strong><small>运营管理平台</small></span></div><div class="admin-caption">工作台</div><nav class="sidebar-nav">${items.map(([key, label, page]) => `<button class="sidebar-link ${state.page === page ? 'is-active' : ''}" data-page="${page}"><span class="nav-icon">${icon(key)}</span><span>${label}</span>${page === 'feedback' ? '<span class="nav-count alert-count">3</span>' : ''}</button>`).join('')}</nav><div class="sidebar-divider"></div><div class="admin-caption">系统</div><div class="admin-side-foot"><span class="admin-avatar">林</span><span><strong>林默</strong><small>${state.adminRole}</small></span><button title="更多操作">···</button></div></aside>`;
}

function adminHeader() {
  const titles = { dashboard: '仪表盘', content: '内容管理', 'content-form': '内容表单', 'content-detail': '内容详情', feedback: '用户反馈', 'feedback-detail': '反馈详情', users: '用户管理', tasks: '任务管理', audit: '权限与审计' };
  return `<header class="admin-header"><div><span class="admin-kicker">三叶动漫 / ADMIN</span><h1>${titles[state.page] || '管理平台'}</h1></div><div class="admin-header-actions"><span class="admin-sync"><i></i>数据同步正常</span><label class="admin-role-select">角色 <select data-action="admin-role" aria-label="切换演示角色">${adminRoleOptions()}</select></label><button class="icon-only admin-icon" title="通知">◌<span class="notification-dot"></span></button><button class="button admin-ghost" data-action="admin-logout">退出登录</button></div></header>`;
}

function adminDashboard() {
  return `<div class="admin-content"><div class="admin-welcome"><div><span class="admin-kicker">9 月 18 日 周四 · 09:42</span><h2>早上好，林默。</h2><p>这里是今天的运营概览，当前有 6 项工作需要关注。</p></div><button class="button admin-primary" data-page="content">处理待审核内容 ${icon('arrow')}</button></div><div class="metric-grid"><article><span class="metric-icon metric-purple">◫</span><span class="metric-label">已发布作品</span><strong>1,286</strong><small><b>+18</b> 较上周</small></article><article><span class="metric-icon metric-blue">✦</span><span class="metric-label">AI 对话次数</span><strong>24,891</strong><small><b>+12.6%</b> 较上周</small></article><article><span class="metric-icon metric-orange">◔</span><span class="metric-label">待处理反馈</span><strong>24</strong><small><b class="warning-text">6 条高优先级</b></small></article><article><span class="metric-icon metric-green">↻</span><span class="metric-label">今日任务成功率</span><strong>98.7%</strong><small><b>+0.4%</b> 较昨日</small></article></div><div class="admin-dashboard-grid"><section class="admin-card usage-card"><div class="admin-card-heading"><div><span class="admin-kicker">AI 使用情况</span><h3>AI 使用趋势</h3></div><button class="admin-select">最近 7 天 ⌄</button></div><div class="chart-area"><div class="chart-y"><span>4k</span><span>3k</span><span>2k</span><span>1k</span><span>0</span></div><div class="chart"><div class="chart-grid-lines"></div><svg viewBox="0 0 600 220" preserveAspectRatio="none" aria-label="AI 使用趋势图"><path d="M0 182 C46 160 64 175 94 146 S145 120 169 148 S212 119 246 132 S287 70 325 98 S374 118 409 83 S448 90 473 60 S533 77 600 28" fill="none" stroke="#7562d9" stroke-width="4" stroke-linecap="round"/><path d="M0 182 C46 160 64 175 94 146 S145 120 169 148 S212 119 246 132 S287 70 325 98 S374 118 409 83 S448 90 473 60 S533 77 600 28 L600 220 L0 220 Z" fill="url(#chartFill)" opacity=".15"/><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7562d9"/><stop offset="1" stop-color="#7562d9" stop-opacity="0"/></linearGradient></defs></svg><div class="chart-labels"><span>周四</span><span>周五</span><span>周六</span><span>周日</span><span>周一</span><span>周二</span><span>今天</span></div></div></div></section><section class="admin-card todo-card"><div class="admin-card-heading"><div><span class="admin-kicker">需要关注</span><h3>待办事项</h3></div><button class="text-link admin-text-link">全部查看 ${icon('arrow')}</button></div><div class="todo-list"><button data-page="content"><span class="todo-dot todo-purple"></span><span><strong>内容审核</strong><small>3 部作品等待审核</small></span><em>高</em></button><button data-page="feedback"><span class="todo-dot todo-orange"></span><span><strong>用户反馈</strong><small>6 条反馈需要优先处理</small></span><em>高</em></button><button data-page="tasks"><span class="todo-dot todo-blue"></span><span><strong>索引任务</strong><small>昨晚有 1 次重试</small></span><em>中</em></button></div></section></div><section class="admin-card recent-card"><div class="admin-card-heading"><div><span class="admin-kicker">最近动态</span><h3>最近动态</h3></div><button class="text-link admin-text-link">查看审计记录 ${icon('arrow')}</button></div><div class="activity-list"><div><span class="activity-avatar avatar-purple">陈</span><span><strong>陈编辑</strong> 发布了 <b>《午夜图书馆》</b><small>10 分钟前 · 内容管理</small></span></div><div><span class="activity-avatar avatar-blue">AI</span><span><strong>AI 运营</strong> 更新了 <b>剧透安全规则 v1.4</b><small>1 小时前 · AI 运营</small></span></div><div><span class="activity-avatar avatar-orange">林</span><span><strong>你</strong> 处理了 <b>反馈 #FB-0281</b><small>2 小时前 · 用户反馈</small></span></div></div></section></div>`;
}

function adminContent() {
  const perm = adminRolePermissions();
  const statusOf = (id) => state.contentStatus[id] || '草稿';
  const query = (state.contentQuery || '').trim().toLowerCase();
  const rows = animeCatalog.filter((anime) => {
    const matchesQuery = !query || `${anime.title}${anime.originalTitle}`.toLowerCase().includes(query);
    const matchesTab = state.contentTab === '全部' || statusOf(anime.id) === state.contentTab;
    return matchesQuery && matchesTab;
  });
  const counts = (tab) => tab === '全部' ? animeCatalog.length : animeCatalog.filter((anime) => statusOf(anime.id) === tab).length;
  const rowActions = (anime) => {
    const status = statusOf(anime.id);
    const acts = [`<button title="查看详情" data-action="open-content-detail" data-cid="${anime.id}">${icon('detail')}</button>`];
    if (status === '待审核' && perm.canReview) acts.push(`<button class="table-publish" title="审核通过" data-action="approve-content" data-cid="${anime.id}">${icon('check')}</button><button class="table-publish" title="驳回" data-action="reject-content" data-cid="${anime.id}">×</button>`);
    if (status === '已发布' && perm.canPublish) acts.push(`<button title="下架" data-action="unpublish-content" data-cid="${anime.id}">×</button>`);
    if (status === '已下架' && perm.canPublish) acts.push(`<button class="table-publish" title="重新发布" data-action="publish-content" data-content="${anime.id}">${icon('check')}</button>`);
    if (status === '草稿' && perm.canCreate) acts.push(`<button title="编辑" data-action="edit-content" data-cid="${anime.id}">✎</button>`);
    return acts.join('');
  };
  return `<div class="admin-content"><div class="admin-page-heading"><div><span class="admin-kicker">内容工作台</span><h2>内容管理</h2><p>覆盖创建、审核、发布与下架，统一维护作品、来源和公开展示状态。</p></div>${perm.canCreate ? '<button class="button admin-primary" data-action="new-content">＋ 新建内容</button>' : ''}</div><div class="admin-toolbar"><div class="admin-search">⌕<input id="admin-content-search" value="${escapeHtml(state.contentQuery || '')}" placeholder="搜索作品名称或编号" /></div><div class="admin-filter-tabs">${['全部', '待审核', '草稿', '已下架'].map((tab) => `<button class="${state.contentTab === tab ? 'is-active' : ''}" data-action="content-tab" data-tab="${tab}">${tab} <b>${counts(tab)}</b></button>`).join('')}</div></div>${rows.length ? `<div class="admin-table-card"><table><thead><tr><th>作品</th><th>类型</th><th>来源</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead><tbody>${rows.map((anime) => `<tr><td><span class="table-work"><span class="table-cover cover-${anime.color}"></span><span><strong>${anime.title}</strong><small>${anime.originalTitle}</small></span></span></td><td>${anime.type}</td><td><span class="source-state"><i></i>${anime.source ? '已核验' : '待补充'}</span></td><td><span class="status-badge status-${statusOf(anime.id) === '已发布' ? 'published' : statusOf(anime.id) === '待审核' ? 'review' : 'draft'}">${statusOf(anime.id)}</span></td><td>${anime.updated || '2025/09/18'}</td><td><div class="table-actions">${rowActions(anime)}</div></td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-state"><span class="empty-mark">◫</span><h3>没有符合条件的作品</h3><p>调整搜索词或切换状态标签后再试。</p></div>`}</div>`;
}

function adminFeedback() {
  const items = adminFeedbackItems();
  const statusOf = (id) => state.feedbackStatus[id] || '待处理';
  const rows = state.feedbackTab === '全部' ? items : items.filter((item) => statusOf(item.id) === state.feedbackTab);
  const counts = (tab) => tab === '全部' ? items.length : items.filter((item) => statusOf(item.id) === tab).length;
  return `<div class="admin-content"><div class="admin-page-heading"><div><span class="admin-kicker">反馈与质量</span><h2>用户反馈</h2><p>处理用户问题，记录 AI 质量和内容修正结果。</p></div><button class="button admin-ghost" data-action="export-feedback">导出记录</button></div><div class="feedback-stats"><div><strong>${counts('全部')}</strong><span>全部反馈</span></div><div><strong>${items.filter((item) => item.priority === '高').length}</strong><span>高优先级</span></div><div><strong>11</strong><span>本周新增</span></div><div><strong>87%</strong><span>平均处理率</span></div></div><div class="admin-filter-tabs feedback-tabs">${['全部', '待处理', '处理中', '已关闭'].map((tab) => `<button class="${state.feedbackTab === tab ? 'is-active' : ''}" data-action="feedback-tab" data-tab="${tab}">${tab} <b>${counts(tab)}</b></button>`).join('')}</div>${rows.length ? `<div class="feedback-list">${rows.map((item) => `<article class="feedback-row"><span class="feedback-mark mark-${item.color}">${item.type === '剧透反馈' ? '!' : item.type === '内容纠错' ? '⌁' : '＋'}</span><div class="feedback-main"><div class="feedback-title"><h3>${item.title}</h3><span class="priority priority-${item.priority === '高' ? 'high' : item.priority === '中' ? 'medium' : 'low'}">${item.priority}优先级</span></div><p>${item.user} · ${item.type} · ${item.time}</p><div class="feedback-actions"><button class="feedback-status status-control ${statusOf(item.id) === '处理中' ? 'is-progress' : statusOf(item.id) === '已关闭' ? 'is-closed' : ''}" data-action="advance-feedback" data-feedback="${item.id}">${statusOf(item.id)} <span>⌄</span></button><button class="text-link" data-action="open-feedback-detail" data-fid="${item.id}">查看详情 ${icon('arrow')}</button></div></div><button class="icon-only feedback-more" title="更多操作">···</button></article>`).join('')}</div>` : `<div class="empty-state"><span class="empty-mark">◔</span><h3>这个状态下没有反馈</h3><p>切换状态标签或稍后再来。</p></div>`}</div>`;
}

function adminTasks() {
  const badge = (status) => status === '运行正常' ? '<span class="status-badge status-published">运行正常</span>' : status === '重试中' ? '<span class="status-badge status-review">重试中</span>' : status === '运行中' ? '<span class="status-badge status-review task-run">运行中</span>' : '<span class="status-badge status-draft">失败</span>';
  return `<div class="admin-content"><div class="admin-page-heading"><div><span class="admin-kicker">自动任务</span><h2>任务管理</h2><p>查看内容同步、索引重建和缓存刷新任务，支持立即执行与重试。</p></div></div><div class="task-summary"><div><span class="task-summary-icon">✓</span><span><strong>${state.adminTasks.filter((t) => t.status === '运行正常').length}</strong><small>运行正常</small></span></div><div><span class="task-summary-icon task-warn">↻</span><span><strong>${state.adminTasks.filter((t) => t.status === '重试中' || t.status === '运行中').length}</strong><small>重试/运行中</small></span></div><div><span class="task-summary-icon task-fail">×</span><span><strong>${state.adminTasks.filter((t) => t.status === '失败').length}</strong><small>失败</small></span></div></div><div class="admin-table-card task-table"><table><thead><tr><th>任务名称</th><th>任务类型</th><th>最近执行</th><th>耗时</th><th>状态</th><th>操作</th></tr></thead><tbody>${state.adminTasks.map((t) => `<tr><td><strong>${t.name}</strong><small>${t.key}</small></td><td>${t.type}</td><td>${t.time}</td><td>${t.duration}</td><td>${badge(t.status)}</td><td><div class="table-actions">${t.status === '运行中' ? '<button disabled>执行中…</button>' : t.status === '重试中' || t.status === '失败' ? `<button class="table-link" data-action="retry-task" data-tid="${t.id}">重试任务</button>` : `<button class="table-link" data-action="run-task" data-tid="${t.id}">立即执行</button>`}</div></td></tr>`).join('')}</tbody></table></div></div>`;
}

function adminContentForm() {
  const editing = state.editingAnime ? getAnime(state.editingAnime) : null;
  const draft = state.contentDraft || {};
  const value = (key, fallback) => draft[key] != null ? draft[key] : (editing && editing[key] != null ? editing[key] : fallback);
  return `<div class="admin-content"><div class="admin-page-heading"><div><span class="admin-kicker">内容工作台</span><h2>${editing ? '编辑内容' : '新建内容'}</h2><p>标题必填；保存后进入草稿，提交审核后由审核角色发布。</p></div></div><div class="admin-form-card"><label><span>标题 <b>*</b></span><input data-form="title" value="${escapeHtml(value('title', ''))}" placeholder="作品标题" /></label><label><span>别名</span><input data-form="originalTitle" value="${escapeHtml(value('originalTitle', ''))}" placeholder="作品别名" /></label><div class="admin-form-row"><label><span>类型</span><select data-form="type">${['原创动画', '电视动画', '剧场版', '网络动画'].map((t) => `<option ${value('type', '原创动画') === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label><span>年份</span><select data-form="year">${['2024', '2025', '2026'].map((y) => `<option ${String(value('meta', '2025')).startsWith(y) ? 'selected' : ''}>${y}</option>`).join('')}</select></label></div><label><span>简介</span><textarea data-form="summary" rows="4" placeholder="作品简介">${escapeHtml(value('summary', ''))}</textarea></label><label><span>来源与授权</span><input data-form="source" value="${escapeHtml(value('source', ''))}" placeholder="数据来源或授权说明" /></label><div class="admin-form-row"><label><span>图片来源</span><select data-form="imageState">${['已核验', '待补充'].map((s) => `<option ${value('imageState', '已核验') === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label></div><div class="admin-form-actions"><button class="button admin-ghost" data-action="cancel-content-form">取消</button><button class="button admin-primary" data-action="save-content-form">${state.savingContent ? '保存中…' : '保存草稿'}</button></div></div></div>`;
}

function adminContentDetail() {
  const anime = getAnime(state.contentDetailId);
  const status = state.contentStatus[anime.id] || '草稿';
  const perm = adminRolePermissions();
  const logs = state.auditLogs.filter((log) => log.target.includes(anime.title));
  const actions = [];
  if (status === '待审核' && perm.canReview) actions.push(`<button class="button admin-primary" data-action="approve-content" data-cid="${anime.id}">审核通过</button><button class="button admin-ghost" data-action="reject-content" data-cid="${anime.id}">驳回</button>`);
  if (status === '已发布' && perm.canPublish) actions.push(`<button class="button admin-ghost" data-action="unpublish-content" data-cid="${anime.id}">下架</button>`);
  if (status === '草稿' && perm.canCreate) actions.push(`<button class="button admin-primary" data-action="submit-review-content" data-cid="${anime.id}">提交审核</button>`);
  return `<div class="admin-content"><div class="admin-page-heading"><div><span class="admin-kicker">内容工作台</span><h2>${anime.title}</h2><p>作品详情、来源与审核记录。</p></div><button class="button admin-ghost" data-action="back-to-content">← 返回内容管理</button></div><div class="admin-detail-card"><div class="admin-detail-grid"><span>类型<strong>${anime.type}</strong></span><span>状态<strong>${status}</strong></span><span>更新<strong>${anime.updated || '2025/09/18'}</strong></span><span>来源<strong>${anime.source || '待补充'}</strong></span><span>图片来源<strong>${anime.imageState || '已核验'}</strong></span><span>评分<strong>★ ${anime.score}</strong></span></div><p class="admin-detail-desc">${anime.summary}</p><div class="admin-actions-bar">${actions.join('')}</div></div><div class="admin-detail-card"><div class="admin-card-heading"><div><span class="admin-kicker">变更记录</span><h3>审核与操作历史</h3></div></div><div class="admin-history-list">${logs.length ? logs.map((log) => `<div><time>${log.time}</time><span>${log.operator}（${log.role}）${log.action} ${log.target}</span></div>`).join('') : '<div><time>暂无记录</time><span>该内容还没有审核记录。</span></div>'}</div></div></div>`;
}

function adminFeedbackDetail() {
  const id = state.feedbackDetailId;
  const item = adminFeedbackItems().find((i) => i.id === id) || adminFeedbackItems()[0];
  const status = state.feedbackStatus[item.id] || '待处理';
  const history = state.feedbackHistory[item.id] || [];
  return `<div class="admin-content"><div class="admin-page-heading"><div><span class="admin-kicker">反馈与质量</span><h2>${item.title}</h2><p>${item.user} · ${item.type} · ${item.time}</p></div><button class="button admin-ghost" data-action="back-to-feedback">← 返回反馈列表</button></div><div class="admin-detail-card"><span class="priority priority-${item.priority === '高' ? 'high' : item.priority === '中' ? 'medium' : 'low'}">${item.priority}优先级</span><p class="admin-detail-desc">${item.desc}</p><div class="admin-actions-bar"><button class="feedback-status status-control ${status === '处理中' ? 'is-progress' : status === '已关闭' ? 'is-closed' : ''}" data-action="advance-feedback" data-feedback="${item.id}">${status} <span>⌄</span></button><button class="button admin-ghost" data-action="mark-feedback-high">标记高优先级</button></div></div><div class="admin-detail-card"><div class="admin-card-heading"><div><span class="admin-kicker">处理记录</span><h3>处理历史</h3></div></div><div class="admin-history-list">${history.length ? history.map((h) => `<div><time>记录</time><span>${h}</span></div>`).join('') : '<div><time>暂无记录</time><span>还没有处理记录。</span></div>'}</div></div></div>`;
}

function adminUsers() {
  const perm = adminRolePermissions();
  return `<div class="admin-content"><div class="admin-page-heading"><div><span class="admin-kicker">账户与权限</span><h2>用户管理</h2><p>按角色查看用户状态，启停操作受当前角色权限控制。</p></div></div><div class="admin-table-card"><table><thead><tr><th>用户</th><th>角色</th><th>状态</th><th>最近登录</th><th>操作</th></tr></thead><tbody>${state.adminUsers.map((u) => `<tr><td><span class="table-user"><span class="user-avatar">${u.name.slice(0, 1)}</span><strong>${u.name}</strong></span></td><td><span class="role-tag ${u.role === '超级管理员' ? 'is-super' : u.role === '内容编辑' ? 'is-edit' : u.role === '内容审核员' ? 'is-review' : 'is-audit'}">${u.role}</span></td><td><span class="status-badge ${u.status === '启用' ? 'status-published' : 'status-draft'}">${u.status}</span></td><td>${u.lastLogin}</td><td><div class="table-actions">${perm.canManageUsers ? `<button title="${u.status === '启用' ? '停用' : '启用'}" data-action="toggle-user-status" data-uid="${u.id}">${u.status === '启用' ? '停用' : '启用'}</button>` : '<button disabled>无权限</button>'}</div></td></tr>`).join('')}</tbody></table></div>${perm.canManageUsers ? '' : '<div class="admin-note">当前角色为只读角色，用户启停操作不可用。</div>'}</div>`;
}

function adminAudit() {
  const roleDesc = {
    '超级管理员': '全部模块与高风险操作。',
    '内容编辑': '仪表盘、内容管理（新建/编辑/提交审核）、任务查看。',
    '内容审核员': '仪表盘、内容管理（审核/发布/下架）、用户反馈处理、任务查看。',
    '审计员': '仪表盘、权限与审计（只读）。',
  };
  return `<div class="admin-content"><div class="admin-page-heading"><div><span class="admin-kicker">账户与权限</span><h2>权限与审计</h2><p>切换右上角角色，查看菜单与操作按钮的可见性变化。</p></div></div><div class="admin-detail-card"><div class="admin-card-heading"><div><span class="admin-kicker">当前角色</span><h3>${state.adminRole}</h3></div></div><p class="admin-detail-desc">${roleDesc[state.adminRole] || ''}</p><div class="admin-note">权限可见性为原型演示：菜单项、新建/审核/发布/用户启停按钮随角色隐藏或禁用；正式实现由后端角色权限控制。</div></div><div class="admin-detail-card"><div class="admin-card-heading"><div><span class="admin-kicker">审计记录</span><h3>操作历史</h3></div></div><div class="admin-history-list">${state.auditLogs.slice().reverse().map((log) => `<div><time>${log.time}</time><span>${log.operator}（${log.role}）${log.action} ${log.target}</span></div>`).join('')}</div></div></div>`;
}

function render() {
  document.documentElement.dataset.theme = state.theme;
  let body;
  if (state.product === 'client') {
    const page = state.page === 'home' ? homePage() : state.page === 'repository' ? repositoryPage() : state.page === 'search' ? searchPage() : state.page === 'schedule' ? schedulePage() : state.page === 'ai' ? aiPage() : state.page === 'mine' ? minePage() : state.page === 'settings' ? settingsPage() : detailPage();
    body = `${topbar()}<div class="product-layout client-layout">${clientSidebar()}${page}</div>`;
  } else if (state.product === 'official') {
    body = `${topbar()}${state.page === 'official-about' ? officialAbout() : state.page === 'official-download' ? officialDownload() : state.page === 'official-legal' ? officialLegal() : officialHome()}`;
  } else {
    if (!state.adminLogin) {
      body = `${topbar()}${adminLoginPage()}`;
    } else {
      const perm = adminRolePermissions();
      if (!adminCanView(state.page)) state.page = 'dashboard';
      const page = state.page === 'content' ? adminContent() : state.page === 'content-form' ? adminContentForm() : state.page === 'content-detail' ? adminContentDetail() : state.page === 'feedback' ? adminFeedback() : state.page === 'feedback-detail' ? adminFeedbackDetail() : state.page === 'users' ? adminUsers() : state.page === 'tasks' ? adminTasks() : state.page === 'audit' ? adminAudit() : adminDashboard();
      body = `${topbar()}<div class="product-layout admin-layout">${adminSidebar()}<div class="admin-page-shell">${adminHeader()}${page}</div></div>`;
    }
  }
  app.innerHTML = body;
}

function openClientPage(page) {
  state.product = 'client';
  state.page = page;
  render();
}

function openAnime(id) {
  if (state.page !== 'detail') state.previousPage = state.page;
  state.product = 'client';
  state.selectedAnime = id;
  state.page = 'detail';
  render();
}

function beginAnswer(question) {
  if (state.pendingAnswer) return;
  state.pendingAnswer = true;
  const token = (state.answerToken = (state.answerToken || 0) + 1);
  render();
  window.setTimeout(() => {
    if (token !== state.answerToken) return;
    state.pendingAnswer = false;
    if (state.simulateFailure) {
      state.messages.push({ role: 'assistant', text: '回答失败，请稍后重试。', failed: true });
      render();
      return;
    }
    if (state.quotaRemaining <= 0) {
      state.messages.push({ role: 'assistant', text: '今日 AI 额度已用完，明天再来，或登录后获取更多额度。' });
      render();
      return;
    }
    state.quotaRemaining -= 1;
    const recommendation = state.recommendWorks && (question.includes('推荐') || question.includes('相似')) ? aiRecommendation() : null;
    state.messages.push({
      role: 'assistant',
      text: aiDemoReply(),
      recommendation,
    });
    render();
  }, 700);
}

function sendAi(text) {
  const question = text.trim();
  if (!question || state.pendingAnswer) return;
  if (state.quotaRemaining <= 0) {
    state.messages.push({ role: 'assistant', text: '今日 AI 额度已用完，明天再来，或登录后获取更多额度。' });
    render();
    return;
  }
  state.sentMessage = question;
  state.lastQuestion = question;
  state.messages.push({ role: 'user', text: question });
  beginAnswer(question);
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-product], [data-page], [data-anime], [data-action]');
  if (!target) return;
  const product = target.dataset.product;
  const page = target.dataset.page;
  const anime = target.dataset.anime;
  const action = target.dataset.action;

  if (product) {
    state.product = product;
    state.page = product === 'client' ? 'home' : product === 'official' ? 'official-home' : 'dashboard';
    render();
    return;
  }
  if (anime) {
    openAnime(anime);
    return;
  }
  if (page) {
    if (page.startsWith('official-')) {
      state.product = 'official';
      state.page = page;
      render();
    } else if (state.product === 'admin' && ['dashboard', 'content', 'content-form', 'content-detail', 'feedback', 'feedback-detail', 'users', 'tasks', 'audit'].includes(page)) {
      state.page = page;
      render();
    } else {
      openClientPage(page);
    }
    return;
  }
  if (action === 'reset-client') {
    openClientPage('home');
    return;
  }
  if (action === 'toggle-theme') {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    storeTheme(state.theme);
    render();
    return;
  }
  if (action === 'previous-slide' || action === 'next-slide') {
    state.heroSlide = (state.heroSlide + (action === 'next-slide' ? 1 : 2)) % 3;
    render();
    return;
  }
  if (action === 'select-slide') {
    state.heroSlide = Number(target.dataset.slide) || 0;
    render();
    return;
  }
  if (action === 'clear-filters') {
    state.searchQuery = '';
    state.repositoryType = '全部类型';
    state.repositoryStatus = '全部状态';
    state.repositoryYear = '全部年份';
    render();
    return;
  }
  if (action === 'show-download-message') {
    showToast('桌面安装包尚未发布，当前可直接体验静态客户端原型。');
    return;
  }
  if (action === 'reset-official') {
    state.product = 'official';
    state.page = 'official-home';
    render();
    return;
  }
  if (action === 'enter-client') {
    openClientPage('home');
    return;
  }
  if (action === 'enter-client-ai') {
    openClientPage('ai');
    return;
  }
  if (action === 'enter-repository') {
    openClientPage('repository');
    return;
  }
  if (action === 'ask-ai') {
    state.contextAnime = state.selectedAnime;
    openClientPage('ai');
    return;
  }
  if (action === 'ask-ai-safe') {
    state.spoilerMode = false;
    state.contextAnime = state.selectedAnime;
    openClientPage('ai');
    return;
  }
  if (action === 'clear-context') {
    state.contextAnime = null;
    render();
    return;
  }
  if (action === 'toggle-cite') {
    state.citeWorks = !state.citeWorks;
    render();
    return;
  }
  if (action === 'toggle-recommend') {
    state.recommendWorks = !state.recommendWorks;
    render();
    return;
  }
  if (action === 'stop-answer') {
    if (!state.pendingAnswer) return;
    state.answerToken = (state.answerToken || 0) + 1;
    state.pendingAnswer = false;
    state.messages.push({ role: 'assistant', text: '回答已停止生成。你可以继续提问，或点击重新生成。', stopped: true });
    render();
    return;
  }
  if (action === 'toggle-failure') {
    state.simulateFailure = !state.simulateFailure;
    render();
    return;
  }
  if (action === 'regenerate') {
    if (!state.lastQuestion || state.pendingAnswer) return;
    const last = state.messages[state.messages.length - 1];
    if (last && (last.failed || last.stopped)) state.messages.pop();
    beginAnswer(state.lastQuestion);
    return;
  }
  if (action === 'clear-history') {
    state.historyItems = [];
    render();
    return;
  }
  if (action === 'legal-tab') {
    state.legalTab = target.dataset.tab || 'privacy';
    render();
    return;
  }
  if (action === 'search-filter') {
    state.searchChip = target.dataset.value || '全部';
    render();
    return;
  }
  if (action === 'logout') {
    showToast('已退出登录（原型演示，正式登录流程将在业务开发中提供）。');
    return;
  }
  if (action === 'toggle-favorite') {
    const id = state.selectedAnime;
    if (state.favorites.has(id)) state.favorites.delete(id);
    else state.favorites.add(id);
    render();
    return;
  }
  if (action === 'toggle-spoiler') {
    state.spoilerMode = !state.spoilerMode;
    render();
    return;
  }
  if (action === 'fill-ai') {
    const input = document.querySelector('#ai-input');
    if (input) {
      input.value = target.dataset.prompt;
      input.focus();
    }
    return;
  }
  if (action === 'new-chat') {
    state.messages = [{ role: 'assistant', text: '新会话已准备好。你可以告诉我一部作品、一个角色，或者你现在想看的感觉。' }];
    state.activeConversation = 'new';
    render();
    return;
  }
  if (action === 'load-chat') {
    const chatId = target.dataset.chat;
    if (chatId === 'afterglow-chat') {
      state.messages = [{ role: 'assistant', text: '如果你喜欢夏天、海边和没有强烈冲突的故事，可以先从这几部开始。' }, { role: 'user', text: '我想要一部看完心情会变好的动画。' }, { role: 'assistant', text: '那我会先推荐《夏末余晖》。它不急着制造戏剧冲突，而是让人物在一整个夏天里慢慢学会告别。' }];
    } else if (chatId === 'paper-moon-chat') {
      state.messages = [{ role: 'user', text: '推荐一部悬疑剧场版。' }, { role: 'assistant', text: '《纸月计划》是近未来悬疑剧场版，围绕共享梦境展开，节奏紧凑，适合一口气看完。' }];
    } else {
      state.messages = [{ role: 'assistant', text: '你好，我可以帮你找番、梳理剧情，或者解释角色关系。你想从哪部作品开始？' }];
    }
    state.activeConversation = chatId || 'skyline-chat';
    render();
    return;
  }
  if (action === 'admin-login') {
    state.adminLogin = true;
    state.page = 'dashboard';
    render();
    return;
  }
  if (action === 'admin-logout') {
    state.adminLogin = false;
    state.page = 'dashboard';
    showToast('已退出登录（原型演示）。');
    render();
    return;
  }
  if (action === 'new-content') {
    state.editingAnime = '';
    state.contentDraft = {};
    state.page = 'content-form';
    render();
    return;
  }
  if (action === 'edit-content') {
    state.editingAnime = target.dataset.cid;
    state.contentDraft = {};
    state.page = 'content-form';
    render();
    return;
  }
  if (action === 'cancel-content-form') {
    state.page = 'content';
    render();
    return;
  }
  if (action === 'save-content-form') {
    const read = (key) => { const el = document.querySelector(`[data-form="${key}"]`); return el ? el.value.trim() : ''; };
    const title = read('title');
    if (!title) { showToast('标题不能为空，请补充后再保存。'); return; }
    if (state.savingContent) return;
    state.savingContent = true;
    render();
    window.setTimeout(() => {
      state.savingContent = false;
      if (state.editingAnime) {
        const anime = getAnime(state.editingAnime);
        anime.title = title;
        anime.originalTitle = read('originalTitle') || anime.originalTitle;
        anime.type = read('type');
        anime.summary = read('summary') || anime.summary;
        anime.source = read('source');
        anime.imageState = read('imageState');
        pushAudit('编辑内容', `《${title}》`);
      } else {
        const year = read('year') || '2025';
        const id = 'draft-' + Date.now().toString(36);
        animeCatalog.push({
          id, title, originalTitle: read('originalTitle'), type: read('type'), meta: `${year} · 12 集 · 原创动画`,
          summary: read('summary') || '内容待完善。', color: ['coral', 'blue', 'lime'][animeCatalog.length % 3],
          score: '8.0', schedule: '连载中', tags: ['原创'], updated: `${year} 年`,
          source: read('source'), imageState: read('imageState'),
        });
        state.contentStatus[id] = '草稿';
        pushAudit('创建内容', `《${title}》`);
      }
      state.contentTab = '草稿';
      state.page = 'content';
      render();
      showToast('已保存为草稿。');
    }, 800);
    return;
  }
  if (action === 'submit-review-content') {
    state.contentStatus[target.dataset.cid] = '待审核';
    pushAudit('提交审核', getAnime(target.dataset.cid).title);
    render();
    showToast('已提交审核。');
    return;
  }
  if (action === 'open-content-detail') {
    state.contentDetailId = target.dataset.cid;
    state.page = 'content-detail';
    render();
    return;
  }
  if (action === 'back-to-content') {
    state.page = 'content';
    render();
    return;
  }
  if (action === 'content-tab') {
    state.contentTab = target.dataset.tab || '全部';
    render();
    return;
  }
  if (action === 'approve-content') {
    state.contentStatus[target.dataset.cid] = '已发布';
    pushAudit('审核通过', getAnime(target.dataset.cid).title);
    render();
    showToast('审核通过，内容已发布。');
    return;
  }
  if (action === 'reject-content') {
    state.contentStatus[target.dataset.cid] = '草稿';
    pushAudit('驳回内容', getAnime(target.dataset.cid).title);
    render();
    showToast('已驳回，内容回到草稿。');
    return;
  }
  if (action === 'unpublish-content') {
    state.contentStatus[target.dataset.cid] = '已下架';
    pushAudit('下架内容', getAnime(target.dataset.cid).title);
    render();
    showToast('内容已下架。');
    return;
  }
  if (action === 'publish-content') {
    state.contentStatus[target.dataset.content] = '已发布';
    pushAudit('发布内容', getAnime(target.dataset.content).title);
    render();
    showToast('内容已发布，客户端与官网可见。');
    return;
  }
  if (action === 'feedback-tab') {
    state.feedbackTab = target.dataset.tab || '全部';
    render();
    return;
  }
  if (action === 'open-feedback-detail') {
    state.feedbackDetailId = target.dataset.fid;
    state.page = 'feedback-detail';
    render();
    return;
  }
  if (action === 'back-to-feedback') {
    state.page = 'feedback';
    render();
    return;
  }
  if (action === 'mark-feedback-high') {
    showToast('已标记为高优先级（原型演示）。');
    return;
  }
  if (action === 'export-feedback') {
    showToast('导出功能将在正式实现中提供。');
    return;
  }
  if (action === 'toggle-user-status') {
    const user = state.adminUsers.find((u) => u.id === target.dataset.uid);
    if (user) {
      user.status = user.status === '启用' ? '停用' : '启用';
      pushAudit(user.status === '启用' ? '启用用户' : '停用用户', user.name);
      render();
      showToast(`用户「${user.name}」已${user.status}。`);
    }
    return;
  }
  if (action === 'run-task' || action === 'retry-task') {
    const task = state.adminTasks.find((t) => t.id === target.dataset.tid);
    if (task && task.status !== '运行中') {
      task.status = '运行中';
      task.time = '刚刚';
      render();
      window.setTimeout(() => {
        task.status = '运行正常';
        task.duration = '00:0' + (1 + Math.floor(Math.random() * 8));
        pushAudit(action === 'run-task' ? '立即执行任务' : '重试任务', task.name);
        render();
        showToast(`任务「${task.name}」执行成功。`);
      }, 900);
    }
    return;
  }
  if (action === 'advance-feedback') {
    const id = target.dataset.feedback;
    const current = state.feedbackStatus[id];
    const next = current === '待处理' ? '处理中' : current === '处理中' ? '已关闭' : '待处理';
    state.feedbackStatus[id] = next;
    if (state.feedbackHistory[id]) state.feedbackHistory[id].push(`刚刚 · 林默 将状态更新为「${next}」`);
    showToast(`反馈状态已更新为「${next}」。`);
    render();
    return;
  }
});

document.addEventListener('submit', (event) => {
  const homeSearch = event.target.closest('[data-action="search-home"]');
  if (homeSearch) {
    event.preventDefault();
    state.searchQuery = homeSearch.querySelector('#home-search-input').value.trim();
    openClientPage('search');
    return;
  }
  const form = event.target.closest('[data-action="send-ai"]');
  if (!form) return;
  event.preventDefault();
  const input = form.querySelector('#ai-input');
  sendAi(input.value);
  input.value = '';
});

document.addEventListener('input', (event) => {
  if (event.target.id === 'repository-search') {
    state.searchQuery = event.target.value;
    window.clearTimeout(window.__sanyeRepositoryTimer);
    window.__sanyeRepositoryTimer = window.setTimeout(() => render(), 240);
    return;
  }
  if (event.target.id === 'search-input') {
    state.searchQuery = event.target.value;
    const search = event.target.closest('.large-search');
    if (search) {
      window.clearTimeout(window.__sanyeSearchTimer);
      window.__sanyeSearchTimer = window.setTimeout(() => render(), 240);
    }
  }
  if (event.target.id === 'admin-content-search') {
    state.contentQuery = event.target.value;
    render();
    return;
  }
});

document.addEventListener('change', (event) => {
  const filter = event.target.dataset.filter;
  if (filter) {
    if (filter === 'type') state.repositoryType = event.target.value;
    if (filter === 'status') state.repositoryStatus = event.target.value;
    if (filter === 'year') state.repositoryYear = event.target.value;
    render();
    return;
  }
  if (event.target.dataset.action === 'admin-role') {
    state.adminRole = event.target.value;
    if (!adminCanView(state.page)) state.page = 'dashboard';
    showToast(`已切换演示角色：${state.adminRole}`);
    render();
  }
});



document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    const input = document.querySelector('#home-search-input, #repository-search, #search-input');
    if (input) input.focus();
  }
});
render();
