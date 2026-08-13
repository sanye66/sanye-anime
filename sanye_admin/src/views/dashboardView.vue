<script setup lang="ts">
const metrics = [
  { label: '已归档记录', value: '128', note: '糸守町资料库 · 本月新增 12 条' },
  { label: '待确认回声', value: '07', note: '来自两个时间线的未读留言' },
  { label: '神乐仪式', value: '03', note: '宫水神社 · 今日已完成' },
  { label: '彗星观测', value: '01', note: '蒂亚玛特 · 轨迹记录正常' },
]
</script>

<template>
  <div class="page-stack dashboard-page">
    <div class="page-heading scene-heading"><div><span class="header-kicker">2013.10.04 · 三叶的黄昏记录</span><h2>今天，三叶仍在星空下。</h2><p>记录宫水神社、糸守湖与三叶梦境中的变化。所有重要的回声，都应在日落前被听见。</p></div><el-button type="primary">新建三叶记录</el-button></div>
    <div class="scene-ribbon"><div class="scene-orbit"><span class="orbit-star"></span><span class="orbit-line"></span><span class="orbit-label">蒂亚玛特 / 2013</span></div><div><span class="ribbon-label">今日黄昏</span><strong>17:42:08</strong><small>观测窗口还剩 02:16:41</small></div><div class="ribbon-location"><Location /><span>糸守湖<br><small>北纬 35° 39′</small></span></div></div>
    <div class="metric-grid"><el-card v-for="metric in metrics" :key="metric.label" shadow="never"><span class="metric-label">{{ metric.label }}</span><strong>{{ metric.value }}</strong><small>{{ metric.note }}</small></el-card></div>
    <div class="dashboard-grid"><el-card shadow="never" class="timeline-card"><div class="card-heading"><div><span class="header-kicker">三叶时间线</span><h3>三叶的今日记录</h3></div><el-button text>查看全部</el-button></div><div class="timeline-list"><div class="timeline-item"><span class="timeline-time">16:08</span><span class="timeline-dot coral"></span><div><strong>三叶提交了新的口嚼酒记录</strong><small>宫水神社 · 仪式档案 / 待审核</small></div><span class="tag waiting">待确认</span></div><div class="timeline-item"><span class="timeline-time">15:24</span><span class="timeline-dot gold"></span><div><strong>三叶完成了彗星轨迹标记</strong><small>糸守町观测站 · 三叶手记</small></div><span class="tag done">已归档</span></div><div class="timeline-item"><span class="timeline-time">14:51</span><span class="timeline-dot blue"></span><div><strong>三叶记录了一段新的梦境回声</strong><small>宫水神社 · 三叶梦境 / 回声信箱</small></div><span class="tag new">新回声</span></div></div></el-card><el-card shadow="never" class="character-card"><span class="header-kicker">三叶档案</span><h3>宫水三叶 · 黄昏记录员</h3><div class="mitsuha-portrait"><div class="portrait-halo"></div><div class="large-character mitsuha-large">三</div></div><div class="character-signature"><strong>宫水三叶</strong><span>宫水神社 / 糸守町</span></div><p>“我好像做了一个很长的梦。”</p><small class="character-note">记录状态：三叶的结绳与梦境档案已同步</small></el-card></div>
  </div>
</template>
