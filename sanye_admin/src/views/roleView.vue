<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminMenuApi, adminRoleApi, type AdminMenu, type AdminRole, type AdminRoleBody } from '@/api/system'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const loading = ref(false)
const loadFailed = ref(false)
const rows = ref<AdminRole[]>([])
const total = ref(0)
const page = ref(1)
const size = 10
const roleName = ref('')
const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const menuTree = ref<AdminMenu[]>([])
const menuTreeRef = ref()
const menuLoading = ref(false)
const roleForm = reactive<AdminRoleBody>({ roleName: '', roleKey: '', roleSort: 1, status: '0', menuIds: [], menuCheckStrictly: false, remark: '' })

/** 清空角色表单并恢复默认状态。 */
function resetForm() {
  Object.assign(roleForm, { roleId: undefined, roleName: '', roleKey: '', roleSort: 1, status: '0', menuIds: [], menuCheckStrictly: false, remark: '' })
  editingId.value = null
  menuTreeRef.value?.setCheckedKeys([])
}

/** 分页加载角色列表。 */
async function load() {
  loading.value = true
  try {
    const result = await adminRoleApi.list(page.value, size, roleName.value || undefined)
    rows.value = result.rows ?? []
    total.value = result.total ?? 0
    loadFailed.value = false
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

/** 读取角色可选菜单树和已勾选菜单。 */
async function loadMenus(roleId: number) {
  menuLoading.value = true
  try {
    const result = await adminRoleApi.menuTree(roleId)
    menuTree.value = result.menus ?? []
    await nextTick()
    menuTreeRef.value?.setCheckedKeys(result.checkedKeys ?? [])
  } catch {
    menuTree.value = []
  } finally {
    menuLoading.value = false
  }
}

/** 打开新建角色表单。 */
function openCreate() {
  resetForm()
  dialogVisible.value = true
  void loadMenus(0)
}

/** 读取角色详情并加载权限树。 */
async function openEdit(row: AdminRole) {
  resetForm()
  editingId.value = row.roleId
  dialogVisible.value = true
  try {
    const detail = await adminRoleApi.detail(row.roleId)
    Object.assign(roleForm, detail.data, { roleId: row.roleId })
  } catch {
    Object.assign(roleForm, row)
  }
  await loadMenus(row.roleId)
}

/** 校验角色信息和菜单权限后保存角色。 */
async function save() {
  if (!roleForm.roleName.trim() || !roleForm.roleKey.trim()) {
    ElMessage.warning('角色名称和权限字符不能为空')
    return
  }
  const checked = menuTreeRef.value?.getCheckedKeys?.(false) ?? []
  const halfChecked = menuTreeRef.value?.getHalfCheckedKeys?.() ?? []
  roleForm.menuIds = [...new Set([...checked, ...halfChecked])] as number[]
  try {
    const result = editingId.value ? await adminRoleApi.edit(roleForm) : await adminRoleApi.add(roleForm)
    if (result.code === 200) {
      ElMessage.success(editingId.value ? '角色已更新' : '角色已创建')
      dialogVisible.value = false
      void load()
    } else {
      ElMessage.error(result.msg || '保存失败')
    }
  } catch {
    ElMessage.error('保存失败，请稍后重试')
  }
}

/** 修改角色启用状态。 */
async function changeStatus(row: AdminRole, status: string) {
  try {
    const result = await adminRoleApi.changeStatus(row.roleId, status)
    if (result.code === 200) {
      row.status = status
      ElMessage.success(status === '0' ? '角色已启用' : '角色已停用')
    } else ElMessage.error(result.msg || '状态更新失败')
  } catch {
    ElMessage.error('状态更新失败，请稍后重试')
  }
}

/** 二次确认后删除角色。 */
async function remove(row: AdminRole) {
  try {
    await ElMessageBox.confirm(`确认删除角色「${row.roleName}」吗？`, '删除确认', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
    const result = await adminRoleApi.remove([row.roleId])
    if (result.code === 200) {
      ElMessage.success('角色已删除')
      void load()
    } else ElMessage.error(result.msg || '删除失败')
  } catch {
    // 取消操作不提示。
  }
}

onMounted(() => void load())
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-heading">
      <div><span class="header-kicker">授权边界</span><h2>角色管理</h2><p>维护角色权限，并将菜单授权直接同步到 RuoYi 账号体系。</p></div>
      <span class="admin-page-count">共 {{ total }} 个角色</span>
    </div>
    <div class="admin-toolbar">
      <el-input v-model="roleName" class="admin-search" clearable placeholder="按角色名称检索" @keyup.enter="page = 1; void load()" />
      <el-button type="primary" plain @click="page = 1; void load()">查询</el-button>
      <el-button @click="roleName = ''; page = 1; void load()">重置</el-button>
      <div class="admin-toolbar-spacer" />
      <el-button v-if="auth.hasPerm('system:role:add')" type="primary" @click="openCreate">新建角色</el-button>
    </div>
    <el-alert v-if="loadFailed" title="角色列表加载失败，现有数据未清空。" type="error" show-icon :closable="false" class="admin-load-alert">
      <template #default><el-button link type="danger" @click="void load()">重新加载</el-button></template>
    </el-alert>
    <el-table v-loading="loading" :data="rows" class="admin-table" empty-text="暂无角色">
      <el-table-column prop="roleName" label="角色名称" min-width="150" />
      <el-table-column prop="roleKey" label="权限字符" min-width="150" />
      <el-table-column prop="roleSort" label="排序" width="80" />
      <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="row.status === '0' ? 'success' : 'info'">{{ row.status === '0' ? '正常' : '停用' }}</el-tag></template></el-table-column>
      <el-table-column prop="createTime" label="创建时间" width="170" />
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button v-if="auth.hasPerm('system:role:edit')" size="small" type="primary" plain @click="void openEdit(row)">授权/编辑</el-button>
          <el-button v-if="auth.hasPerm('system:role:edit') && row.roleId !== 1" size="small" plain @click="changeStatus(row, row.status === '0' ? '1' : '0')">{{ row.status === '0' ? '停用' : '启用' }}</el-button>
          <el-button v-if="auth.hasPerm('system:role:remove') && row.roleId !== 1" size="small" type="danger" link @click="void remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="admin-pagination"><el-pagination v-model:current-page="page" :page-size="size" :total="total" layout="total, prev, pager, next" @current-change="void load()" /></div>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑角色' : '新建角色'" width="700px">
      <el-form label-width="100px" class="role-form">
        <el-form-item label="角色名称"><el-input v-model="roleForm.roleName" maxlength="30" /></el-form-item>
        <el-form-item label="权限字符"><el-input v-model="roleForm.roleKey" maxlength="100" /></el-form-item>
        <div class="role-form-grid"><el-form-item label="显示顺序"><el-input-number v-model="roleForm.roleSort" :min="0" :max="999" /></el-form-item><el-form-item label="状态"><el-switch v-model="roleForm.status" active-value="0" inactive-value="1" active-text="正常" inactive-text="停用" /></el-form-item></div>
        <el-form-item label="角色备注"><el-input v-model="roleForm.remark" type="textarea" :rows="2" maxlength="200" show-word-limit /></el-form-item>
        <el-form-item label="菜单权限"><el-tree ref="menuTreeRef" v-loading="menuLoading" :data="menuTree" node-key="menuId" show-checkbox default-expand-all :props="{ label: 'menuName', children: 'children' }" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" @click="void save()">保存授权</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.admin-toolbar-spacer { flex: 1; }
.admin-load-alert { margin-bottom: 14px; }
.admin-pagination { display: flex; justify-content: flex-end; margin-top: 14px; }
.role-form { max-height: 62vh; overflow: auto; padding-right: 8px; }
.role-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
@media (max-width: 640px) { .role-form-grid { grid-template-columns: 1fr; gap: 0; } }
</style>
