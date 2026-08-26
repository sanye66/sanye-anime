<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi, type AdminLegalDocument, type LegalStatus } from '@/api/admin'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const loading = ref(false)
const saving = ref(false)
const rows = ref<AdminLegalDocument[]>([])
const selected = ref<AdminLegalDocument | null>(null)
const editTitle = ref('')
const editContent = ref('')

const keyLabels: Record<string, string> = {
  privacy: '隐私政策',
  terms: '使用条款',
  copyright: '版权与内容来源',
  contact: '联系我们',
}

/** 加载官网法律正文并默认选中第一篇文档。 */
async function load() {
  loading.value = true
  try {
    rows.value = await adminApi.legal()
    if (rows.value.length > 0) {
      selectRow(rows.value[0])
    }
  } catch {
    ElMessage.error('官网正文加载失败')
  } finally {
    loading.value = false
  }
}

/** 将当前文档复制到编辑控件，避免直接修改列表对象。 */
function selectRow(row: AdminLegalDocument) {
  selected.value = row
  editTitle.value = row.title
  editContent.value = row.content
}

/** 校验正文并保存草稿或发布版本。 */
async function save(status: LegalStatus) {
  if (!selected.value) return
  const title = editTitle.value.trim()
  const content = editContent.value.trim()
  if (!title || !content) {
    ElMessage.warning('标题与正文不能为空')
    return
  }
  saving.value = true
  try {
    const saved = await adminApi.legalSave(selected.value.key, { title, content, status })
    const index = rows.value.findIndex((row) => row.key === saved.key)
    if (index >= 0) rows.value[index] = saved
    selected.value = saved
    ElMessage.success(`「${keyLabels[selected.value.key]}」已${status === '已发布' ? '发布' : '保存为草稿'}`)
  } catch {
    ElMessage.error('保存失败，请稍后重试')
  } finally {
    saving.value = false
  }
}

void load()
</script>

<template>
  <div class="admin-page">
    <div class="admin-welcome">
      <div>
        <span class="admin-kicker">官网内容</span>
        <h2>官网正文</h2>
        <p>编辑官网法律与联系信息，保存草稿或直接发布到官网。</p>
      </div>
      <el-tag v-if="selected" :type="selected.status === '已发布' ? 'success' : 'warning'">
        当前：{{ selected.status }}
      </el-tag>
    </div>

    <div class="legal-editor-layout">
      <el-table
        v-loading="loading"
        :data="rows"
        class="admin-table legal-doc-list"
        highlight-current-row
        empty-text="暂无正文"
        @current-change="(row: AdminLegalDocument) => row && selectRow(row)"
      >
        <el-table-column label="文档">
          <template #default="{ row }">
            <strong>{{ keyLabels[row.key] ?? row.key }}</strong>
            <small class="admin-sub">{{ row.key }} · {{ row.updatedBy }}</small>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === '已发布' ? 'success' : 'warning'">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
      </el-table>

      <section v-if="selected" class="legal-editor-panel">
        <div class="legal-editor-head">
          <span class="admin-kicker">正在编辑</span>
          <h3>{{ keyLabels[selected.key] }}</h3>
          <small>保存草稿后官网不可见；发布后立即对官网公开接口生效。</small>
        </div>
        <label class="legal-field">
          <span>标题</span>
          <el-input v-model="editTitle" maxlength="100" show-word-limit placeholder="文档标题" />
        </label>
        <label class="legal-field">
          <span>正文（空行分段）</span>
          <el-input
            v-model="editContent"
            type="textarea"
            :rows="12"
            maxlength="20000"
            show-word-limit
            placeholder="输入正文，使用空行分隔段落"
          />
        </label>
        <div class="legal-editor-actions">
          <el-button :disabled="saving || !auth.hasPerm('legal:content:edit')" @click="save('草稿')">
            保存草稿
          </el-button>
          <el-button type="primary" :disabled="saving || !auth.hasPerm('legal:content:edit')" @click="save('已发布')">
            {{ saving ? '保存中…' : '保存并发布' }}
          </el-button>
        </div>
      </section>
    </div>
  </div>
</template>
