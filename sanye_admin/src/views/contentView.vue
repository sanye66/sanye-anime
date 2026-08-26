<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi, type AdminAnime, type AnimeStatus, type AnimeDraftBody } from '@/api/admin'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const loading = ref(false)
const keyword = ref('')
const tab = ref<'全部' | AnimeStatus>('全部')
const rows = ref<AdminAnime[]>([])
const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const urlImportDialogVisible = ref(false)
const urlImportSaving = ref(false)
const urlImportSourceUrl = ref('')
const urlImportPublish = ref(false)
const importDialogVisible = ref(false)
const importSaving = ref(false)
const importAnime = ref<AdminAnime | null>(null)
const importSourceUrl = ref('')
const form = ref({
  title: '',
  originalTitle: '',
  type: '',
  year: undefined as number | undefined,
  summary: '',
  tagsText: '',
  updateText: '',
  sourceUrl: '',
  coverUrl: '',
})

const demoRows: AdminAnime[] = [
  { id: '127', title: '你的名字', originalTitle: '君の名は。', type: '剧场版', source: '已核验', status: '已发布', updated: '2026-08-24' },
  { id: '133', title: '无职转生 · 第一季', originalTitle: '无职转生：到了异世界就拿出真本事', type: '电视动画', source: '已核验', status: '已发布', updated: '2026-08-24' },
  { id: '136', title: '无职转生 · 第二季', originalTitle: '无职转生Ⅱ～到了异世界就拿出真本事～', type: '电视动画', source: '已核验', status: '已发布', updated: '2026-08-24' },
  { id: '135', title: '无职转生 · 第二季 Part.2', originalTitle: '无职转生Ⅱ到了异世界就拿出真本事Part2', type: '电视动画', source: '已核验', status: '已发布', updated: '2026-08-24' },
  { id: '128', title: '无职转生 · 第三季', originalTitle: '无职转生Ⅲ 到了异世界就拿出真本事 第三季', type: '电视动画', source: '已核验', status: '已发布', updated: '2026-08-24' },
  { id: '137', title: '无职转生 · OAD 特别篇', originalTitle: '无职转生：到了异世界就拿出真本事 OAD', type: '电视动画', source: '已核验', status: '已发布', updated: '2026-08-24' },
]

/** 加载作品管理列表，接口失败时使用演示数据维持页面可用。 */
async function load() {
  loading.value = true
  try {
    rows.value = await adminApi.anime()
  } catch {
    rows.value = demoRows
  } finally {
    loading.value = false
  }
}
void load()

const filtered = computed(() =>
  rows.value.filter((row) => {
    const matchTab = tab.value === '全部' || row.status === tab.value
    const query = keyword.value.trim().toLowerCase()
    const matchQuery = !query || `${row.title}${row.originalTitle}`.toLowerCase().includes(query)
    return matchTab && matchQuery
  }),
)

/** 调用管理代理更新作品状态，并同步表格行状态。 */
async function updateStatus(row: AdminAnime, status: AnimeStatus) {
  try {
    await adminApi.animeStatus(row.id, status)
    row.status = status
    ElMessage.success(`《${row.title}》状态已更新为「${status}」`)
  } catch {
    ElMessage.error(`《${row.title}》状态更新失败`)
  }
}

/** 重置表单并打开新建作品弹窗。 */
function openCreate() {
  editingId.value = null
  form.value = {
    title: '', originalTitle: '', type: '', year: undefined, summary: '', tagsText: '', updateText: '',
    sourceUrl: '', coverUrl: '',
  }
  dialogVisible.value = true
}

/** 打开 URL 一键导入弹窗，入口放在内容管理设置操作区。 */
function openUrlImport() {
  urlImportSourceUrl.value = ''
  urlImportPublish.value = false
  urlImportDialogVisible.value = true
}

/** 读取作品详情并填充编辑表单。 */
async function openEdit(row: AdminAnime) {
  try {
    const detail = await adminApi.animeDetail(row.id)
    editingId.value = detail.id
    form.value = {
      title: detail.title,
      originalTitle: detail.originalTitle,
      type: detail.type,
      year: detail.year,
      summary: detail.summary,
      tagsText: detail.tags.join('，'),
      updateText: detail.updateText,
      sourceUrl: detail.sourceUrl,
      coverUrl: detail.coverUrl,
    }
    dialogVisible.value = true
  } catch {
    ElMessage.error('作品详情加载失败')
  }
}

