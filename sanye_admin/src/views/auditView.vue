<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { adminAuditApi, maskSensitiveJson, OPER_TYPE_LABELS, type AdminLoginLog, type AdminOperLog } from '@/api/audit'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const activeTab = ref<'oper' | 'login'>('oper')

// 操作日志
const operLoading = ref(false)
const operRows = ref<AdminOperLog[]>([])
const operTotal = ref(0)
const operPage = ref(1)
const operSize = 10
const operKeyword = ref('')
const operStatus = ref('')

// 登录日志
const loginLoading = ref(false)
const loginRows = ref<AdminLoginLog[]>([])
const loginTotal = ref(0)
const loginPage = ref(1)
const loginSize = 10
const loginKeyword = ref('')
const loginStatus = ref('')

const detailVisible = ref(false)
const detailOper = ref<AdminOperLog | null>(null)
const detailLogin = ref<AdminLoginLog | null>(null)

/** 按筛选条件加载操作审计日志。 */
async function loadOper() {
  operLoading.value = true
  try {
    const result = await adminAuditApi.operlogList({
      pageNum: operPage.value,
      pageSize: operSize,
      keyword: operKeyword.value || undefined,
      status: operStatus.value || undefined,
    })
    operRows.value = result.code === 200 ? (result.rows ?? []) : []
    operTotal.value = result.code === 200 ? (result.total ?? 0) : 0
  } catch {
    operRows.value = []
    operTotal.value = 0
  } finally {
    operLoading.value = false
  }
}

/** 按筛选条件加载登录审计日志。 */
async function loadLogin() {
  loginLoading.value = true
  try {
    const result = await adminAuditApi.logininforList({
      pageNum: loginPage.value,
      pageSize: loginSize,
      keyword: loginKeyword.value || undefined,
      status: loginStatus.value || undefined,
    })
    loginRows.value = result.code === 200 ? (result.rows ?? []) : []
    loginTotal.value = result.code === 200 ? (result.total ?? 0) : 0
  } catch {
    loginRows.value = []
    loginTotal.value = 0
  } finally {
    loginLoading.value = false
  }
}

/** 清空操作日志筛选并重新查询。 */
function resetOper() {
  operKeyword.value = ''
  operStatus.value = ''
  operPage.value = 1
  void loadOper()
}

/** 清空登录日志筛选并重新查询。 */
function resetLogin() {
  loginKeyword.value = ''
  loginStatus.value = ''
  loginPage.value = 1
  void loadLogin()
}

/** 读取操作日志详情并在弹窗中展示脱敏后的字段。 */
async function openOperDetail(row: AdminOperLog) {
  try {
    const result = await adminAuditApi.operlogDetail(row.operId)
    detailOper.value = result.data ?? row
  } catch {
    detailOper.value = row
  }
  detailLogin.value = null
  detailVisible.value = true
}

/** 读取登录日志详情并在弹窗中展示。 */
async function openLoginDetail(row: AdminLoginLog) {
  try {
    const result = await adminAuditApi.logininforDetail(row.infoId)
    detailLogin.value = result.data ?? row
  } catch {
    detailLogin.value = row
  }
  detailOper.value = null
  detailVisible.value = true
}

