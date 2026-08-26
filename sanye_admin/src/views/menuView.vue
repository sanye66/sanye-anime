<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminMenuApi, type AdminMenu, type AdminMenuBody } from '@/api/system'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const loading = ref(false)
const flatRows = ref<AdminMenu[]>([])
const menuName = ref('')
const menuType = ref('')
const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const menuForm = reactive<AdminMenuBody>({ menuName: '', parentId: 0, orderNum: 1, path: '', component: '', routeName: '', menuType: 'C', visible: '0', status: '0', perms: '', icon: '' })

const treeRows = computed(() => {
  const byId = new Map<number, AdminMenu>()
  const roots: AdminMenu[] = []
  flatRows.value.forEach((item) => byId.set(item.menuId, { ...item, children: [] }))
  byId.forEach((item) => {
    if (item.parentId && byId.has(item.parentId)) byId.get(item.parentId)?.children?.push(item)
    else roots.push(item)
  })
  return roots
})

const parentOptions = computed(() => flatRows.value.filter((item) => item.menuType !== 'F' && item.menuId !== editingId.value))

/** 清空菜单表单并恢复菜单默认值。 */
function resetForm() {
  Object.assign(menuForm, { menuId: undefined, menuName: '', parentId: 0, orderNum: 1, path: '', component: '', routeName: '', menuType: 'C', visible: '0', status: '0', perms: '', icon: '' })
  editingId.value = null
}

/** 加载菜单树并转换为表格行。 */
async function load() {
  loading.value = true
  try {
    const result = await adminMenuApi.list(menuName.value || undefined, menuType.value || undefined)
    flatRows.value = result.data ?? []
  } catch {
    flatRows.value = []
  } finally {
    loading.value = false
  }
}

/** 按父菜单打开新建菜单表单。 */
function openCreate(parentId = 0) {
  resetForm()
  menuForm.parentId = parentId
  dialogVisible.value = true
}

/** 读取菜单详情并填充编辑表单。 */
async function openEdit(row: AdminMenu) {
  resetForm()
  editingId.value = row.menuId
  dialogVisible.value = true
  try {
    Object.assign(menuForm, (await adminMenuApi.detail(row.menuId)).data, { menuId: row.menuId })
  } catch {
    Object.assign(menuForm, row)
  }
}

/** 校验菜单字段并保存新增或编辑结果。 */
async function save() {
  if (!menuForm.menuName.trim()) {
    ElMessage.warning('菜单名称不能为空')
    return
  }
  try {
    const result = editingId.value ? await adminMenuApi.edit(menuForm) : await adminMenuApi.add(menuForm)
    if (result.code === 200) {
      ElMessage.success(editingId.value ? '菜单已更新' : '菜单已创建')
      dialogVisible.value = false
      void load()
    } else ElMessage.error(result.msg || '保存失败')
  } catch {
    ElMessage.error('保存失败，请稍后重试')
  }
}

