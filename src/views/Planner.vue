<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import BaseMap from '../components/BaseMap.vue'

const key = 'smartmap.itinerary.v1.' + JSON.parse(localStorage.getItem('user') || '{}').id
const map = ref(null)
const entries = ref([])
const draft = ref(null)
const message = ref('')
const mapProblem = ref(false)
const locked = ref(false)
let snapshot
const chronological = computed(() => [...entries.value].sort((a,b) => a.start.localeCompare(b.start)))
function valid(e) {
  return e && typeof e.id === 'string' && typeof e.name === 'string' && e.name.trim() &&
    ['停留','服务'].includes(e.kind) && Number.isFinite(e.lat) && Math.abs(e.lat)<=90 &&
    Number.isFinite(e.lng) && Math.abs(e.lng)<=180 && /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(e.start) &&
    Number.isInteger(e.minutes) && e.minutes>0 && e.minutes<=1440
}
function load() {
  try {
    snapshot = localStorage.getItem(key)
    const data = snapshot === null ? [] : JSON.parse(snapshot)
    if (!Array.isArray(data) || !data.every(valid)) throw Error()
    entries.value = data
    locked.value = false
  } catch {
    locked.value = true
    message.value = '本机行程无法读取，已暂停写入。'
  }
}
onMounted(load)
function persist(next) {
  try {
    if (locked.value) return false
    if (localStorage.getItem(key) !== snapshot) {
      load()
      message.value = '行程已在其他页面更新，请检查后重试。'
      return false
    }
    const json = JSON.stringify(next)
    localStorage.setItem(key,json)
    snapshot = json
    entries.value = next
    message.value = '已保存到此浏览器。'
    return true
  } catch {
    message.value = '保存失败，请检查浏览器存储权限或可用空间。'
    return false
  }
}
function pick(point) {
  if (locked.value) return
  if (!draft.value) draft.value = { id: '', name: '', kind: '停留', start: '', minutes: 60 }
  Object.assign(draft.value,point)
}
function save() {
  const item = { ...draft.value, name: draft.value.name.trim(), id: draft.value.id || crypto.randomUUID() }
  if (!valid(item)) { message.value = '请填写名称、时间和有效时长。'; return }
  const next = draft.value.id ? entries.value.map(e => e.id===item.id ? item : e) : [...entries.value,item]
  if (persist(next)) draft.value = null
}
function edit(e) { draft.value = { ...e } }
function remove(e) {
  if (persist(entries.value.filter(i => i.id!==e.id)) && draft.value?.id===e.id) draft.value=null
}
watch([entries,draft,map], async () => {
  await nextTick()
  map.value?.clearMarkers()
  for (const e of entries.value) {
    if (e.id!==draft.value?.id) map.value?.addMarker([e.lng,e.lat],{onClick:()=>edit(e)})
  }
  if (draft.value) map.value?.addMarker([draft.value.lng,draft.value.lat],{color:'#cd6536'})
},{deep:true})
</script>
<template>
<header><router-link to="/">返回行程</router-link><b>SmartMap</b><span>地图行程本</span></header>
<main><section class="canvas" aria-label="行程地图"><BaseMap ref="map" @map-click="pick" @map-error="mapProblem=true"/>
<p v-if="mapProblem" class="notice">部分地图内容加载失败，请检查网络后刷新。</p></section>
<aside><h1>我的行程</h1><p>点击地图添加地点或服务安排。记录保存在此浏览器，时间按行程当地时间填写。</p>
<form v-if="draft" @submit.prevent="save"><h2>{{draft.id?'编辑安排':'新增安排'}}</h2>
<small>{{draft.lng.toFixed(5)}}, {{draft.lat.toFixed(5)}} · 点击地图可换位置</small>
<label>类型<select v-model="draft.kind"><option>停留</option><option>服务</option></select></label>
<label>名称<input v-model="draft.name" required maxlength="120"></label>
<label>开始时间<input type="datetime-local" v-model="draft.start" required></label>
<label>时长（分钟）<input type="number" v-model.number="draft.minutes" min="1" max="1440" required></label>
<button :disabled="locked">保存</button> <button type="button" @click="draft=null">取消</button></form>
<p role="status">{{message}}</p><p v-if="!entries.length && !locked">尚无行程安排。</p>
<article v-for="e in chronological" :key="e.id"><small>{{e.start.replace('T',' ')}} · {{e.minutes}} 分钟</small><h2>{{e.name}}</h2><p>{{e.kind}} · {{e.lng.toFixed(5)}}, {{e.lat.toFixed(5)}}</p>
<button @click="edit(e)">编辑</button> <button @click="remove(e)">删除</button></article>
</aside></main></template>
<style scoped>
*{box-sizing:border-box}body{margin:0;color:#193e39;background:#f7f8f4;font:16px/1.5 system-ui,sans-serif}header{display:flex;align-items:center;gap:1rem;background:#163f39;color:white;padding:12px 24px}header b{font-size:24px}main{display:grid;grid-template-columns:1fr minmax(320px,30%);height:calc(100dvh - 60px)}.canvas{position:relative}.map-container{width:100%;height:100%}.notice{position:absolute;bottom:28px;background:white;padding:8px}aside{overflow:auto;padding:24px}h1{margin-top:0}h2{font-size:18px;overflow-wrap:anywhere}form,article{background:white;padding:16px;border:1px solid #cad7ce;border-radius:10px;margin-bottom:12px}label{display:grid;gap:3px;margin:10px 0}input,select,button{font:inherit;border:1px solid #a6bbb1;border-radius:5px;padding:6px}button{background:#21594e;color:white;cursor:pointer}@media(max-width:720px){main{display:block;height:auto}.canvas{height:48dvh}aside{padding:16px}}

</style>
