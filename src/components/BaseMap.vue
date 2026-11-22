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
  (e: 'mapError'): void
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

  map.on('error', () => emit('mapError'))
  map.addControl(new maplibregl.NavigationControl(), 'top-right')

  map.on('click', (e) => {
    emit('mapClick', { lng: e.lngLat.wrap().lng, lat: e.lngLat.lat })
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

defineExpose({ addMarker, clearMarkers })
</script>
