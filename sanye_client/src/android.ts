import { createApp } from 'vue'
import androidApp from './platform/android/androidApp.vue'
import './platform/android/android.css'

/**
 * 安卓端离线运行、不向后端上报；但异常也不能变成一块没有任何提示的黑屏。
 * 这里把渲染异常与未处理 Promise 统一记到控制台（可用 chrome://inspect 或 adb logcat 查看），
 * 挂载失败时给出可读提示与重试入口，而不是留下空的 #app。
 */
const app = createApp(androidApp)

app.config.errorHandler = (error, _instance, info) => {
  console.error('[sanye-android] vue error:', error, info)
}

window.addEventListener('unhandledrejection', (event) => {
  console.error('[sanye-android] unhandled rejection:', event.reason)
})

window.addEventListener('error', (event) => {
  console.error('[sanye-android] window error:', event.error ?? event.message)
})

try {
  app.mount('#app')
} catch (error) {
  console.error('[sanye-android] mount failed:', error)
  const host = document.querySelector('#app')
  if (host) {
    host.innerHTML = '<div class="android-mount-failure" role="alert">'
      + '<strong>界面加载失败</strong>'
      + '<p>本地界面没有成功启动，请重试；若反复出现，请把这一步的控制台输出一并反馈。</p>'
      + '<button type="button">重新加载</button>'
      + '</div>'
    host.querySelector('button')?.addEventListener('click', () => window.location.reload())
  }
}
