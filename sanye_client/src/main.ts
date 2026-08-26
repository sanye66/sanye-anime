import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { reportFrontendError } from './api/system'
import { initWebVitals } from './monitor/webVitals'
import './styles.css'

const app = createApp(App)

app.config.errorHandler = (err, _instance, info) => {
  console.error('[sanye] vue error:', err)
  reportFrontendError({ type: 'vue-error', message: String(err), detail: info })
}

window.addEventListener('unhandledrejection', (event) => {
  reportFrontendError({ type: 'unhandledrejection', message: String(event.reason) })
})

app.use(createPinia()).use(router).mount('#app')

initWebVitals()
