<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useAttrs, watch } from 'vue'
import { displayableCoverUrl, getCoverSource, peekCoverSource, startCoverCache, usesNativeCoverFetch, type CoverSource } from './coverCache'
import placeholderCover from './assets/anime-placeholder.svg'

defineOptions({ inheritAttrs: false })
const props = defineProps<{ src?: string }>()
const emit = defineEmits<{ error: [event: Event]; load: [event: Event] }>()
const attrs = useAttrs()
const element = ref<HTMLImageElement>()
const source = ref<string>()
const loaded = ref(false)
let visible = false
let request = 0
let handle: CoverSource | undefined
let observer: IntersectionObserver | undefined
let recovering = false
let recovered = false

async function update() {
  const current = ++request
  handle?.release()
  handle = undefined
  source.value = visible ? placeholderCover : undefined
  loaded.value = false
  recovering = false
  recovered = false
  if (!visible || !props.src) return
  const result = await (usesNativeCoverFetch() ? getCoverSource(props.src) : peekCoverSource(props.src))
  if (current !== request) { result.release(); return }
  handle = result
  source.value = result.src || placeholderCover
  if (!result.cached && usesNativeCoverFetch()) recovered = true
  if (!result.src) {
    recovered = true
    const event = new Event('error')
    if (element.value) element.value.dispatchEvent(event)
    else { loaded.value = true; emit('error', event) }
    return
  }
  if (!result.cached && !usesNativeCoverFetch()) startCoverCache(props.src)
}

async function failed(event: Event) {
  if (recovering) return
  if (handle?.cached) {
    handle.release()
    handle = undefined
    if (usesNativeCoverFetch()) {
      source.value = placeholderCover
      loaded.value = true
      emit('error', event)
      return
    }
    source.value = displayableCoverUrl(props.src ?? '') || undefined
    return
  }
  if (!recovered && props.src) {
    recovering = true
    recovered = true
    const current = request
    const result = await getCoverSource(props.src)
    if (current !== request) { result.release(); return }
    recovering = false
    if (result.cached) {
      handle?.release()
      handle = result
      source.value = result.src
      return
    }
    result.release()
  }
  loaded.value = true
  emit('error', event)
}

onMounted(() => {
  if (attrs.loading === 'eager' || typeof IntersectionObserver === 'undefined') {
    visible = true
    void update()
    return
  }
  observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return
    visible = true
    observer?.disconnect()
    void update()
  }, { rootMargin: '600px' })
  if (element.value) observer.observe(element.value)
})
watch(() => props.src, () => { void update() })
onBeforeUnmount(() => { request++; observer?.disconnect(); handle?.release() })
</script>

<template>
  <img ref="element" v-bind="attrs" :class="{ 'android-cover-loading': !loaded, 'android-cover-ready': loaded }" :src="source" :loading="(attrs.loading as 'lazy' | 'eager' | undefined) ?? 'lazy'" @error="failed" @load="loaded = true; emit('load', $event)" />
</template>