/** 校验并提交新建/编辑表单，成功后重新加载列表。 */
async function saveForm() {
  if (!form.value.title.trim() || !form.value.type.trim()) {
    ElMessage.warning('标题与类型不能为空')
    return
  }
  const body: AnimeDraftBody = {
    title: form.value.title.trim(),
    originalTitle: form.value.originalTitle.trim(),
    type: form.value.type.trim(),
    year: form.value.year,
    summary: form.value.summary.trim(),
    tags: form.value.tagsText.trim(),
    updateText: form.value.updateText.trim(),
    sourceUrl: form.value.sourceUrl.trim(),
    coverUrl: form.value.coverUrl.trim(),
  }
  saving.value = true
  try {
    if (editingId.value) {
      await adminApi.animeUpdate(editingId.value, body)
      ElMessage.success('作品已更新')
    } else {
      const created = await adminApi.animeCreate(body)
      ElMessage.success(`已创建草稿《${created.title}》`)
    }
    dialogVisible.value = false
    await load()
  } catch {
    ElMessage.error('保存失败，请稍后重试')
  } finally {
    saving.value = false
  }
}

/** 打开媒体元数据导入弹窗，默认清空上一次来源地址。 */
function openImport(row: AdminAnime) {
  importAnime.value = row
  importSourceUrl.value = ''
  importDialogVisible.value = true
}

/** 校验来源地址并调用管理代理导入剧集元数据。 */
async function importEpisodes() {
  const sourceUrl = importSourceUrl.value.trim()
  if (!/^https:\/\//i.test(sourceUrl)) {
    ElMessage.warning('来源地址必须以 https:// 开头')
    return
  }
  if (!importAnime.value) return
  importSaving.value = true
  try {
    const rows = await adminApi.animeEpisodesImport(importAnime.value.id, sourceUrl)
    ElMessage.success(`已导入 ${rows.length} 集媒体元数据`)
    importDialogVisible.value = false
  } catch {
    ElMessage.error('媒体元数据导入失败，请检查授权来源和地址')
  } finally {
    importSaving.value = false
  }
}

