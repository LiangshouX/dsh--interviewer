    // ── api ───────────────────────────────────────────────────────────────
    const API = '/interviewer/api'

    /** Read one JSON resource. */
    async function apiGet(resource, query) {
      const search = query === undefined ? '' : `?${new URLSearchParams(query)}`
      const response = await fetch(`${API}/${resource}${search}`, { credentials: 'same-origin' })
      const body = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }))
      if (!body.ok) throw new Error(body.error ?? `HTTP ${response.status}`)
      return body.data
    }

    /** Post one JSON action. */
    async function apiPost(resource, body) {
      const response = await fetch(`${API}/${resource}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      const payload = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }))
      if (!payload.ok) throw new Error(payload.error ?? `HTTP ${response.status}`)
      return payload.data
    }

    /** Read a file as base64 (without the data-url prefix). */
    function readFileAsBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('文件读不出来'))
        reader.onload = () => {
          const result = String(reader.result ?? '')
          const comma = result.indexOf(',')
          resolve(comma >= 0 ? result.slice(comma + 1) : result)
        }
        reader.readAsDataURL(file)
      })
    }

    /** Read a blob as base64 (without the data-url prefix). */
    function blobToBase64(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('读不出来'))
        reader.onload = () => {
          const result = String(reader.result ?? '')
          const comma = result.indexOf(',')
          resolve(comma >= 0 ? result.slice(comma + 1) : result)
        }
        reader.readAsDataURL(blob)
      })
    }

    /** Read raw bytes as base64 (no data-url wrapper). */
    function bufferToBase64(buffer) {
      const bytes = new Uint8Array(buffer)
      let binary = ''
      const step = 0x8000
      for (let index = 0; index < bytes.length; index += step) {
        binary += String.fromCharCode.apply(null, bytes.subarray(index, index + step))
      }
      return btoa(binary)
    }

    /**
     * Decode a recording into 16 kHz mono float samples.
     *
     * **为什么必须转码。** 浏览器只会录 webm/opus，而主流识别服务
     * （MiniMax、Whisper 兼容接口）要 wav/aiff/flac/m4a/mp3/aac/opus/ogg——
     * **webm 不在其中**。不解码就上传，服务端会直接 400。
     *
     * @param {ArrayBuffer} arrayBuffer
     * @returns {Promise<{samples: Float32Array, sampleRate: number}>}
     */
    function decodeToMono16k(arrayBuffer) {
      const Ctor = window.AudioContext ?? window.webkitAudioContext
      if (Ctor === undefined) {
        return Promise.reject(new Error('这个环境没有 AudioContext，无法转码'))
      }
      return new Promise((resolve, reject) => {
        let context
        try {
          context = new Ctor({ sampleRate: 16000 })
        } catch {
          context = new Ctor()
        }
        context.decodeAudioData(arrayBuffer, buffer => {
          try {
            const channels = buffer.numberOfChannels
            const ratio = buffer.sampleRate / 16000
            const length = Math.max(1, Math.floor(buffer.length / ratio))
            const mono = new Float32Array(length)
            for (let index = 0; index < length; index += 1) {
              const source = Math.min(buffer.length - 1, Math.floor(index * ratio))
              let sum = 0
              for (let channel = 0; channel < channels; channel += 1) {
                sum += buffer.getChannelData(channel)[source]
              }
              mono[index] = sum / channels
            }
            context.close().catch(() => {})
            resolve({ samples: mono, sampleRate: 16000 })
          } catch (error) {
            context.close().catch(() => {})
            reject(error instanceof Error ? error : new Error(String(error)))
          }
        }, error => {
          context.close().catch(() => {})
          reject(new Error(`音频解码失败：${error && error.message ? error.message : String(error)}`))
        })
      })
    }

    /**
     * Encode mono float samples as 16-bit PCM WAV.
     *
     * @param {Float32Array} samples
     * @param {number} sampleRate
     * @returns {ArrayBuffer}
     */
    function encodeWav(samples, sampleRate) {
      const buffer = new ArrayBuffer(44 + samples.length * 2)
      const view = new DataView(buffer)
      const writeString = (offset, text) => {
        for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index))
      }
      writeString(0, 'RIFF')
      view.setUint32(4, 36 + samples.length * 2, true)
      writeString(8, 'WAVE')
      writeString(12, 'fmt ')
      view.setUint32(16, 16, true)
      view.setUint16(20, 1, true)
      view.setUint16(22, 1, true)
      view.setUint32(24, sampleRate, true)
      view.setUint32(28, sampleRate * 2, true)
      view.setUint16(32, 2, true)
      view.setUint16(34, 16, true)
      writeString(36, 'data')
      view.setUint32(40, samples.length * 2, true)
      let offset = 44
      for (let index = 0; index < samples.length; index += 1, offset += 2) {
        const sample = Math.max(-1, Math.min(1, samples[index]))
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      }
      return buffer
    }

    /** Format a duration in milliseconds as `mm:ss`. */
    function formatClock(ms) {
      const total = Math.max(0, Math.floor(ms / 1000))
      const minutes = Math.floor(total / 60)
      const seconds = total % 60
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    }

    /**
     * Format a byte count with a unit a human reads.
     *
     * 录像动辄几 GB——写成「10240 KiB」没人读得下去。
     */
    function formatBytes(bytes) {
      const value = Number(bytes ?? 0)
      if (!Number.isFinite(value) || value <= 0) return '0 B'
      if (value < 1024) return `${value} B`
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KiB`
      if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MiB`
      return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GiB`
    }

    /** Format a timestamp as a local clock string. */
    function formatTime(ts) {
      const date = new Date(ts)
      const pad = value => String(value).padStart(2, '0')
      return `${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    /**
     * The monogram of a session title, for the no-signal plate.
     *
     * 中文标题不能按「首字母」处理——「字节 · 高级后端工程师」取首字母会得到
     * 「字高」，那是两个没意义的字。中文取**第一段的前两个字**，
     * 英文才取首字母。
     */
    function initialsOf(title) {
      const text = String(title ?? '').trim()
      if (text === '') return '—'
      const first = text.split(/[·・,，/]/)[0].trim()
      if (first === '') return text.slice(0, 2)
      if (/[\u4e00-\u9fff\u3040-\u30ff]/.test(first)) return first.slice(0, 2)
      const words = first.split(/\s+/).filter(word => word !== '')
      if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase()
      return first.slice(0, 2).toUpperCase()
    }

