<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminUserApi, type AdminSysUser } from '@/api/users'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const loading = ref(false)
const loadFailed = ref(false)
const rows = ref<AdminSysUser[]>([])
const total = ref(0)
const page = ref(1)
const size = 10
const userName = ref('')
const phonenumber = ref('')
const status = ref('')

const detailVisible = ref(false)
const detail = ref<AdminSysUser | null>(null)

const pwdVisible = ref(false)
const pwdTarget = ref<AdminSysUser | null>(null)
const newPassword = ref('')
const pwdSubmitting = ref(false)

/** 按账号、手机号和状态加载管理员用户列表。 */
async function load() {
  loading.value = true
  try {
    const result = await adminUserApi.list({
      pageNum: page.value,
      pageSize: size,
      userName: userName.value || undefined,
      phonenumber: phonenumber.value || undefined,
      status: status.value || undefined,
    })
    if (result.code === 200) {
      rows.value = result.rows ?? []
      total.value = result.total ?? 0
      loadFailed.value = false
    } else {
      loadFailed.value = true
    }
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

/** 清空用户筛选条件并重新查询。 */
function resetFilter() {
  userName.value = ''
  phonenumber.value = ''
  status.value = ''
  page.value = 1
  void load()
}

/** 读取并打开用户详情。 */
async function openDetail(row: AdminSysUser) {
  try {
    const result = await adminUserApi.detail(row.userId)
    detail.value = result.data ?? row
  } catch {
    detail.value = row
  }
  detailVisible.value = true
}

/** 切换用户启用/停用状态并同步当前行。 */
async function toggleStatus(row: AdminSysUser) {
  const next = row.status === '0' ? '1' : '0'
  const label = next === '1' ? '停用' : '启用'
  try {
    await ElMessageBox.confirm(`确认${label}用户「${row.userName}」吗？`, '状态确认', {
      confirmButtonText: label,
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    const result = await adminUserApi.changeStatus(row.userId, next)
    if (result.code === 200) {
      row.status = next
      ElMessage.success(`用户「${row.userName}」已${label}`)
    } else {
      ElMessage.error(result.msg || '操作失败')
    }
  } catch {
    ElMessage.error('操作失败，请稍后重试')
  }
}

/** 打开指定用户的重置密码弹窗。 */
function openResetPwd(row: AdminSysUser) {
  pwdTarget.value = row
  newPassword.value = ''
  pwdVisible.value = true
}

/** 校验新密码并提交管理员密码重置。 */
async function submitResetPwd() {
  if (!pwdTarget.value) return
  if (newPassword.value.length < 6 || newPassword.value.length > 20) {
    ElMessage.warning('密码长度需为 6-20 位')
    return
  }
  pwdSubmitting.value = true
  try {
    const result = await adminUserApi.resetPwd(pwdTarget.value.userId, newPassword.value)
    if (result.code === 200) {
      ElMessage.success(`用户「${pwdTarget.value.userName}」密码已重置`)
      pwdVisible.value = false
    } else {
      ElMessage.error(result.msg || '重置失败')
    }
  } catch {
    ElMessage.error('重置失败，请稍后重试')
  } finally {
    pwdSubmitting.value = false
  }
}

onMounted(() => void load())
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-heading">
      <div><span class="header-kicker">三叶的记录员名册</span><h2>用户管理</h2><p>账号状态、资料查看与密码重置；高风险操作按权限开放。</p></div>
      <span class="admin-page-count">共 {{ total }} 个用户</span>
    </div>
    <div class="admin-toolbar">
      <el-input v-model="userName" placeholder="按用户名检索" clearable class="admin-search" @keyup.enter="page = 1; void load()" />
      <el-input v-model="phonenumber" placeholder="按手机号检索" clearable class="admin-search" style="width: 180px" @keyup.enter="page = 1; void load()" />
      <el-select v-model="status" placeholder="账号状态" clearable style="width: 130px">
        <el-option label="正常" value="0" />
        <el-option label="停用" value="1" />
      </el-select>
      <el-button type="primary" plain @click="page = 1; void load()">查询</el-button>
      <el-button @click="resetFilter">重置</el-button>
      <div class="admin-toolbar-spacer" />
      <el-button @click="void load()">刷新</el-button>
    </div>
    <el-alert v-if="loadFailed" title="用户列表加载失败，现有数据未清空。" type="error" show-icon :closable="false" class="admin-load-alert">
      <template #default><el-button link type="danger" @click="void load()">重新加载</el-button></template>
    </el-alert>
    <el-table v-loading="loading" :data="rows" class="admin-table" empty-text="暂无用户">
      <el-table-column prop="userId" label="用户 ID" width="80" />
      <el-table-column label="用户名" min-width="120">
        <template #default="{ row }">
          {{ row.userName }}
          <el-tag v-if="row.admin" size="small" type="danger" effect="plain">管理员</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="nickName" label="昵称" min-width="110" />
      <el-table-column label="部门" min-width="110">
        <template #default="{ row }">{{ row.dept?.deptName ?? '-' }}</template>
      </el-table-column>
      <el-table-column prop="phonenumber" label="手机号" width="130" />
      <el-table-column prop="email" label="邮箱" min-width="150" show-overflow-tooltip />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === '0' ? 'success' : 'danger'">{{ row.status === '0' ? '正常' : '停用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="最后登录" min-width="170">
        <template #default="{ row }">{{ row.loginDate ? `${row.loginDate}${row.loginIp ? ' · ' + row.loginIp : ''}` : '-' }}</template>
      </el-table-column>
      <el-table-column prop="createTime" label="创建时间" width="160" />
      <el-table-column label="操作" width="210" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" plain @click="openDetail(row)">详情</el-button>
          <el-button v-if="auth.hasPerm('system:user:resetPwd')" size="small" type="warning" plain @click="openResetPwd(row)">重置密码</el-button>
          <el-button
            v-if="!row.admin && auth.hasPerm('system:user:edit')"
            size="small"
            :type="row.status === '0' ? 'danger' : 'success'"
            plain
            @click="toggleStatus(row)"
          >
            {{ row.status === '0' ? '停用' : '启用' }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="admin-pagination">
      <el-pagination
        v-model:current-page="page"
        :page-size="size"
        :total="total"
        layout="total, prev, pager, next"
        @current-change="void load()"
      />
    </div>

    <el-dialog v-model="detailVisible" title="用户详情" width="560px">
      <el-descriptions v-if="detail" :column="1" border>
        <el-descriptions-item label="用户 ID">{{ detail.userId }}</el-descriptions-item>
        <el-descriptions-item label="用户名">{{ detail.userName }}</el-descriptions-item>
        <el-descriptions-item label="昵称">{{ detail.nickName }}</el-descriptions-item>
        <el-descriptions-item label="部门">{{ detail.dept?.deptName ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="手机号">{{ detail.phonenumber ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="邮箱">{{ detail.email ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="账号状态">
          <el-tag :type="detail.status === '0' ? 'success' : 'danger'">{{ detail.status === '0' ? '正常' : '停用' }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ detail.createTime ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="最后登录">{{ detail.loginDate ? detail.loginDate + (detail.loginIp ? ' · ' + detail.loginIp : '') : '-' }}</el-descriptions-item>
        <el-descriptions-item label="备注">{{ detail.remark ?? '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>

    <el-dialog v-model="pwdVisible" title="重置密码" width="440px">
      <p class="pwd-tip">为用户「{{ pwdTarget?.userName }}」设置新密码（6-20 位）。</p>
      <el-input
        v-model="newPassword"
        type="password"
        show-password
        placeholder="请输入新密码"
        maxlength="20"
        @keyup.enter="submitResetPwd"
      />
      <template #footer>
        <el-button @click="pwdVisible = false">取消</el-button>
        <el-button type="primary" :loading="pwdSubmitting" @click="submitResetPwd">确认重置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.admin-toolbar-spacer {
  flex: 1;
}

.admin-load-alert {
  margin-bottom: 14px;
}

.admin-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.pwd-tip {
  margin: 0 0 12px;
  color: var(--admin-text-secondary, #8b93a7);
  font-size: 13px;
}
</style>