/** 二次确认后删除菜单节点。 */
async function remove(row: AdminMenu) {
  try {
    await ElMessageBox.confirm(`确认删除菜单「${row.menuName}」吗？`, '删除确认', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
    const result = await adminMenuApi.remove(row.menuId)
    if (result.code === 200) {
      ElMessage.success('菜单已删除')
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
      <div><span class="header-kicker">路由与按钮</span><h2>菜单管理</h2><p>维护目录、页面和按钮权限，登录后由服务端路由清单决定可见范围。</p></div>
      <span class="admin-page-count">共 {{ flatRows.length }} 项菜单</span>
    </div>
    <div class="admin-toolbar">
      <el-input v-model="menuName" class="admin-search" clearable placeholder="按菜单名称检索" @keyup.enter="void load()" />
      <el-select v-model="menuType" clearable placeholder="菜单类型" style="width: 130px"><el-option label="目录" value="M" /><el-option label="菜单" value="C" /><el-option label="按钮" value="F" /></el-select>
      <el-button type="primary" plain @click="void load()">查询</el-button>
      <el-button @click="menuName = ''; menuType = ''; void load()">重置</el-button>
      <div class="admin-toolbar-spacer" />
      <el-button v-if="auth.hasPerm('system:menu:add')" type="primary" @click="openCreate()">新建菜单</el-button>
    </div>
    <el-table v-loading="loading" :data="treeRows" row-key="menuId" class="admin-table" :tree-props="{ children: 'children' }" empty-text="暂无菜单">
      <el-table-column prop="menuName" label="菜单名称" min-width="190" />
      <el-table-column label="类型" width="80"><template #default="{ row }"><el-tag size="small" :type="row.menuType === 'F' ? 'info' : row.menuType === 'M' ? 'warning' : 'success'">{{ row.menuType === 'F' ? '按钮' : row.menuType === 'M' ? '目录' : '菜单' }}</el-tag></template></el-table-column>
      <el-table-column prop="perms" label="权限标识" min-width="180" show-overflow-tooltip />
      <el-table-column prop="path" label="路由地址" min-width="150" show-overflow-tooltip />
      <el-table-column prop="orderNum" label="排序" width="70" />
      <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="row.status === '0' ? 'success' : 'info'">{{ row.status === '0' ? '正常' : '停用' }}</el-tag></template></el-table-column>
      <el-table-column label="操作" width="200" fixed="right"><template #default="{ row }"><el-button v-if="auth.hasPerm('system:menu:add') && row.menuType !== 'F'" size="small" type="primary" link @click="openCreate(row.menuId)">新增子项</el-button><el-button v-if="auth.hasPerm('system:menu:edit')" size="small" type="primary" link @click="void openEdit(row)">编辑</el-button><el-button v-if="auth.hasPerm('system:menu:remove')" size="small" type="danger" link @click="void remove(row)">删除</el-button></template></el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑菜单' : '新建菜单'" width="640px">
      <el-form label-width="100px">
        <div class="menu-form-grid"><el-form-item label="菜单名称"><el-input v-model="menuForm.menuName" maxlength="50" /></el-form-item><el-form-item label="上级菜单"><el-select v-model="menuForm.parentId" filterable><el-option label="根目录" :value="0" /><el-option v-for="item in parentOptions" :key="item.menuId" :label="item.menuName" :value="item.menuId" /></el-select></el-form-item></div>
        <div class="menu-form-grid"><el-form-item label="菜单类型"><el-radio-group v-model="menuForm.menuType"><el-radio label="M">目录</el-radio><el-radio label="C">菜单</el-radio><el-radio label="F">按钮</el-radio></el-radio-group></el-form-item><el-form-item label="显示顺序"><el-input-number v-model="menuForm.orderNum" :min="0" :max="999" /></el-form-item></div>
        <div class="menu-form-grid"><el-form-item label="路由地址"><el-input v-model="menuForm.path" maxlength="200" /></el-form-item><el-form-item label="组件路径"><el-input v-model="menuForm.component" maxlength="200" /></el-form-item></div>
        <div class="menu-form-grid"><el-form-item label="权限标识"><el-input v-model="menuForm.perms" maxlength="100" /></el-form-item><el-form-item label="路由名称"><el-input v-model="menuForm.routeName" maxlength="100" /></el-form-item></div>
        <div class="menu-form-grid"><el-form-item label="显示状态"><el-switch v-model="menuForm.visible" active-value="0" inactive-value="1" active-text="显示" inactive-text="隐藏" /></el-form-item><el-form-item label="菜单状态"><el-switch v-model="menuForm.status" active-value="0" inactive-value="1" active-text="正常" inactive-text="停用" /></el-form-item></div>
        <el-form-item label="菜单图标"><el-input v-model="menuForm.icon" placeholder="例如 guide、menu" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" @click="void save()">保存菜单</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.admin-toolbar-spacer { flex: 1; }
.menu-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
@media (max-width: 640px) { .menu-form-grid { grid-template-columns: 1fr; gap: 0; } }
</style>