onMounted(() => {
  void loadOper()
  if (auth.hasPerm('monitor:logininfor:list')) void loadLogin()
})
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-heading">
      <div><span class="header-kicker">三叶的证词档案</span><h2>权限与审计</h2><p>高风险操作与登录行为的可查记录：操作日志、登录日志。</p></div>
      <span class="admin-page-count">操作 {{ operTotal }} 条 · 登录 {{ loginTotal }} 条</span>
    </div>
    <el-tabs v-model="activeTab">
      <el-tab-pane label="操作日志" name="oper">
        <div class="admin-toolbar">
          <el-input v-model="operKeyword" placeholder="按操作人检索" clearable class="admin-search" @keyup.enter="operPage = 1; void loadOper()" />
          <el-select v-model="operStatus" placeholder="操作状态" clearable style="width: 130px">
            <el-option label="成功" value="0" />
            <el-option label="失败" value="1" />
          </el-select>
          <el-button type="primary" plain @click="operPage = 1; void loadOper()">查询</el-button>
          <el-button @click="resetOper">重置</el-button>
          <div class="admin-toolbar-spacer" />
          <el-button @click="void loadOper()">刷新</el-button>
        </div>
        <el-table v-loading="operLoading" :data="operRows" class="admin-table" empty-text="暂无操作日志">
          <el-table-column prop="operId" label="日志编号" width="90" />
          <el-table-column prop="title" label="模块" min-width="110" />
          <el-table-column label="操作类型" width="90">
            <template #default="{ row }">{{ OPER_TYPE_LABELS[row.businessType] ?? '其它' }}</template>
          </el-table-column>
          <el-table-column prop="operName" label="操作人" width="100" />
          <el-table-column prop="requestMethod" label="方式" width="80" />
          <el-table-column prop="operUrl" label="操作地址" min-width="180" show-overflow-tooltip />
          <el-table-column label="状态" width="80">
            <template #default="{ row }">
              <el-tag :type="row.status === 0 ? 'success' : 'danger'">{{ row.status === 0 ? '成功' : '失败' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="costTime" label="耗时(ms)" width="90" />
          <el-table-column prop="operTime" label="操作时间" width="160" />
          <el-table-column label="操作" width="80" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" plain @click="openOperDetail(row)">详情</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="admin-pagination">
          <el-pagination
            v-model:current-page="operPage"
            :page-size="operSize"
            :total="operTotal"
            layout="total, prev, pager, next"
            @current-change="void loadOper()"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane v-if="auth.hasPerm('monitor:logininfor:list')" label="登录日志" name="login">
        <div class="admin-toolbar">
          <el-input v-model="loginKeyword" placeholder="按用户名检索" clearable class="admin-search" @keyup.enter="loginPage = 1; void loadLogin()" />
          <el-select v-model="loginStatus" placeholder="登录状态" clearable style="width: 130px">
            <el-option label="成功" value="0" />
            <el-option label="失败" value="1" />
          </el-select>
          <el-button type="primary" plain @click="loginPage = 1; void loadLogin()">查询</el-button>
          <el-button @click="resetLogin">重置</el-button>
          <div class="admin-toolbar-spacer" />
          <el-button @click="void loadLogin()">刷新</el-button>
        </div>
        <el-table v-loading="loginLoading" :data="loginRows" class="admin-table" empty-text="暂无登录日志">
          <el-table-column prop="infoId" label="访问编号" width="90" />
          <el-table-column prop="userName" label="用户名" min-width="110" />
          <el-table-column prop="loginLocation" label="登录地址" min-width="110" />
          <el-table-column prop="ipaddr" label="登录 IP" width="130" />
          <el-table-column prop="browser" label="浏览器" min-width="150" show-overflow-tooltip />
          <el-table-column prop="os" label="操作系统" min-width="120" show-overflow-tooltip />
          <el-table-column label="状态" width="80">
            <template #default="{ row }">
              <el-tag :type="row.status === '0' ? 'success' : 'danger'">{{ row.status === '0' ? '成功' : '失败' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="msg" label="描述" min-width="140" show-overflow-tooltip />
          <el-table-column prop="loginTime" label="登录时间" width="160" />
          <el-table-column label="操作" width="80" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" plain @click="openLoginDetail(row)">详情</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="admin-pagination">
          <el-pagination
            v-model:current-page="loginPage"
            :page-size="loginSize"
            :total="loginTotal"
            layout="total, prev, pager, next"
            @current-change="void loadLogin()"
          />
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="detailVisible" title="审计记录详情" width="680px">
      <el-descriptions v-if="detailOper" :column="1" border>
        <el-descriptions-item label="日志编号">{{ detailOper.operId }}</el-descriptions-item>
        <el-descriptions-item label="模块">{{ detailOper.title }}</el-descriptions-item>
        <el-descriptions-item label="操作类型">{{ OPER_TYPE_LABELS[detailOper.businessType] ?? '其它' }}</el-descriptions-item>
        <el-descriptions-item label="操作人">{{ detailOper.operName }}</el-descriptions-item>
        <el-descriptions-item label="部门">{{ detailOper.deptName ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="请求方式">{{ detailOper.requestMethod }}</el-descriptions-item>
        <el-descriptions-item label="操作地址">{{ detailOper.operUrl }}</el-descriptions-item>
        <el-descriptions-item label="操作 IP">{{ detailOper.operIp }}（{{ detailOper.operLocation ?? '-' }}）</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="detailOper.status === 0 ? 'success' : 'danger'">{{ detailOper.status === 0 ? '成功' : '失败' }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="耗时">{{ detailOper.costTime ?? '-' }} ms</el-descriptions-item>
        <el-descriptions-item label="操作时间">{{ detailOper.operTime ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="请求参数"><pre class="audit-pre">{{ maskSensitiveJson(detailOper.operParam) || '无' }}</pre></el-descriptions-item>
        <el-descriptions-item label="返回结果"><pre class="audit-pre">{{ maskSensitiveJson(detailOper.jsonResult) || '无' }}</pre></el-descriptions-item>
        <el-descriptions-item label="异常信息"><pre class="audit-pre audit-error">{{ maskSensitiveJson(detailOper.errorMsg) || '无' }}</pre></el-descriptions-item>
      </el-descriptions>
      <el-descriptions v-else-if="detailLogin" :column="1" border>
        <el-descriptions-item label="访问编号">{{ detailLogin.infoId }}</el-descriptions-item>
        <el-descriptions-item label="用户名">{{ detailLogin.userName }}</el-descriptions-item>
        <el-descriptions-item label="登录地址">{{ detailLogin.loginLocation ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="登录 IP">{{ detailLogin.ipaddr }}</el-descriptions-item>
        <el-descriptions-item label="浏览器">{{ detailLogin.browser ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="操作系统">{{ detailLogin.os ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="detailLogin.status === '0' ? 'success' : 'danger'">{{ detailLogin.status === '0' ? '成功' : '失败' }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="描述">{{ detailLogin.msg ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="登录时间">{{ detailLogin.loginTime ?? '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<style scoped>
.admin-toolbar-spacer {
  flex: 1;
}

.admin-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.audit-pre {
  margin: 0;
  max-height: 180px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 12px;
  line-height: 1.6;
}

.audit-error {
  color: #d03050;
}
</style>
