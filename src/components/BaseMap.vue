<template>
  <div ref="mapContainer" class="map-container"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const mapContainer = ref<HTMLDivElement | null>(null)
let map: maplibregl.Map | null = null
const markers: maplibregl.Marker[] = []

const emit = defineEmits<{
  (e: 'mapClick', lngLat: { lng: number; lat: number }): void
}>()

onMounted(() => {
  if (!mapContainer.value) return


  map = new maplibregl.Map({
    container: mapContainer.value,
    style: {
      version: 8,
      sources: { streets: { type: 'raster', tiles: [import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19,
        attribution: import.meta.env.VITE_TILE_ATTRIBUTION || '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>' } },
      layers: [{ id: 'streets', type: 'raster', source: 'streets' }]
    },
    center: [116.397428, 39.90923],
    zoom: 11
  })

  map.addControl(new maplibregl.NavigationControl(), 'top-right')

  map.on('click', (e) => {
    emit('mapClick', { lng: e.lngLat.lng, lat: e.lngLat.lat })
  })
})

onBeforeUnmount(() => {
  markers.forEach(m => m.remove())
  if (map) map.remove()
})

function addMarker(lngLat: [number, number], options: {
  color?: string
  data?: any
  onClick?: (marker: maplibregl.Marker, data: any) => void
  style?: 'default' | 'service'
} = {}) {
  if (!map) return null

  const el = document.createElement('div')

  if (options.style === 'service') {
    el.style.width = '22px'
    el.style.height = '22px'
    el.style.borderRadius = '50%'
    el.style.backgroundColor = options.color || '#FFF8DC'
    el.style.border = '2px solid #D4A574'
    el.style.boxShadow = '0 2px 8px rgba(139, 69, 19, 0.25)'
    el.style.cursor = 'pointer'
    el.style.opacity = '0.92'
  } else {
    el.style.backgroundColor = options.color || '#3b82f6'
    el.style.width = '24px'
    el.style.height = '24px'
    el.style.borderRadius = '50%'
    el.style.border = '2px solid white'
    el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)'
    el.style.cursor = 'pointer'
  }

  const marker = new maplibregl.Marker({ element: el })
    .setLngLat(lngLat)
    .addTo(map)

  if (options.onClick) {
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      options.onClick!(marker, options.data)
    })
  }

  markers.push(marker)
  return marker
}

function clearMarkers() {
  markers.forEach(m => m.remove())
  markers.length = 0
}

function fitBounds(coordinates: [number, number][]) {
  if (!map || coordinates.length === 0) return
  const bounds = coordinates.reduce(
    (b, coord) => b.extend(coord),
    new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
  )
  map.fitBounds(bounds, { padding: 50 })
}

function clearRoute() {
  if (!map) return
  // 清除分段路线图层
  let segIdx = 0
  while (map.getLayer(`route-seg-glow-${segIdx}`)) {
    map.removeLayer(`route-seg-glow-${segIdx}`)
    map.removeLayer(`route-seg-line-${segIdx}`)
    if (map.getSource(`route-seg-${segIdx}`)) map.removeSource(`route-seg-${segIdx}`)
    segIdx++
  }
  // 清除旧的单段路线图层
  if (map.getLayer('route-glow')) map.removeLayer('route-glow')
  if (map.getLayer('route-line')) map.removeLayer('route-line')
  if (map.getLayer('route-arrows')) map.removeLayer('route-arrows')
  if (map.getSource('route')) map.removeSource('route')
}

/**
 * 根据拥挤度获取颜色
 * 拥挤度规则: <0.2蓝, =0.2绿, >0.2<0.5黄, >=0.5红
 */
function getCongestionColor(congestion: number): { main: string; glow: string } {
  if (congestion < 0.2) {
    return { main: '#3b82f6', glow: '#60a5fa' } // 蓝色：畅通
  }
  if (congestion === 0.2) {
    return { main: '#22c55e', glow: '#4ade80' } // 绿色
  }
  if (congestion > 0.2 && congestion < 0.5) {
    return { main: '#eab308', glow: '#facc15' } // 黄色：轻微拥堵
  }
  return { main: '#ef4444', glow: '#f87171' } // 红色：拥堵
}

/**
 * 分段绘制路线，每段根据拥挤度染不同颜色
 * segmentCongestion: 与 coordinates 等长的数组，每个元素为拥挤度值 (0~1)
 */
function drawRoute(coordinates: [number, number][], congestion?: number | number[]) {
  if (!map || coordinates.length < 2) return

  clearRoute()

  // 如果传入了分段拥挤度数组，则分段渲染
  if (Array.isArray(congestion) && congestion.length === coordinates.length) {
    drawSegmentedRoute(coordinates, congestion)
    return
  }

  // 降级：单色渲染（兼容旧调用）
  const singleCong = typeof congestion === 'number' ? congestion : 0
  const colors = getCongestionColor(singleCong)

  map.addSource('route', {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: coordinates
      }
    }
  })

  map.addLayer({
    id: 'route-glow',
    type: 'line',
    source: 'route',
    layout: {
      'line-join': 'round',
      'line-cap': 'round'
    },
    paint: {
      'line-color': colors.glow,
      'line-width': 14,
      'line-opacity': 0.15,
      'line-blur': 8
    }
  })

  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route',
    layout: {
      'line-join': 'round',
      'line-cap': 'round'
    },
    paint: {
      'line-color': colors.main,
      'line-width': 5,
      'line-opacity': 0.9
    }
  })
}

/**
 * 分段渲染路线：将连续相同拥挤度等级的坐标点合并为一段，每段独立着色
 */
function drawSegmentedRoute(coordinates: [number, number][], segmentCongestion: number[]) {
  if (!map || coordinates.length < 2) return

  // 将连续相同颜色等级的点合并为段
  interface Seg { coords: [number, number][]; congestion: number }
  const segments: Seg[] = []
  let currentSeg: Seg = { coords: [coordinates[0]], congestion: segmentCongestion[0] }

  for (let i = 1; i < coordinates.length; i++) {
    const c = segmentCongestion[i]
    // 判断是否属于同一颜色等级
    const sameLevel = getCongestionColor(c).main === getCongestionColor(currentSeg.congestion).main
    if (sameLevel) {
      currentSeg.coords.push(coordinates[i])
    } else {
      currentSeg.coords.push(coordinates[i]) // 确保段与段之间连续
      segments.push(currentSeg)
      currentSeg = { coords: [coordinates[i]], congestion: c }
    }
  }
  segments.push(currentSeg)

  // 为每段添加独立的 source 和 layer
  segments.forEach((seg, idx) => {
    if (seg.coords.length < 2) return

    const colors = getCongestionColor(seg.congestion)

    map!.addSource(`route-seg-${idx}`, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: seg.coords
        }
      }
    })

    map!.addLayer({
      id: `route-seg-glow-${idx}`,
      type: 'line',
      source: `route-seg-${idx}`,
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': colors.glow,
        'line-width': 14,
        'line-opacity': 0.15,
        'line-blur': 8
      }
    })

    map!.addLayer({
      id: `route-seg-line-${idx}`,
      type: 'line',
      source: `route-seg-${idx}`,
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': colors.main,
        'line-width': 5,
        'line-opacity': 0.9
      }
    })
  })
}

defineExpose({
  addMarker,
  clearMarkers,
  fitBounds,
  drawRoute,
  clearRoute,
  getMap: () => map
})
</script>

<style scoped>
.map-container {
  width: 100%;
  height: 100%;
  position: relative;
}
</style>
