<template>
  <div class="admin-page">
    <header class="admin-header">
      <div>
        <p class="eyebrow">管理员视图</p>
        <h1>旅游日记统一管理</h1>
      </div>
      <div class="header-actions">
        <button type="button" class="ghost-btn" @click="goDiary">返回日记页</button>
        <button type="button" class="logout-btn" @click="logout">退出登录</button>
      </div>
    </header>

    <section class="stats-grid">
      <div class="stat-box">
        <span>日记总数</span>
        <strong>{{ stats.total || 0 }}</strong>
      </div>
      <div class="stat-box">
        <span>公开</span>
        <strong>{{ stats.public_count || 0 }}</strong>
      </div>
      <div class="stat-box">
        <span>私密</span>
        <strong>{{ stats.private_count || 0 }}</strong>
      </div>
      <div class="stat-box">
        <span>总浏览量</span>
        <strong>{{ stats.total_views || 0 }}</strong>
      </div>
      <div class="stat-box">
        <span>平均评分</span>
        <strong>{{ Number(stats.avg_rating || 0).toFixed(1) }}</strong>
      </div>
    </section>

    <section class="toolbar">
      <input v-model="filters.user" placeholder="按用户名筛选" @keyup.enter="fetchDiaries" />
      <input v-model="filters.title" placeholder="按标题筛选" @keyup.enter="fetchDiaries" />
      <select v-model="filters.publicStatus">
        <option value="all">全部状态</option>
        <option value="public">仅公开</option>
        <option value="private">仅私密</option>
      </select>
      <select v-model="filters.sort">
        <option value="new">最新发布</option>
        <option value="hot">热度最高</option>
        <option value="rating">评分最高</option>
        <option value="user">按用户排序</option>
      </select>
      <button type="button" class="primary-btn" @click="fetchDiaries">筛选</button>
      <button type="button" class="ghost-btn" @click="resetFilters">重置</button>
    </section>

    <div v-if="errorMsg" class="message error">{{ errorMsg }}</div>
    <div v-if="loading" class="message">正在加载日记...</div>

    <section v-else class="diary-table">
      <div class="table-head">
        <span>日记</span>
        <span>作者</span>
        <span>状态</span>
        <span>热度/评分</span>
        <span>发布时间</span>
        <span>操作</span>
      </div>
      <div v-if="diaries.length === 0" class="empty">暂无符合条件的日记</div>
      <article v-for="diary in diaries" :key="diary.id" class="table-row">
        <div class="diary-main">
          <h3>{{ diary.title }}</h3>
          <p>{{ diary.content }}</p>
          <div class="tag-row">
            <span v-if="diary.is_ai_generated">AI 生成</span>
            <span v-if="diary.scenic_spot">{{ diary.scenic_spot }}</span>
            <span v-if="diary.media && diary.media.length">媒体 {{ diary.media.length }}</span>
          </div>
        </div>
        <div>{{ diary.username }}</div>
        <div>
          <span class="status-pill" :class="{ public: diary.is_public }">
            {{ diary.is_public ? '公开' : '私密' }}
          </span>
        </div>
        <div class="metric">
          <span>浏览 {{ diary.view_count || 0 }}</span>
          <span>评分 {{ Number(diary.rating_avg || 0).toFixed(1) }} / {{ diary.rating_count || 0 }}人</span>
        </div>
        <div>{{ formatDate(diary.created_at) }}</div>
        <div class="action-group">
          <button type="button" class="ghost-btn view-btn" @click="openDiaryDetail(diary)">查看</button>
          <button type="button" class="danger-btn" @click="deleteDiary(diary)">删除</button>
        </div>
      </article>
    </section>

    <div v-if="showDetailModal && selectedDiary" class="modal-overlay" @click.self="closeDiaryDetail">
      <div class="detail-modal">
        <div class="detail-header">
          <div>
            <p class="eyebrow">管理员查看</p>
            <h2>{{ selectedDiary.title }}</h2>
          </div>
          <button type="button" class="ghost-btn" @click="closeDiaryDetail">关闭</button>
        </div>

        <div class="detail-meta">
          <span>作者：{{ selectedDiary.username }}</span>
          <span>{{ selectedDiary.is_public ? '公开日记' : '私密日记' }}</span>
          <span>发布时间：{{ formatDate(selectedDiary.created_at) }}</span>
          <span>浏览 {{ selectedDiary.view_count || 0 }}</span>
          <span>评分 {{ Number(selectedDiary.rating_avg || 0).toFixed(1) }} / {{ selectedDiary.rating_count || 0 }}人</span>
        </div>

        <div class="detail-tags">
          <span v-if="selectedDiary.is_ai_generated">AI 生成</span>
          <span v-if="selectedDiary.scenic_spot">{{ selectedDiary.scenic_spot }}</span>
          <span v-for="tag in selectedDiary.spot_tags || []" :key="tag">#{{ tag }}</span>
        </div>

        <div class="detail-layout" :class="{ 'with-media': selectedDiary.media && selectedDiary.media.length }">
          <div class="detail-content">
            <p>{{ selectedDiary.content || '暂无正文内容' }}</p>
          </div>

          <div v-if="selectedDiary.media && selectedDiary.media.length" class="detail-media">
            <div v-for="media in selectedDiary.media" :key="media.url" class="detail-media-item">
              <img
                v-if="media.media_type === 'image'"
                :src="media.url"
                :alt="media.original_name || '日记图片'"
                @click="openImageViewer(media.url, media.original_name || selectedDiary.title)"
              />
              <video v-else controls :src="media.url"></video>
              <div class="media-caption">{{ media.original_name || (media.media_type === 'image' ? '图片' : '视频') }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="imageViewer.visible" class="image-viewer-overlay" @click.self="closeImageViewer">
      <button type="button" class="image-viewer-close" @click="closeImageViewer">×</button>
      <img :src="imageViewer.url" :alt="imageViewer.alt" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { apiFetch as fetch } from '../apiFetch'
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

interface DiaryMedia {
  media_type: 'image' | 'video'
  url: string
  original_name?: string
}

interface AdminDiary {
  id: number
  username: string
  title: string
  content: string
  is_public: boolean
  is_ai_generated: boolean
  scenic_spot?: string
  spot_tags?: string[]
  view_count?: number
  rating_avg?: string | number
  rating_count?: number
  media?: DiaryMedia[]
  created_at: string
}

const router = useRouter()
const loading = ref(false)
const errorMsg = ref('')
const diaries = ref<AdminDiary[]>([])
const showDetailModal = ref(false)
const selectedDiary = ref<AdminDiary | null>(null)
const imageViewer = reactive({
  visible: false,
  url: '',
  alt: ''
})
const stats = reactive({
  total: 0,
  public_count: 0,
  private_count: 0,
  total_views: 0,
  avg_rating: 0
})
const filters = reactive({
  user: '',
  title: '',
  publicStatus: 'all',
  sort: 'new'
})

function getToken() {
  return localStorage.getItem('token') || ''
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

async function fetchDiaries() {
  const token = getToken()
  if (!token) {
    router.push('/login')
    return
  }

  loading.value = true
  errorMsg.value = ''
  try {
    const params = new URLSearchParams()
    if (filters.user.trim()) params.set('user', filters.user.trim())
    if (filters.title.trim()) params.set('title', filters.title.trim())
    params.set('publicStatus', filters.publicStatus)
    params.set('sort', filters.sort)

    const res = await fetch(`/api/admin/diaries?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await res.json()
    if (!data.success) {
      errorMsg.value = data.error || '管理员查询失败'
      if (res.status === 401 || res.status === 403) router.push('/login')
      return
    }

    diaries.value = data.data || []
    Object.assign(stats, data.stats || {})
  } catch {
    errorMsg.value = '网络请求失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

async function openDiaryDetail(diary: AdminDiary) {
  selectedDiary.value = { ...diary }
  showDetailModal.value = true

  const token = getToken()
  if (!token) return

  try {
    const res = await fetch(`/api/diaries/community/${diary.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await res.json()
    if (data.success && data.data) {
      selectedDiary.value = {
        ...selectedDiary.value,
        ...data.data
      }
    }
  } catch {
    // 管理员也可以直接使用列表中已有数据查看，无需中断弹窗。
  }
}

function closeDiaryDetail() {
  showDetailModal.value = false
  selectedDiary.value = null
}

function openImageViewer(url: string, alt: string) {
  imageViewer.visible = true
  imageViewer.url = url
  imageViewer.alt = alt
}

function closeImageViewer() {
  imageViewer.visible = false
  imageViewer.url = ''
  imageViewer.alt = ''
}

function resetFilters() {
  filters.user = ''
  filters.title = ''
  filters.publicStatus = 'all'
  filters.sort = 'new'
  fetchDiaries()
}

async function deleteDiary(diary: AdminDiary) {
  if (!confirm(`确定删除《${diary.title}》吗？此操作不可恢复。`)) return
  const token = getToken()
  try {
    const res = await fetch(`/api/admin/diaries/${diary.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await res.json()
    if (!data.success) {
      errorMsg.value = data.error || '删除失败'
      return
    }
    await fetchDiaries()
  } catch {
    errorMsg.value = '删除失败，请稍后重试'
  }
}

function goDiary() {
  router.push('/diary')
}

async function logout() {
  await fetch('/api/logout', {method:'POST'}).catch(() => {})
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  router.push('/login')
}

onMounted(fetchDiaries)
</script>

<style scoped>
.admin-page {
  min-height: 100vh;
  padding: 28px;
  background: #f7f3ea;
  color: #402817;
}

.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.eyebrow {
  margin: 0 0 4px;
  color: #8b5a2b;
  font-size: 13px;
  font-weight: 700;
}

h1 {
  margin: 0;
  font-size: 28px;
}

.header-actions,
.toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(120px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.stat-box {
  background: #fffdf6;
  border: 1px solid rgba(139, 90, 43, 0.18);
  border-radius: 8px;
  padding: 14px;
}

.stat-box span {
  display: block;
  color: #8b5a2b;
  font-size: 12px;
}

.stat-box strong {
  display: block;
  margin-top: 6px;
  font-size: 24px;
}

.toolbar {
  background: #fffdf6;
  border: 1px solid rgba(139, 90, 43, 0.18);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 14px;
}

input,
select {
  height: 38px;
  border: 1px solid rgba(139, 90, 43, 0.24);
  border-radius: 6px;
  padding: 0 10px;
  background: #fff;
  color: #402817;
}

button {
  height: 38px;
  border: none;
  border-radius: 6px;
  padding: 0 14px;
  cursor: pointer;
  font-weight: 700;
}

.primary-btn {
  background: #8b4513;
  color: #fff8dc;
}

.ghost-btn {
  background: #efe3cc;
  color: #6b4423;
}

.logout-btn,
.danger-btn {
  background: #b83f2f;
  color: #fff;
}

.view-btn {
  min-width: 72px;
}

.message {
  padding: 14px;
  border-radius: 8px;
  background: #fffdf6;
  border: 1px solid rgba(139, 90, 43, 0.18);
}

.message.error {
  border-color: #c65d45;
  color: #9b2f20;
}

.diary-table {
  background: #fffdf6;
  border: 1px solid rgba(139, 90, 43, 0.18);
  border-radius: 8px;
  overflow-x: auto;
  overflow-y: hidden;
}

.table-head,
.table-row {
  display: grid;
  grid-template-columns: minmax(280px, 1.5fr) 120px 90px 150px 170px 156px;
  gap: 12px;
  align-items: center;
  min-width: 1040px;
}

.table-head {
  padding: 12px 14px;
  background: #ead9ba;
  font-weight: 800;
  color: #5d3a1a;
}

.table-row {
  padding: 14px;
  border-top: 1px solid rgba(139, 90, 43, 0.12);
}

.action-group {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: flex-start;
  flex-wrap: nowrap;
}

.action-group button {
  min-width: 68px;
  padding: 0 12px;
  white-space: nowrap;
}

.diary-main h3 {
  margin: 0 0 6px;
  font-size: 16px;
}

.diary-main p {
  margin: 0;
  color: rgba(64, 40, 23, 0.72);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tag-row,
.metric {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
  font-size: 12px;
  color: #8b5a2b;
}

.status-pill {
  display: inline-flex;
  padding: 5px 9px;
  border-radius: 999px;
  background: #ede2cf;
  color: #76512f;
  font-size: 12px;
  font-weight: 700;
}

.status-pill.public {
  background: #dfefd8;
  color: #42782f;
}

.empty {
  padding: 40px;
  text-align: center;
  color: #8b5a2b;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(40, 24, 12, 0.45);
  backdrop-filter: blur(4px);
}

.detail-modal {
  width: min(1100px, 94vw);
  max-height: 90vh;
  overflow: auto;
  background: #fffdf6;
  border: 1px solid rgba(139, 90, 43, 0.2);
  border-radius: 14px;
  padding: 22px;
  box-shadow: 0 18px 50px rgba(64, 40, 23, 0.22);
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 14px;
}

.detail-header h2 {
  margin: 0;
  font-size: 26px;
}

.detail-meta,
.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.detail-meta span,
.detail-tags span,
.media-caption {
  font-size: 12px;
  color: #8b5a2b;
  background: #f3e7d2;
  border-radius: 999px;
  padding: 6px 10px;
}

.detail-layout {
  display: block;
}

.detail-layout.with-media {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 420px);
  gap: 18px;
  align-items: start;
}

.detail-content {
  background: #fff;
  border: 1px solid rgba(139, 90, 43, 0.14);
  border-radius: 10px;
  padding: 18px;
  line-height: 1.9;
  color: #402817;
  white-space: pre-wrap;
  min-height: 220px;
}

.detail-content p {
  margin: 0;
}

.detail-media {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-media-item {
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid rgba(139, 90, 43, 0.14);
  background: #fff;
}

.detail-media-item img,
.detail-media-item video {
  width: 100%;
  max-height: 320px;
  object-fit: contain;
  display: block;
  background: #f5efe4;
}

.detail-media-item img {
  cursor: zoom-in;
}

.media-caption {
  margin: 10px;
  display: inline-flex;
  border-radius: 8px;
}

.image-viewer-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: rgba(20, 14, 10, 0.82);
}

.image-viewer-overlay img {
  max-width: min(1100px, 94vw);
  max-height: 88vh;
  object-fit: contain;
  border-radius: 8px;
  background: rgba(255, 248, 220, 0.08);
}

.image-viewer-close {
  position: fixed;
  top: 18px;
  right: 22px;
  width: 38px;
  height: 38px;
  border: 1px solid rgba(255, 248, 220, 0.35);
  border-radius: 50%;
  background: rgba(93, 58, 26, 0.45);
  color: #fff8dc;
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
}

@media (max-width: 980px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .table-head {
    display: none;
  }

  .table-row {
    grid-template-columns: 1fr;
  }

  .detail-layout.with-media {
    grid-template-columns: 1fr;
  }
}
</style>
