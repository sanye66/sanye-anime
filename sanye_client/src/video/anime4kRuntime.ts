import { VideoUpscaler } from 'anime4k.js/upscaler'
import {
  Anime4K_Clamp_Highlights,
  Anime4K_Restore_CNN_M,
  Anime4K_Restore_CNN_S,
  Anime4K_Restore_CNN_VL,
  Anime4K_Upscale_CNN_x2_M,
  Anime4K_Upscale_CNN_x2_S,
  Anime4K_Upscale_CNN_x2_VL,
  type Anime4KShaderConstructor,
} from 'anime4k.js/shaders'
import type { Anime4KProfile } from './anime4k'

function getProfileConfig(profile: Anime4KProfile): Anime4KShaderConstructor[] {
  if (profile === 'fast') {
    return [Anime4K_Clamp_Highlights, Anime4K_Restore_CNN_S, Anime4K_Upscale_CNN_x2_S]
  }
  if (profile === 'sharp') {
    return [Anime4K_Clamp_Highlights, Anime4K_Restore_CNN_VL, Anime4K_Upscale_CNN_x2_VL]
  }
  return [Anime4K_Clamp_Highlights, Anime4K_Restore_CNN_M, Anime4K_Upscale_CNN_x2_M]
}

export function isAnime4KSupported() {
  return VideoUpscaler.isSupported()
}

export function createAnime4KVideoUpscaler(profile: Anime4KProfile) {
  return new VideoUpscaler(getProfileConfig(profile), 30)
}