/** 使用一个授权详情页导入作品简介、封面和视频资源。 */
async function importAnimeByUrl() {
  const sourceUrl = urlImportSourceUrl.value.trim()
  if (!/^https:\/\//i.test(sourceUrl)) {
    ElMessage.warning('来源地址必须以 https:// 开头')
    return
  }
  urlImportSaving.value = true
  try {
    const result = await adminApi.animeImportUrl(sourceUrl, urlImportPublish.value)
    ElMessage.success(`已导入《${result.anime.title}》，视频资源 ${result.episodesImported} 条`)
    urlImportDialogVisible.value = false
    await load()
  } catch {
    ElMessage.error('URL 导入失败，请检查授权来源、白名单和页面格式')
  } finally {
    urlImportSaving.value = false
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-welcome">
      <div>
        <span class="admin-kicker">内容工作台</span>
        <h2>内容管理</h2>
        <p>覆盖创建、审核、发布与下架。</p>
      </div>
      <div class="content-actions">
        <el-button :disabled="!auth.hasPerm('anime:content:edit')" @click="openUrlImport">URL 导入</el-button>
        <el-button type="primary" :disabled="!auth.hasPerm('anime:content:edit')" @click="openCreate">＋ 新建内容</el-button>
      </div>
    </div>
    <div class="admin-toolbar">
      <el-input v-model="keyword" placeholder="搜索作品名称或编号" clearable class="admin-search" />
      <el-radio-group v-model="tab">
        <el-radio-button value="全部">全部</el-radio-button>
        <el-radio-button value="待审核">待审核</el-radio-button>
        <el-radio-button value="草稿">草稿</el-radio-button>
        <el-radio-button value="已下架">已下架</el-radio-button>
      </el-radio-group>
    </div>
    <el-table v-loading="loading" :data="filtered" class="admin-table" empty-text="没有符合条件的作品">
      <el-table-column label="作品">
        <template #default="{ row }">
          <strong>{{ row.title }}</strong>
          <small class="admin-sub">{{ row.originalTitle }}</small>
        </template>
      </el-table-column>
      <el-table-column prop="type" label="类型" width="110" />
      <el-table-column prop="source" label="来源" width="110" />
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="row.status === '已发布' ? 'success' : row.status === '待审核' ? 'warning' : 'info'">
            {{ row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="updated" label="更新时间" width="130" />
      <el-table-column label="操作" width="340">
        <template #default="{ row }">
          <el-button size="small" :disabled="!auth.hasPerm('anime:content:edit')" @click="openEdit(row)">编辑</el-button>
          <el-button v-if="auth.hasPerm('anime:content:status') && row.status === '待审核'" size="small" type="success" @click="updateStatus(row, '已发布')">通过</el-button>
          <el-button v-if="auth.hasPerm('anime:content:status') && row.status === '已发布'" size="small" type="danger" @click="updateStatus(row, '已下架')">下架</el-button>
          <el-button v-if="auth.hasPerm('anime:content:status') && row.status === '已下架'" size="small" type="success" @click="updateStatus(row, '已发布')">重新发布</el-button>
          <el-button v-if="auth.hasPerm('anime:content:edit')" size="small" @click="openImport(row)">导入播放源</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑作品' : '新建作品'" width="560px">
      <el-form label-position="top" class="anime-draft-form">
        <el-form-item label="标题" required>
          <el-input v-model="form.title" maxlength="120" placeholder="作品标题" />
        </el-form-item>
        <el-form-item label="别名 / 原名">
          <el-input v-model="form.originalTitle" maxlength="120" placeholder="原始标题（可选）" />
        </el-form-item>
        <div class="anime-draft-row">
          <el-form-item label="类型" required>
            <el-input v-model="form.type" maxlength="20" placeholder="电视动画 / 剧场版 / 网络动画" />
          </el-form-item>
          <el-form-item label="年份">
            <el-input-number v-model="form.year" :min="1900" :max="2100" controls-position="right" />
          </el-form-item>
        </div>
        <el-form-item label="简介">
          <el-input v-model="form.summary" type="textarea" :rows="3" maxlength="2000" show-word-limit placeholder="作品简介（可选）" />
        </el-form-item>
        <el-form-item label="标签（逗号分隔）">
          <el-input v-model="form.tagsText" placeholder="例如：科幻,冒险,群像" />
        </el-form-item>
        <el-form-item label="更新文案">
          <el-input v-model="form.updateText" maxlength="50" placeholder="例如：周三 22:00 更新 / 已完结" />
        </el-form-item>
        <el-form-item label="来源页面地址">
          <el-input v-model="form.sourceUrl" maxlength="1000" placeholder="https://example.com/anime/xxx" />
        </el-form-item>
        <el-form-item label="封面地址">
          <el-input v-model="form.coverUrl" maxlength="1000" placeholder="/admin-profile/profile/upload/xxx.jpg 或 HTTPS 地址" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveForm">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="urlImportDialogVisible" title="URL 导入作品" width="560px">
      <el-form label-position="top">
        <el-form-item label="作品详情页地址" required>
          <el-input v-model="urlImportSourceUrl" placeholder="https://example.com/p/..." />
        </el-form-item>
        <el-form-item label="发布状态">
          <el-switch v-model="urlImportPublish" active-text="导入后发布" inactive-text="保存为草稿" />
        </el-form-item>
        <p class="admin-dialog-note">导入会读取公开页面中的标题、简介、年份、标签、封面和视频资源；不会下载视频文件。请确认该来源已获授权。</p>
      </el-form>
      <template #footer>
        <el-button @click="urlImportDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="urlImportSaving" @click="importAnimeByUrl">开始导入</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="importDialogVisible" title="导入授权播放源" width="560px">
      <el-form label-position="top">
        <el-form-item label="来源页面地址" required>
          <el-input v-model="importSourceUrl" placeholder="https://example.com/p/..." />
        </el-form-item>
        <p class="admin-dialog-note">仅导入公开页面中的剧集和外部播放器地址，不下载视频文件。请确认你拥有该内容的抓取与播放授权。</p>
      </el-form>
      <template #footer>
        <el-button @click="importDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="importSaving" @click="importEpisodes">开始导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>
