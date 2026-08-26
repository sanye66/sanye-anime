import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

import App from './App.vue'
import router from './router'
import { reportFrontendError } from './api/system'
import { initWebVitals } from './monitor/webVitals'
import './styles.css'

const app = createApp(App)

app.config.errorHandler = (err, _instance, info) => {
  console.error('[sanye-admin] vue error:', err)
  reportFrontendError({ type: 'vue-error', message: String(err), detail: info })
}

window.addEventListener('unhandledrejection', (event) => {
  reportFrontendError({ type: 'unhandledrejection', message: String(event.reason) })
})

app.use(createPinia()).use(router).use(ElementPlus).mount('#app')

initWebVitals()
