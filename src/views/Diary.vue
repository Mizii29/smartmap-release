<template>
  <div class="diary-container">
    <header class="topbar">
      <button class="topbar-brand" type="button" @click="goShellTab('map')">
        <span class="brand-mark">🏮</span>
        <span class="brand-name">行摄天工</span>
        <small>SmartMap</small>
      </button>

      <nav class="topbar-nav" aria-label="主导航">
        <button class="tbn" type="button" @click="goShellTab('map')">🗺️ 地图</button>
        <button class="tbn" type="button" @click="goShellTab('trip')">🧭 行程</button>
        <button class="tbn" type="button" @click="goShellTab('discover')">✨ 发现</button>
        <button class="tbn active" type="button">📖 日记</button>
        <button class="tbn" type="button" @click="goShellTab('profile')">👤 我的</button>
      </nav>

      <div class="topbar-right">
        <button v-if="diaryWeatherData" class="tbr-btn diary-weather-btn" type="button" @click="openDiaryWeatherDetail">
          {{ diaryWeatherData.current.emoji }} {{ diaryWeatherData.current.temp }}°C {{ diaryWeatherCodeText(diaryWeatherData.current.code) }}
        </button>
        <button v-else class="tbr-btn diary-weather-btn" type="button" :disabled="diaryWeatherLoading" @click="openDiaryWeatherDetail">
          {{ diaryWeatherLoading ? '天气...' : '📍 天气' }}
        </button>
        <div class="tbr-user">
          <div class="tbr-avatar">{{ currentUsername.charAt(0) }}</div>
          <button class="tbr-logout" type="button" @click="logout">退出</button>
        </div>
      </div>
    </header>

    <div class="diary-page-head">
      <div>
        <h1 class="page-title">📖 旅途日记</h1>
        <p class="page-subtitle">记录旅途中的每一个美好瞬间</p>
      </div>
      <div class="header-actions">
        <button class="write-btn" @click="openCreateModal">+ 写日记</button>
        <button class="ai-btn" @click="openAIModal">
          <span class="ai-icon">✨</span> AI 智能生成
        </button>
      </div>
    </div>

    <div class="diary-content">
      <section class="my-diaries">
        <div class="section-header">
          <h2>我的日记</h2>
          <span class="count">{{ myDiaries.length }} 篇</span>
        </div>

        <div v-if="myDiaries.length === 0" class="empty-state">
          <p>暂无日记，点击上方按钮开始记录旅途点滴 ✨</p>
        </div>

        <div v-else class="diary-list">
          <div v-for="diary in myDiaries" :key="diary.id" class="diary-card my-card" @click="openDiaryDetail(diary)">
            <div class="card-header">
              <span class="date">{{ formatDate(diary.created_at) }}</span>
              <div class="card-stats">
                <span class="stat-item">🔥 {{ diary.view_count || 0 }}</span>
                <span class="stat-item">⭐ {{ parseFloat((diary.rating_avg as any) || 0).toFixed(1) }}</span>
              </div>
            </div>
            <h3 class="title">{{ diary.title }}</h3>
            <div class="card-tags">
              <span v-if="diary.is_ai_generated" class="ai-tag">✨ AI 生成</span>
              <span v-if="diary.animationStatus && (diary.animationStatus.status === 'queued' || diary.animationStatus.status === 'processing')" class="animation-pending-tag">🎬 视频生成中...</span>
              <span v-if="diary.animationStatus && diary.animationStatus.status === 'failed'" class="animation-failed-tag" :title="diary.animationStatus.error">⚠️ 视频生成失败</span>
              <span v-if="diary.style && diary.style !== '默认'" class="style-tag">🎨 {{ diary.style }}</span>
              <span v-if="diary.scenic_spot && diary.scenic_spot !== '默认'" class="spot-tag">📍 {{ diary.scenic_spot }}</span>
              <div v-if="diary.summary" class="summary-tag">
                📝 {{ diary.summary }}
              </div>
            </div>
            <div v-if="diary.media && diary.media.length" class="card-media-preview">
              <img v-if="diary.media[0].media_type === 'image'" :src="diary.media[0].url" alt="" />
              <div v-else class="video-cover">视频</div>
              <span>{{ diary.media.length }} 个媒体</span>
            </div>
            <p class="content">{{ diary.content.length > 80 ? diary.content.slice(0, 80) + '...' : diary.content }}</p>
          </div>
        </div>
      </section>

      <section class="community-diaries">
        <div class="section-header">
          <h2>驴友社区</h2>
          <div class="community-controls">
            <div class="dest-search">
              <input v-model="communityQuery.dest" type="text" placeholder="🗺️ 输入目的地..." @keyup.enter="fetchCommunityDiaries" />
              <button @click="fetchCommunityDiaries">筛选</button>
            </div>
            <div class="sort-group">
              <button :class="{ active: communityQuery.sortType === 'new' }" @click="setSort('new')">最新</button>
              <button :class="{ active: communityQuery.sortType === 'hot' }" @click="setSort('hot')">🔥 最热</button>
              <button :class="{ active: communityQuery.sortType === 'rating' }" @click="setSort('rating')">⭐ 高分</button>
              <button :class="{ active: communityQuery.sortType === 'interest' }" @click="setSort('interest')">🧭 推荐</button>
            </div>
          </div>
          <span class="count">{{ searchResults.length > 0 ? searchResults.length : communityDiaries.length }} 篇{{ searchResults.length > 0 ? '搜索结果' : '分享' }}</span>
        </div>

        <div class="search-bar">
          <input v-model="searchForm.keyword" type="text" placeholder="🔍 搜索日记内容..." class="search-input" @keyup.enter="searchDiaries" />
          <input v-model="searchForm.style" type="text" placeholder="风格标签" class="search-tag-input" />
          <input v-model="searchForm.scenicSpot" type="text" placeholder="景点标签" class="search-tag-input" />
          <button class="search-btn" @click="searchDiaries">搜索</button>
          <button v-if="searchResults.length > 0" class="clear-search-btn" @click="clearSearch">清除</button>
        </div>

        <div v-if="searchResults.length > 0" class="diary-list community-list">
          <div v-for="diary in searchResults" :key="diary.id" class="diary-card community-card search-result" @click="openDiaryDetail(diary)">
            <div class="user-info">
              <div class="avatar" :style="{ backgroundColor: getAvatarColor(diary.username) }">
                {{ diary.username?.charAt(0) || '?' }}
              </div>
              <div class="user-meta">
                <span class="author">{{ diary.username }}</span>
                <span class="post-time">{{ formatDate(diary.created_at) }}</span>
              </div>
              <span class="match-badge">{{ diary.matchType === 'tag+content' ? '标签+内容' : diary.matchType === 'tag' ? '标签匹配' : '内容匹配' }}</span>
            </div>
            <h3 class="title">{{ diary.title }}</h3>
            <div class="card-tags">
              <span v-if="diary.is_ai_generated" class="ai-tag">✨ AI 生成</span>
              <span v-if="diary.style && diary.style !== '默认'" class="style-tag">🎨 {{ diary.style }}</span>
              <span v-if="diary.scenic_spot && diary.scenic_spot !== '默认'" class="spot-tag">📍 {{ diary.scenic_spot }}</span>
            </div>
            <div v-if="diary.media && diary.media.length" class="card-media-preview">
              <img v-if="diary.media[0].media_type === 'image'" :src="diary.media[0].url" alt="" />
              <div v-else class="video-cover">视频</div>
              <span>{{ diary.media.length }} 个媒体</span>
            </div>
            <p class="content">{{ (diary.content || '').length > 120 ? diary.content.slice(0, 120) + '...' : diary.content }}</p>
          </div>
        </div>

        <div v-else-if="communityDiaries.length === 0" class="empty-state">
          <p>暂无公开日记，快来分享你的旅途故事吧 🌟</p>
        </div>

        <div v-else class="diary-list community-list">
          <div v-for="diary in communityDiaries" :key="diary.id" class="diary-card community-card" @click="openDiaryDetail(diary)">
            <div class="user-info">
              <div class="avatar" :style="{ backgroundColor: getAvatarColor(diary.username) }">
                {{ diary.username.charAt(0) }}
              </div>
              <div class="user-meta">
                <span class="author">{{ diary.username }}</span>
                <span class="post-time">{{ formatDate(diary.created_at) }}</span>
              </div>
              <div class="card-stats">
                <span class="stat-item">🔥 {{ diary.view_count || 0 }}</span>
                <span class="stat-item">⭐ {{ Number(diary.rating_avg || 0).toFixed(1) }}</span>
              </div>
            </div>
            <h3 class="title">{{ diary.title }}</h3>
            <div class="card-tags">
              <span v-if="diary.is_ai_generated" class="ai-tag">✨ AI 生成</span>
              <span v-if="diary.animationStatus && (diary.animationStatus.status === 'queued' || diary.animationStatus.status === 'processing')" class="animation-pending-tag">🎬 视频生成中...</span>
              <span v-if="diary.animationStatus && diary.animationStatus.status === 'failed'" class="animation-failed-tag" :title="diary.animationStatus.error">⚠️ 视频生成失败</span>
              <div v-if="diary.summary" class="summary-tag">
                📝 {{ diary.summary }}
              </div>
            </div>
            <div v-if="diary.media && diary.media.length" class="card-media-preview">
              <img v-if="diary.media[0].media_type === 'image'" :src="diary.media[0].url" alt="" />
              <div v-else class="video-cover">视频</div>
              <span>{{ diary.media.length }} 个媒体</span>
            </div>
            <p class="content">{{ (diary.content || '').length > 120 ? diary.content.slice(0, 120) + '...' : diary.content }}</p>
          </div>
        </div>
        <!-- 社区日记分页/加载更多 -->
      </section>
    </div>

    <!-- 写/编辑日记模态框 -->
    <div v-if="showWriteModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-card">
        <div class="modal-header">
          <h3>{{ editingId ? '✏️ 编辑日记' : '✍️ 写日记' }}</h3>
          <button class="close-btn" @click="closeModal">✕</button>
        </div>
        <form @submit.prevent="submitForm" class="write-form">
          <div class="form-group">
            <label for="title">标题</label>
            <input id="title" v-model="form.title" type="text" placeholder="给这篇日记起个标题..." maxlength="100" />
          </div>
          <div class="form-group">
            <label for="content">内容</label>
            <textarea id="content" v-model="form.content" placeholder="记录你的旅途故事..." rows="8"></textarea>
          </div>
          <div class="form-group tags-group">
            <div class="tag-input-row">
              <input v-model="form.style" type="text" placeholder="风格标签（如：文艺、探险、休闲...）" maxlength="50" class="tag-field" />
              <input v-model="form.scenicSpot" type="text" placeholder="景点标签（如：故宫、天安门...）" maxlength="100" class="tag-field" />
            </div>
            <span class="tag-hint">不填则默认为"默认"</span>
          </div>
          <div v-if="!editingId" class="form-group media-upload-group">
            <label for="diary-media">图片/视频</label>
            <input
              id="diary-media"
              type="file"
              accept="image/*,video/*"
              multiple
              class="media-input"
              @change="handleMediaChange"
            />
            <span class="tag-hint">最多 9 个文件，单张图片 10MB 内，单个视频 50MB 内</span>
            <div v-if="mediaPreviews.length" class="media-preview-list">
              <div v-for="(item, idx) in mediaPreviews" :key="item.url" class="media-preview-item">
                <img v-if="item.mediaType === 'image'" :src="item.url" alt="" @click="openImageViewer(item.url, '待上传图片')" />
                <video v-else :src="item.url" muted></video>
                <button type="button" class="media-remove-btn" @click="removeMediaPreview(idx)">×</button>
                <span>{{ item.mediaType === 'image' ? '图片' : '视频' }}</span>
              </div>
            </div>
          </div>
          <div v-if="!editingId" class="animation-option">
            <label class="animation-toggle">
              <input v-model="form.generateAnimationImage" type="checkbox" />
              <span>同时生成一段旅游动画小视频</span>
            </label>
            <p>勾选后，保存日记时会结合文字描述和上传图片生成旅游动画小视频。</p>
          </div>
          <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>
          <button type="submit" :disabled="submitting" class="submit-btn">
            {{ submitting ? (editingId ? '保存中...' : '发布中...') : (editingId ? '保存修改' : '保存日记') }}
          </button>
        </form>
      </div>
    </div>

    <!-- AI 生成日记模态框 -->
    <div v-if="showAIModal" class="modal-overlay" @click.self="closeAIModal">
      <div class="modal-card ai-modal">
        <div class="modal-header">
          <h3>✨ AI 智能生成日记</h3>
          <button class="close-btn" @click="closeAIModal">✕</button>
        </div>
        <div class="ai-form">
          <div class="form-group">
            <label>游览轨迹描述</label>
            <textarea 
              v-model="aiForm.trajectory" 
              placeholder="描述一下你的路线，例如：从天安门出发，经过故宫，最后到达景山公园..." 
              rows="3"
            ></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>日期</label>
              <input type="date" v-model="aiForm.date" />
            </div>
            <div class="form-group">
              <label>天气</label>
              <select v-model="aiForm.weather">
                <option value="晴">晴</option>
                <option value="多云">多云</option>
                <option value="阴">阴</option>
                <option value="雨">雨</option>
                <option value="雪">雪</option>
                <option value="大风">大风</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>风格标签 (逗号分隔)</label>
            <input 
              type="text" 
              v-model="aiForm.tagsInput" 
              @input="tagsTouched = true"
              placeholder="文艺, 幽默, 纪实, 感性..."
            />
          </div>
          <div class="form-group">
            <label>景点标签</label>
            <input 
              type="text" 
              v-model="aiForm.scenicSpotInput" 
              @input="scenicSpotTouched = true"
              placeholder="主要游览景点（如：故宫、天安门广场）"
              maxlength="100"
            />
          </div>
          <div class="form-group media-upload-group">
            <label for="ai-diary-images">上传图片</label>
            <input
              id="ai-diary-images"
              type="file"
              accept="image/*"
              multiple
              class="media-input"
              @change="handleAIMediaChange"
            />
            <span class="tag-hint">最多 10 张图片，生成日记时会一起保存，生成动画小视频时会作为参考素材</span>
            <div v-if="aiMediaPreviews.length" class="media-preview-list">
              <div v-for="(item, idx) in aiMediaPreviews" :key="item.url" class="media-preview-item">
                <img :src="item.url" alt="" @click="openImageViewer(item.url, 'AI 日记图片')" />
                <button type="button" class="media-remove-btn" @click="removeAIMediaPreview(idx)">×</button>
                <span>图片</span>
              </div>
            </div>
          </div>
          <div class="animation-option">
            <label class="animation-toggle">
              <input v-model="aiForm.generateAnimationImage" type="checkbox" />
              <span>同时生成一段旅游动画小视频</span>
            </label>
            <p>勾选后，点击下方“立即生成并保存”会额外生成一段旅游动画小视频，并和日记一起保存。</p>
          </div>
          <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>
          <div class="ai-notice">
            <p>💡 AI 将根据您的描述，自动为您撰写一篇 300-400 字的精美日记。</p>
          </div>
          <button 
            @click="generateAIDiary" 
            :disabled="generating || (!aiForm.trajectory.trim() && !aiForm.photos.length && !aiMediaPreviews.length)"
            class="submit-btn ai-submit-btn"
          >
            <span v-if="generating" class="loading-spinner"></span>
            {{ generating ? 'AI 正在创作中...' : '立即生成并保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 日记详情模态框 -->
    <div v-if="showDetailModal && selectedDiary" class="modal-overlay" @click.self="showDetailModal = false">
      <div class="modal-card detail-modal">
        <div class="modal-header">
          <div class="user-info">
            <div class="avatar" :style="{ backgroundColor: getAvatarColor(selectedDiary.username) }">
              {{ selectedDiary.username.charAt(0) }}
            </div>
            <div class="user-meta">
              <span class="author">{{ selectedDiary.username }}</span>
              <span class="post-time">{{ formatDate(selectedDiary.created_at) }}</span>
            </div>
          </div>
          <div class="detail-header-actions">
            <div v-if="selectedDiary.user_id === currentUserId" class="detail-actions">
              <button
                class="public-btn"
                :class="{ active: selectedDiary.is_public }"
                @click.stop="togglePublicInModal"
                :title="selectedDiary.is_public ? '取消公开' : '公开到社区'"
              >
                {{ selectedDiary.is_public ? '🌐 公开' : '🔒 私密' }}
              </button>
              <button class="edit-btn" @click.stop="editInModal" title="编辑">编辑</button>
              <button class="delete-btn" @click.stop="deleteInModal" title="删除">删除</button>
            </div>
            <button class="close-btn" @click="showDetailModal = false">关闭</button>
          </div>
        </div>
        <div class="detail-body">
          <h2 class="title">{{ selectedDiary.title }}</h2>
          <div class="card-tags">
            <span v-if="selectedDiary.is_ai_generated" class="ai-tag">✨ AI 生成</span>
            <span v-if="selectedDiary.scenic_spot" class="spot-tag">📍 {{ selectedDiary.scenic_spot }}</span>
            <div v-if="selectedDiary.spot_tags && selectedDiary.spot_tags.length" class="spot-tags-list">
              <span v-for="tag in selectedDiary.spot_tags" :key="tag" class="tag-item">#{{ tag }}</span>
            </div>
          </div>
          <div class="detail-main-layout" :class="{ 'with-media': (selectedDiary.media && selectedDiary.media.length) || selectedDiary.animationStatus }">
            <div class="detail-text-column">
              <div class="content-wrapper">
                <p class="content-text">{{ selectedDiary.content }}</p>
              </div>
            </div>
            <div v-if="(selectedDiary.media && selectedDiary.media.length) || selectedDiary.animationStatus" class="detail-media-column">
              <div class="detail-media-grid">
                <!-- 现有的媒体文件 -->
                <div v-for="media in selectedDiary.media" :key="media.url" class="detail-media-item">
                  <img
                    v-if="media.media_type === 'image'"
                    :src="media.url"
                    :alt="media.original_name || '日记图片'"
                    @click="openImageViewer(media.url, media.original_name || selectedDiary.title || '日记图片')"
                  />
                  <video v-else controls :src="media.url"></video>
                </div>

                <!-- 动画生成状态占位符 -->
                <div v-if="selectedDiary.animationStatus && selectedDiary.animationStatus.status !== 'success'" class="detail-media-item animation-status-card">
                  <div v-if="selectedDiary.animationStatus.status === 'queued' || selectedDiary.animationStatus.status === 'processing'" class="animation-loading">
                    <div class="spinner"></div>
                    <span>🎬 旅游动画生成中...</span>
                    <p class="hint">通常 1-2 分钟，若排队较多会更久</p>
                  </div>
                  <div v-else-if="selectedDiary.animationStatus.status === 'failed'" class="animation-error">
                    <span class="error-icon">⚠️</span>
                    <span class="error-text">动画生成失败</span>
                    <p class="error-detail">{{ selectedDiary.animationStatus.error || '未知原因' }}</p>
                    <button class="retry-animation-btn" :disabled="animationRetrying" @click="retryAnimation">
                      {{ animationRetrying ? '重新提交中...' : '重新生成视频' }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="detail-footer">
            <div class="detail-stats">
              <span>🔥 浏览量 {{ selectedDiary.view_count || 0 }}</span>
              <span>⭐ 平均分 {{ parseFloat(selectedDiary.rating_avg || 0).toFixed(1) }} ({{ selectedDiary.rating_count || 0 }}人评)</span>
            </div>
            <div class="diary-social-actions">
              <button
                class="diary-social-btn"
                :class="{ active: isDiaryLiked(selectedDiary.id) }"
                type="button"
                @click="toggleDiaryLike(selectedDiary)"
              >
                {{ isDiaryLiked(selectedDiary.id) ? '♥ 已点赞' : '♡ 点赞' }} {{ selectedDiary.like_count || 0 }}
              </button>
              <button
                class="diary-social-btn"
                :class="{ active: isDiaryFavorited(selectedDiary.id) }"
                type="button"
                @click="toggleDiaryFavorite(selectedDiary)"
              >
                {{ isDiaryFavorited(selectedDiary.id) ? '★ 已收藏' : '☆ 收藏' }} {{ selectedDiary.favorite_count || 0 }}
              </button>
            </div>
            <div v-if="selectedDiary.user_id !== currentUserId" class="rating-section">
              <span class="rating-label">打个分吧：</span>
              <div class="stars">
                <span 
                  v-for="star in 5" 
                  :key="star" 
                  class="star" 
                  :class="{ active: star <= activeRatingValue }"
                  @mouseenter="hoverRating = star"
                  @mouseleave="hoverRating = 0"
                  @click="submitRate(star)"
                >★</span>
              </div>
              <span v-if="ratingLoading" class="rating-loading">...</span>
            </div>
          </div>

          <section class="diary-comment-section">
            <div class="diary-comment-head">
              <h3>💬 评论互动</h3>
              <span>{{ getDiaryComments(selectedDiary.id).length }} 条</span>
            </div>
            <div class="diary-comment-list">
              <template v-for="comment in getParentComments(selectedDiary.id)" :key="comment.id">
                <article class="diary-comment-item">
                  <div class="comment-row">
                    <div class="diary-comment-avatar">{{ comment.user.charAt(0) }}</div>
                    <div class="diary-comment-main">
                      <div class="diary-comment-line">
                        <strong>{{ comment.user }}</strong>
                        <small>{{ comment.time }}</small>
                        <button
                          class="comment-reply-btn"
                          @click="starterReply(comment)"
                        >回复</button>
                      </div>
                      <p>{{ comment.text }}</p>
                    </div>
                  </div>
                  <!-- 回复输入框 -->
                  <div v-if="replyToId === comment.id" class="comment-reply-area">
                    <div class="reply-label">回复 {{ comment.user }}</div>
                    <div class="comment-reply-compose">
                      <input
                        v-model="replyDraftText"
                        placeholder="输入回复..."
                        maxlength="500"
                        @keyup.enter="submitCommentReply()"
                      />
                      <button class="reply-send-btn" @click="submitCommentReply()">发送</button>
                      <button class="reply-cancel-btn" @click="cancelReply()">取消</button>
                    </div>
                  </div>
                  <!-- 回复列表 -->
                  <div v-if="getChildComments(selectedDiary.id, comment.id).length > 0" class="reply-children">
                    <div v-for="reply in getChildComments(selectedDiary.id, comment.id)" :key="reply.id" class="reply-child-item">
                      <div class="comment-row">
                        <div class="diary-comment-avatar small">{{ reply.user.charAt(0) }}</div>
                        <div class="diary-comment-main">
                          <div class="diary-comment-line">
                            <strong>{{ reply.user }}</strong>
                            <small>{{ reply.time }}</small>
                            <button class="comment-reply-btn" @click="starterReply(reply)">回复</button>
                          </div>
                          <div v-if="reply.replyTo" class="reply-to-label">回复 {{ reply.replyTo }}</div>
                          <p>{{ reply.text }}</p>
                        </div>
                      </div>
                      <!-- 回复子评论的输入框 -->
                      <div v-if="replyToId === reply.id" class="comment-reply-area child">
                        <div class="reply-label">回复 {{ reply.user }}</div>
                        <div class="comment-reply-compose">
                          <input v-model="replyDraftText" placeholder="输入回复..." maxlength="500" @keyup.enter="submitCommentReply()" />
                          <button class="reply-send-btn" @click="submitCommentReply()">发送</button>
                          <button class="reply-cancel-btn" @click="cancelReply()">取消</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              </template>
              <div v-if="getParentComments(selectedDiary.id).length === 0" class="diary-comment-empty">还没有评论，来写第一条吧。</div>
            </div>
            <div class="diary-comment-compose">
              <textarea v-model="commentDraft" rows="3" placeholder="写下你对这篇日记的看法..."></textarea>
              <button type="button" :disabled="!commentDraft.trim()" @click="submitDiaryComment">发表评论</button>
            </div>
          </section>
        </div>
      </div>
    </div>

    <Transition name="diary-weather-slide">
      <div v-if="showDiaryWeatherDetail && diaryWeatherData" class="diary-weather-popup" @click="showDiaryWeatherDetail = false">
        <button class="diary-weather-close" type="button" @click.stop="showDiaryWeatherDetail = false">✕</button>
        <div class="diary-weather-head">
          <span class="diary-weather-emoji">{{ diaryWeatherData.current.emoji }}</span>
          <span class="diary-weather-temp">{{ diaryWeatherData.current.temp }}°C</span>
          <span class="diary-weather-desc">{{ diaryWeatherCodeText(diaryWeatherData.current.code) }}</span>
        </div>
        <div class="diary-weather-body">
          <div class="diary-weather-row">
            <span>📍</span>
            <span>北京市中心 · 日记页天气参考</span>
          </div>
          <div v-if="diaryWeatherData.current.precipitation && diaryWeatherData.current.precipitation > 0" class="diary-weather-row">
            <span>🌧️</span>
            <span>降水 {{ diaryWeatherData.current.precipitation }} mm</span>
          </div>
          <div class="diary-weather-alert" v-if="diaryWeatherData.rainAlert">
            ⚠️ 未来数小时可能有降雨，写游记或出行时记得带伞。
          </div>
          <div class="diary-weather-alert diary-weather-safe" v-else>
            ✅ 未来一天内无雨，适合安排拍照和户外记录。
          </div>
          <div v-if="diaryWeatherData.hourly?.length" class="diary-weather-forecast-title">未来 12 小时</div>
          <div v-if="diaryWeatherData.hourly?.length" class="diary-weather-hourly">
            <div v-for="h in diaryWeatherData.hourly" :key="h.time" class="diary-weather-hourly-item">
              <span>{{ diaryFormatHour(h.time) }}</span>
              <span>{{ h.emoji }}</span>
              <span>{{ h.temp }}°</span>
              <span v-if="h.precipProb > 10">{{ h.precipProb }}%</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <div v-if="imageViewer.visible" class="image-viewer-overlay" @click.self="closeImageViewer">
      <button class="image-viewer-close" @click="closeImageViewer">×</button>
      <img :src="imageViewer.url" :alt="imageViewer.alt" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, reactive, watch, computed } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()


interface DiaryMedia {
  id?: number
  diary_id?: number
  media_type: 'image' | 'video'
  url: string
  original_name?: string
  mime_type?: string
  file_size?: number
}

interface LocalMediaPreview {
  file: File
  url: string
  mediaType: 'image' | 'video'
}

interface MyDiary {
  id: number
  title: string
  content: string
  summary: string
  is_public: boolean
  is_ai_generated: boolean
  style?: string
  scenic_spot?: string
  view_count?: number
  rating_avg?: number
  rating_count?: number
  media?: DiaryMedia[]
  animationStatus?: {
    status: 'queued' | 'processing' | 'success' | 'failed'
    error?: string
  }
  created_at: string
}

interface CommunityDiary {
  id: number
  username: string
  title: string
  content: string
  summary: string
  is_ai_generated: boolean
  style?: string
  scenic_spot?: string
  view_count?: number
  rating_avg?: string | number
  media?: DiaryMedia[]
  animationStatus?: {
    status: 'queued' | 'processing' | 'success' | 'failed'
    error?: string
  }
  created_at: string
  matchType?: string
  matchScore?: number
}

interface DiaryWeatherData {
  current: { temp: number; code: number; emoji: string; precipitation?: number }
  rainAlert?: boolean
  hourly?: Array<{ time: string; temp: number; code: number; emoji: string; precipProb: number }>
}

interface DiaryComment {
  id: string | number
  user: string
  text: string
  time: string
  parentId?: number | null
  replyTo?: string
}

const myDiaries = ref<MyDiary[]>([])
const communityDiaries = ref<CommunityDiary[]>([])
const communityQuery = reactive({ dest: '', sortType: 'new' })

const showWriteModal = ref(false)
const showAIModal = ref(false)
const showDetailModal = ref(false)
const selectedDiary = ref<any>(null)
const replyToId = ref<number | null>(JSON.parse(localStorage.getItem('diary_reply_to') || 'null'))
const replyDraftText = ref(localStorage.getItem('diary_reply_draft') || '')
const replyToName = ref('')
// 自动存草稿到 localStorage
watch(replyToId, v => { if (v !== null) localStorage.setItem('diary_reply_to', JSON.stringify(v)); else localStorage.removeItem('diary_reply_to') })
watch(replyDraftText, v => { if (v) localStorage.setItem('diary_reply_draft', v); else localStorage.removeItem('diary_reply_draft') })
const currentUserId = ref<number | null>(null)
const currentUsername = ref('旅者')
const diaryWeatherData = ref<DiaryWeatherData | null>(null)
const diaryWeatherLoading = ref(false)
const showDiaryWeatherDetail = ref(false)
const ratingLoading = ref(false)
const hoverRating = ref(0)
const diaryLikeMap = ref<Record<string, boolean>>(JSON.parse(localStorage.getItem('diary_like_map') || '{}'))
const diaryFavoriteMap = ref<Record<string, boolean>>(JSON.parse(localStorage.getItem('diary_favorite_map') || '{}'))
const diaryCommentMap = ref<Record<string, DiaryComment[]>>(JSON.parse(localStorage.getItem('diary_comment_map') || '{}'))
const commentDraft = ref('')
const editingId = ref<number | null>(null)
const submitting = ref(false)
const generating = ref(false)
const errorMsg = ref('')
const form = reactive({ title: '', content: '', style: '', scenicSpot: '', generateAnimationImage: false })
const mediaPreviews = ref<LocalMediaPreview[]>([])
const aiMediaPreviews = ref<LocalMediaPreview[]>([])
const imageViewer = reactive({ visible: false, url: '', alt: '' })
const MAX_MEDIA_FILES = 9
const MAX_AI_IMAGE_FILES = 10
const IMAGE_MAX_BYTES = 10 * 1024 * 1024
const VIDEO_MAX_BYTES = 50 * 1024 * 1024

const aiForm = reactive({
  trajectory: '',
  date: new Date().toISOString().split('T')[0],
  weather: '晴',
  tagsInput: '',
  scenicSpotInput: '',
  photos: [] as string[],
  generateAnimationImage: false
})

const searchResults = ref<CommunityDiary[]>([])
const searchForm = reactive({ keyword: '', style: '', scenicSpot: '' })
const activeRatingValue = computed(() => hoverRating.value || Number(selectedDiary.value?.my_rating || 0))
let animationPollTimer: number | null = null
const animationRetrying = ref(false)
let diaryWeatherAutoCloseTimer: number | null = null

watch(showDiaryWeatherDetail, (visible) => {
  if (diaryWeatherAutoCloseTimer) {
    window.clearTimeout(diaryWeatherAutoCloseTimer)
    diaryWeatherAutoCloseTimer = null
  }
  if (visible) {
    diaryWeatherAutoCloseTimer = window.setTimeout(() => {
      showDiaryWeatherDetail.value = false
    }, 8000)
  }
})

// 日记详情弹窗 → 锁定背景滚动，只允许弹窗内容滑动
watch(showDetailModal, (open) => {
  if (open) {
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = ''
  }
})

// 标签手动修改标记
const scenicSpotTouched = ref(false)
const tagsTouched = ref(false)

function getToken() {
  return localStorage.getItem('token')
}

function diaryWeatherCodeText(code: number): string {
  if (code === 0) return '晴天'
  if (code === 1) return '少云'
  if (code === 2) return '多云'
  if (code === 3) return '阴天'
  if (code === 45 || code === 48) return '雾'
  if (code >= 51 && code <= 67) return '雨'
  if (code >= 71 && code <= 77) return '雪'
  if (code >= 80 && code <= 82) return '阵雨'
  if (code >= 85 && code <= 86) return '阵雪'
  if (code >= 95) return '雷暴'
  return '天气'
}

function diaryFormatHour(time: string): string {
  const d = new Date(time)
  if (Number.isNaN(d.getTime())) return time
  return `${String(d.getHours()).padStart(2, '0')}:00`
}

async function fetchDiaryWeather(): Promise<boolean> {
  if (diaryWeatherLoading.value) return !!diaryWeatherData.value
  diaryWeatherLoading.value = true
  try {
    const res = await fetch('/api/weather?lat=39.90923&lng=116.397428')
    const json = await res.json()
    if (json.success && json.data?.current) {
      diaryWeatherData.value = json.data
      return true
    }
  } catch (err) {
    console.warn('[diary weather] fetch failed:', err)
  } finally {
    diaryWeatherLoading.value = false
  }
  return false
}

async function openDiaryWeatherDetail() {
  if (!diaryWeatherData.value) {
    await fetchDiaryWeather()
  }
  if (diaryWeatherData.value) {
    showDiaryWeatherDetail.value = true
  }
}

function getAvatarColor(name: string): string {
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function getLocalMediaType(file: File): 'image' | 'video' | null {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  return null
}

function clearMediaPreviews() {
  mediaPreviews.value.forEach(item => URL.revokeObjectURL(item.url))
  mediaPreviews.value = []
}

function clearAIMediaPreviews() {
  aiMediaPreviews.value.forEach(item => URL.revokeObjectURL(item.url))
  aiMediaPreviews.value = []
}

function removeMediaPreview(index: number) {
  const item = mediaPreviews.value[index]
  if (item) URL.revokeObjectURL(item.url)
  mediaPreviews.value.splice(index, 1)
}

function removeAIMediaPreview(index: number) {
  const item = aiMediaPreviews.value[index]
  if (item) URL.revokeObjectURL(item.url)
  aiMediaPreviews.value.splice(index, 1)
}

function openImageViewer(url: string, alt = '图片预览') {
  imageViewer.url = url
  imageViewer.alt = alt
  imageViewer.visible = true
}

function closeImageViewer() {
  imageViewer.visible = false
  imageViewer.url = ''
  imageViewer.alt = ''
}

function handleMediaChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  errorMsg.value = ''

  for (const file of files) {
    if (mediaPreviews.value.length >= MAX_MEDIA_FILES) {
      errorMsg.value = `最多上传 ${MAX_MEDIA_FILES} 个图片或视频`
      break
    }

    const mediaType = getLocalMediaType(file)
    if (!mediaType) {
      errorMsg.value = '只支持图片或视频文件'
      continue
    }
    if (mediaType === 'image' && file.size > IMAGE_MAX_BYTES) {
      errorMsg.value = '单张图片不能超过 10MB'
      continue
    }
    if (mediaType === 'video' && file.size > VIDEO_MAX_BYTES) {
      errorMsg.value = '单个视频不能超过 50MB'
      continue
    }

    mediaPreviews.value.push({
      file,
      url: URL.createObjectURL(file),
      mediaType
    })
  }

  input.value = ''
}

function handleAIMediaChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  errorMsg.value = ''

  for (const file of files) {
    if (aiMediaPreviews.value.length >= MAX_AI_IMAGE_FILES) {
      errorMsg.value = `最多上传 ${MAX_AI_IMAGE_FILES} 张图片`
      break
    }

    const mediaType = getLocalMediaType(file)
    if (mediaType !== 'image') {
      errorMsg.value = 'AI 生成日记目前只支持上传图片'
      continue
    }
    if (file.size > IMAGE_MAX_BYTES) {
      errorMsg.value = '单张图片不能超过 10MB'
      continue
    }

    aiMediaPreviews.value.push({
      file,
      url: URL.createObjectURL(file),
      mediaType
    })
  }

  input.value = ''
}

async function fetchMyDiaries() {
  const token = getToken()
  if (!token) return

  try {
    const res = await fetch('/api/diaries/my', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (res.status === 401) { localStorage.removeItem('token'); return }
    const data = await res.json()
    if (data.success) {
      myDiaries.value = data.data || []

      restartAnimationPolling()
    }
  } catch { console.error('获取我的日记失败') }
}

async function fetchCommunityDiaries() {
  try {
    const params = new URLSearchParams()
    if (communityQuery.dest.trim()) {
      params.set('dest', communityQuery.dest.trim())
      searchResults.value = [] // 使用目的地筛选时清除全局搜索结果
    }
    if (communityQuery.sortType) params.set('sortType', communityQuery.sortType)
    
    const token = getToken()
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch(`/api/diaries/community?${params}`, { headers })
    const data = await res.json()
    if (data.success) communityDiaries.value = data.data || []
  } catch { console.error('获取社区日记失败') }
}

function hasPendingAnimation(diaries: Array<MyDiary | CommunityDiary>) {
  return diaries.some(d => d.animationStatus && (d.animationStatus.status === 'queued' || d.animationStatus.status === 'processing'))
}

function syncSelectedDiaryFromMyList() {
  if (!selectedDiary.value?.id) return
  const latest = myDiaries.value.find(d => d.id === selectedDiary.value.id)
  if (!latest) return
  selectedDiary.value = {
    ...selectedDiary.value,
    animationStatus: latest.animationStatus || null,
    media: latest.media || selectedDiary.value.media
  }
}

function restartAnimationPolling() {
  if (animationPollTimer) {
    window.clearInterval(animationPollTimer)
    animationPollTimer = null
  }
  if (!hasPendingAnimation(myDiaries.value)) return
  animationPollTimer = window.setInterval(async () => {
    await fetchMyDiaries()
    syncSelectedDiaryFromMyList()
    if (!hasPendingAnimation(myDiaries.value) && animationPollTimer) {
      window.clearInterval(animationPollTimer)
      animationPollTimer = null
    }
  }, 8000)
}

async function retryAnimation() {
  if (!selectedDiary.value?.id || animationRetrying.value) return
  const token = getToken()
  if (!token) {
    router.push('/login')
    return
  }

  animationRetrying.value = true
  try {
    const res = await fetch(`/api/diaries/${selectedDiary.value.id}/animation/retry`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    const data = await res.json()
    if (!data.success) {
      errorMsg.value = data.error || '重新生成失败'
      return
    }
    errorMsg.value = ''
    await Promise.all([fetchMyDiaries(), openDiaryDetail(selectedDiary.value)])
  } catch {
    errorMsg.value = '重新生成失败，请稍后重试'
  } finally {
    animationRetrying.value = false
  }
}

async function openDiaryDetail(diary: any) {
  try {
    const token = getToken()
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch(`/api/diaries/community/${diary.id}`, { headers })
    const data = await res.json()
    if (data.success) {
      selectedDiary.value = data.data
      syncDiarySocialFromDetail(selectedDiary.value)
      recordDiaryBrowse(selectedDiary.value)

      syncSelectedDiaryFromMyList()
      hoverRating.value = 0
      commentDraft.value = ''
      showDetailModal.value = true
      // 刷新列表中的浏览量
      fetchCommunityDiaries()
      fetchMyDiaries()
    }
  } catch { console.error('获取日记详情失败') }
}

function recordDiaryBrowse(diary: any) {
  if (!diary?.id) return
  const history = JSON.parse(localStorage.getItem('profile_browse_history') || '[]')
  const row = {
    id: `diary-${diary.id}`,
    type: 'diary',
    name: diary.title || `日记 #${diary.id}`,
    icon: '📖',
    meta: diary.scenic_spot || diary.style || '日记浏览'
  }
  localStorage.setItem('profile_browse_history', JSON.stringify([row, ...history.filter((item: any) => item.id !== row.id)].slice(0, 30)))
}

function normalizeDiaryComment(comment: any): DiaryComment {
  return {
    id: comment.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    user: comment.username || comment.user || '旅者',
    text: comment.comment || comment.text || '',
    time: comment.time || (comment.created_at ? formatDate(comment.created_at) : '刚刚'),
    parentId: comment.parent_id || null,
    replyTo: comment.reply_to || ''
  }
}

function syncDiarySocialFromDetail(diary: any) {
  if (!diary?.id) return
  const key = String(diary.id)
  diaryLikeMap.value = { ...diaryLikeMap.value, [key]: !!diary.my_like }
  diaryFavoriteMap.value = { ...diaryFavoriteMap.value, [key]: !!diary.my_favorite }
  const serverComments = Array.isArray(diary.comments) ? diary.comments.map(normalizeDiaryComment) : []
  const localComments = diaryCommentMap.value[key] || []
  // 按 id 合并：服务端数据为基底，local 中有额外字段（parentId, replyTo）的保留
  const localById = new Map(localComments.map(c => [c.id, c]))
  const comments = serverComments.map(c => {
    const local = localById.get(c.id)
    return local ? { ...c, ...local } : c
  })
  // 补充 replyTo 字段
  comments.forEach(c => {
    if (c.parentId && !c.replyTo) {
      const parent = comments.find(p => p.id === c.parentId)
      if (parent) c.replyTo = parent.user
    }
  })
  diaryCommentMap.value = {
    ...diaryCommentMap.value,
    [key]: comments
  }
  persistDiarySocialState()
}

function persistDiarySocialState() {
  localStorage.setItem('diary_like_map', JSON.stringify(diaryLikeMap.value))
  localStorage.setItem('diary_favorite_map', JSON.stringify(diaryFavoriteMap.value))
  localStorage.setItem('diary_comment_map', JSON.stringify(diaryCommentMap.value))
}

function isDiaryLiked(id: number | string) {
  return !!diaryLikeMap.value[String(id)]
}

function isDiaryFavorited(id: number | string) {
  return !!diaryFavoriteMap.value[String(id)]
}

async function toggleDiaryReaction(diary: any, reactionType: 'like' | 'favorite') {
  if (!diary?.id) return
  const token = getToken()
  if (!token) { router.push('/login'); return }

  const key = String(diary.id)
  const mapRef = reactionType === 'like' ? diaryLikeMap : diaryFavoriteMap
  const flagName = reactionType === 'like' ? 'my_like' : 'my_favorite'
  const countName = reactionType === 'like' ? 'like_count' : 'favorite_count'
  const previousActive = !!mapRef.value[key]
  const nextActive = !previousActive

  mapRef.value = { ...mapRef.value, [key]: nextActive }
  diary[flagName] = nextActive
  diary[countName] = Math.max(0, Number(diary[countName] || 0) + (nextActive ? 1 : -1))
  persistDiarySocialState()

  try {
    const res = await fetch(`/api/diaries/${diary.id}/reaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ reaction_type: reactionType })
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || '互动失败')
    mapRef.value = { ...mapRef.value, [key]: !!data.active }
    diary[flagName] = !!data.active
    diary.like_count = data.like_count ?? diary.like_count
    diary.favorite_count = data.favorite_count ?? diary.favorite_count
    persistDiarySocialState()
  } catch (error) {
    console.error('日记互动失败', error)
    mapRef.value = { ...mapRef.value, [key]: previousActive }
    diary[flagName] = previousActive
    diary[countName] = Math.max(0, Number(diary[countName] || 0) + (previousActive ? 1 : -1))
    persistDiarySocialState()
  }
}

function toggleDiaryLike(diary: any) {
  return toggleDiaryReaction(diary, 'like')
}

function toggleDiaryFavorite(diary: any) {
  return toggleDiaryReaction(diary, 'favorite')
}

function getDiaryComments(id: number | string) {
  return diaryCommentMap.value[String(id)] || []
}
function getParentComments(id: number | string) {
  return getDiaryComments(id).filter(c => !c.parentId)
}
function getChildComments(id: number | string, parentId: number | string) {
  // 递归展平：获取所有子孙评论（不限层级）并排显示
  const result: any[] = []
  const direct = getDiaryComments(id).filter(c => c.parentId == parentId)
  for (const child of direct) {
    result.push(child)
    const grandkids = getChildComments(id, child.id)
    result.push(...grandkids)
  }
  return result
}

async function submitDiaryComment() {
  if (!selectedDiary.value || !commentDraft.value.trim()) return
  const token = getToken()
  if (!token) { router.push('/login'); return }

  const key = String(selectedDiary.value.id)
  const text = commentDraft.value.trim()

  try {
    const res = await fetch(`/api/diaries/${selectedDiary.value.id}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ comment: text })
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || '评论失败')
    const comment = normalizeDiaryComment(data.comment)
    diaryCommentMap.value = {
      ...diaryCommentMap.value,
      [key]: [comment, ...(diaryCommentMap.value[key] || [])]
    }
    selectedDiary.value.comments = diaryCommentMap.value[key]
    commentDraft.value = ''
    persistDiarySocialState()
  } catch (error) {
    console.error('评论失败', error)
  }
}

function cancelReply() {
  replyToId.value = null
  replyDraftText.value = ''
  replyToName.value = ''
}
function starterReply(target: any) {
  replyToName.value = target.user || ''
  replyToId.value = target.id
  replyDraftText.value = ''
}

async function submitCommentReply() {
  if (!selectedDiary.value || !replyDraftText.value.trim() || replyToId.value === null) return
  const token = getToken()
  if (!token) { router.push('/login'); return }
  const key = String(selectedDiary.value.id)
  const text = replyDraftText.value.trim()
  try {
    const res = await fetch(`/api/diaries/${selectedDiary.value.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ comment: text, parent_id: replyToId.value, reply_to: replyToName.value })
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || '回复失败')
    const comment = normalizeDiaryComment(data.comment)
    comment.replyTo = replyToName.value || ''
    diaryCommentMap.value = {
      ...diaryCommentMap.value,
      [key]: [comment, ...(diaryCommentMap.value[key] || [])]
    }
    selectedDiary.value.comments = diaryCommentMap.value[key]
    replyDraftText.value = ''
    persistDiarySocialState()
  } catch (error) {
    console.error('回复失败', error)
  }
}

function handleEditInModal() {
  if (!selectedDiary.value) return
  const diary = selectedDiary.value
  showDetailModal.value = false
  openEditModal(diary)
}

async function togglePublicInModal() {
  if (!selectedDiary.value) return
  await togglePublic(selectedDiary.value)
}

function editInModal() {
  handleEditInModal()
}

async function deleteInModal() {
  if (!selectedDiary.value) return
  const id = selectedDiary.value.id
  showDetailModal.value = false
  await deleteDiary(id)
}

async function submitRate(rating: number) {
  if (!selectedDiary.value) return
  const token = getToken()
  if (!token) { router.push('/login'); return }

  selectedDiary.value.my_rating = rating
  hoverRating.value = 0
  ratingLoading.value = true
  try {
    const res = await fetch(`/api/diaries/${selectedDiary.value.id}/rate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ rating })
    })
    const data = await res.json()
    if (data.success) {
      selectedDiary.value.my_rating = rating
      selectedDiary.value.rating_avg = data.rating_avg
      selectedDiary.value.rating_count = data.rating_count
      fetchCommunityDiaries()
    }
  } catch { console.error('评分失败') }
  finally { ratingLoading.value = false }
}

function setSort(type: string) {
  communityQuery.sortType = type
  searchResults.value = [] // 切换排序时清除底部的全局搜索结果，方便查看排序后的社区列表
  fetchCommunityDiaries()
}

async function searchDiaries() {
  if (!searchForm.keyword.trim() && !searchForm.style.trim() && !searchForm.scenicSpot.trim()) return

  try {
    const params = new URLSearchParams()
    if (searchForm.keyword.trim()) params.set('keyword', searchForm.keyword.trim())
    if (searchForm.style.trim()) params.set('style', searchForm.style.trim())
    if (searchForm.scenicSpot.trim()) params.set('scenicSpot', searchForm.scenicSpot.trim())

    const res = await fetch(`/api/diaries/search?${params}`)
    const data = await res.json()
    if (data.success) searchResults.value = data.data || []
  } catch { console.error('搜索日记失败') }
}

function clearSearch() {
  searchResults.value = []
  searchForm.keyword = ''
  searchForm.style = ''
  searchForm.scenicSpot = ''
}

function openCreateModal() {
  editingId.value = null
  form.title = ''
  form.content = ''
  form.style = ''
  form.scenicSpot = ''
  form.generateAnimationImage = false
  clearMediaPreviews()
  errorMsg.value = ''
  showWriteModal.value = true
}

async function openAIModal() {
  errorMsg.value = ''
  scenicSpotTouched.value = false
  tagsTouched.value = false
  clearAIMediaPreviews()
  aiForm.generateAnimationImage = false
  
  // 检查是否有从导航页面传来的轨迹信息
  const savedTrajectory = sessionStorage.getItem('ai_diary_trajectory')
  if (savedTrajectory) {
    aiForm.trajectory = savedTrajectory
    sessionStorage.removeItem('ai_diary_trajectory')
  }

  showAIModal.value = true
}

// 监听轨迹变化，自动预填标签
watch(() => aiForm.trajectory, async (newVal) => {
  if (newVal.trim() && showAIModal.value) {
    try {
      const res = await fetch('/api/diaries/prefill-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trajectory: newVal })
      })
      const result = await res.json()
      if (result.success && result.data) {
        const { spots, styles } = result.data
        if (spots && spots.length > 0 && !scenicSpotTouched.value) {
          aiForm.scenicSpotInput = spots.join('、')
        }
        if (styles && styles.length > 0 && !tagsTouched.value) {
          aiForm.tagsInput = styles.join(', ')
        }
      }
    } catch (e) {
      console.warn('预填标签失败', e)
    }
  }
}, { immediate: true })

function closeAIModal() {
  showAIModal.value = false
  aiForm.trajectory = ''
  aiForm.tagsInput = ''
  aiForm.scenicSpotInput = ''
  aiForm.generateAnimationImage = false
  clearAIMediaPreviews()
  errorMsg.value = ''
}

async function generateAIDiary() {
  errorMsg.value = ''
  const token = getToken()
  if (!token) { router.push('/login'); return }

  generating.value = true
  try {
    const tags = aiForm.tagsInput.split(',').map(t => t.trim()).filter(t => t)

    let res: Response
    if (aiMediaPreviews.value.length > 0) {
      const fd = new FormData()
      fd.append('trajectory', aiForm.trajectory.trim())
      fd.append('date', aiForm.date)
      fd.append('weather', aiForm.weather)
      fd.append('tags', tags.join(','))
      fd.append('scenicSpot', aiForm.scenicSpotInput.trim())
      fd.append('generateAnimationImage', aiForm.generateAnimationImage ? 'true' : 'false')
      aiForm.photos.forEach(photo => fd.append('photos', photo))
      aiMediaPreviews.value.forEach(item => fd.append('media', item.file))

      res = await fetch('/api/diaries/generate-with-media', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: fd
      })
    } else {
      res = await fetch('/api/diaries/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          trajectory: aiForm.trajectory.trim(),
          date: aiForm.date,
          weather: aiForm.weather,
          tags: tags,
          scenicSpot: aiForm.scenicSpotInput.trim(),
          photos: aiForm.photos,
          generateAnimationImage: aiForm.generateAnimationImage
        })
      })
    }

    const data = await res.json()
    if (!data.success) {
      errorMsg.value = data.error || 'AI 生成失败，请重试'
      return
    }

    closeAIModal()
    await Promise.all([fetchMyDiaries(), fetchCommunityDiaries()])
  } catch {
    errorMsg.value = '网络错误，请稍后重试'
  } finally {
    generating.value = false
  }
}

function openEditModal(diary: MyDiary) {
  editingId.value = diary.id
  form.title = diary.title
  form.content = diary.content
  form.style = diary.style || ''
  form.scenicSpot = diary.scenic_spot || ''
  clearMediaPreviews()
  errorMsg.value = ''
  showWriteModal.value = true
}

async function submitForm() {
  errorMsg.value = ''

  if (!form.title.trim()) { errorMsg.value = '请输入标题'; return }
  if (!form.content.trim()) { errorMsg.value = '请输入内容'; return }

  const token = getToken()
  if (!token) { router.push('/login'); return }

  submitting.value = true

  try {
    let res: Response

    if (!editingId.value && mediaPreviews.value.length > 0) {
      const fd = new FormData()
      fd.append('title', form.title.trim())
      fd.append('content', form.content.trim())
      fd.append('style', form.style.trim())
      fd.append('scenicSpot', form.scenicSpot.trim())
      fd.append('generateAnimationImage', form.generateAnimationImage ? 'true' : 'false')
      mediaPreviews.value.forEach(item => fd.append('media', item.file))

      res = await fetch('/api/diaries/with-media', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: fd
      })
    } else {
      const url = editingId.value ? `/api/diaries/${editingId.value}` : '/api/diaries'
      const method = editingId.value ? 'PUT' : 'POST'

      res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: form.title.trim(),
          content: form.content.trim(),
          style: form.style.trim() || undefined,
          scenicSpot: form.scenicSpot.trim() || undefined,
          generateAnimationImage: !editingId.value && form.generateAnimationImage
        })
      })
    }

    const data = await res.json()
    if (!data.success) { errorMsg.value = data.error || '操作失败'; return }

    closeModal()
    await Promise.all([fetchMyDiaries(), fetchCommunityDiaries()])
  } catch { errorMsg.value = '网络错误，请稍后重试' }
  finally { submitting.value = false }
}

async function togglePublic(diary: MyDiary) {
  const token = getToken()
  if (!token) return

  try {
    const res = await fetch(`/api/diaries/${diary.id}/public`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const data = await res.json()
    if (data.success) {
      diary.is_public = data.is_public
      await fetchCommunityDiaries()
    }
  } catch { console.error('公开切换失败') }
}

async function deleteDiary(id: number) {
  if (!confirm('确定要删除这篇日记吗？')) return

  const token = getToken()
  if (!token) return

  try {
    const res = await fetch(`/api/diaries/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const data = await res.json()
    if (data.success) {
      myDiaries.value = myDiaries.value.filter(d => d.id !== id)
      await fetchCommunityDiaries()
    }
  } catch { console.error('删除失败') }
}

function closeModal() {
  showWriteModal.value = false
  editingId.value = null
  form.title = ''
  form.content = ''
  form.style = ''
  form.scenicSpot = ''
  form.generateAnimationImage = false
  clearMediaPreviews()
  errorMsg.value = ''
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function goBack() { router.push('/') }
function goShellTab(tab: 'map' | 'trip' | 'discover' | 'profile') {
  router.push({ path: '/', query: tab === 'map' ? {} : { tab } })
}

async function logout() {
  const token = getToken()
  if (token) {
    await fetch('/api/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    }).catch(() => {})
  }
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  router.push('/login')
}

onMounted(() => {
  const token = getToken()
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null')
    if (user?.username) currentUsername.value = user.username
  } catch {}
  if (token) {
    fetch('/api/auth/check', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) currentUserId.value = d.user.id })
      .catch(() => {})
  }
  fetchMyDiaries()
  fetchCommunityDiaries()
  fetchDiaryWeather()

  // 如果是从导航页点击“生成轨迹日记”跳过来的，直接打开 AI 模态框
  if (sessionStorage.getItem('ai_diary_trajectory')) {
    openAIModal()
  }
})

onBeforeUnmount(() => {
  clearMediaPreviews()
  clearAIMediaPreviews()
  if (animationPollTimer) {
    window.clearInterval(animationPollTimer)
    animationPollTimer = null
  }
  if (diaryWeatherAutoCloseTimer) {
    window.clearTimeout(diaryWeatherAutoCloseTimer)
    diaryWeatherAutoCloseTimer = null
  }
})
</script>

<style scoped>
.diary-container {
  min-height: 100vh;
  background: linear-gradient(180deg, #fbf7f2 0%, #f7f2eb 100%);
  padding: 78px 24px 24px;
  position: relative;
  overflow-x: hidden;
  color: #2b1f14;
  font-family: "宋体", SimSun, serif;
}

.diary-container::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background:
    radial-gradient(circle at 12% 14%, rgba(212, 165, 116, 0.14), transparent 26%),
    radial-gradient(circle at 88% 12%, rgba(192, 120, 88, 0.1), transparent 28%);
  pointer-events: none;
}

.diary-container::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255,255,255,0.22), transparent 40%);
  pointer-events: none;
}

.topbar {
  height: 54px;
  background: rgba(255, 255, 255, 0.94);
  border-bottom: 1px solid #e6dbcf;
  display: flex;
  align-items: center;
  padding: 0 20px;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  gap: 16px;
  backdrop-filter: blur(14px);
}

.topbar-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  color: #2b1f14;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
}

.brand-mark { font-size: 18px; }
.brand-name { font-weight: 700; }
.topbar-brand small { color: #9d8a74; }

.topbar-nav,
.topbar-right,
.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.topbar-nav {
  margin-left: auto;
  gap: 22px;
}

.tbn,
.tbr-btn {
  min-height: 34px;
  padding: 0 14px;
  border-radius: 7px;
  border: 1px solid transparent;
  background: transparent;
  color: #6f5a45;
  cursor: pointer;
  font-family: inherit;
}

.tbn.active {
  background: rgba(192, 120, 88, 0.1);
  color: #c07858;
  font-weight: 700;
}

.tbr-btn {
  border-color: #d6c8b8;
}

.tbr-user {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 3px 12px 3px 3px;
  border-radius: 20px;
  border: 1px solid #e6dbcf;
}

.tbr-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #e8cdaa;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
}

.tbr-name {
  font-size: 12px;
  font-weight: 600;
  color: #6f5a45;
}

.diary-page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 8px 22px;
  position: relative;
  z-index: 1;
}

.page-subtitle {
  margin-top: 4px;
  color: #9d8a74;
  font-size: 13px;
}

.page-title {
  font-size: 24px; font-weight: 700; color: #2b1f14; margin: 0;
  letter-spacing: 0.5px;
}

.header-actions { display: flex; align-items: center; gap: 12px; }

.community-controls {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.dest-search {
  display: flex;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 20px;
  padding: 2px 4px 2px 12px;
  align-items: center;
}
.dest-search input {
  border: none;
  outline: none;
  font-size: 13px;
  width: 120px;
}
.dest-search button {
  background: #8b5cf6;
  color: #fff;
  border: none;
  border-radius: 16px;
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
}
.sort-group {
  display: flex;
  background: #f3f4f6;
  padding: 4px;
  border-radius: 8px;
  gap: 4px;
}
.sort-group button {
  border: none;
  background: none;
  padding: 4px 12px;
  font-size: 13px;
  border-radius: 6px;
  cursor: pointer;
  color: #666;
  transition: all 0.2s;
}
.sort-group button.active {
  background: #fff;
  color: #8b5cf6;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
.card-stats {
  margin-left: auto;
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #666;
}
.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 详情模态框样式 */
.detail-modal {
  width: min(1120px, 94vw);
  max-width: 1120px;
  max-height: min(86vh, 920px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.detail-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.detail-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.detail-actions .edit-btn,
.detail-actions .delete-btn,
.detail-header-actions .close-btn {
  width: auto;
  height: auto;
  padding: 6px 10px;
  font-size: 12px;
}
.detail-body {
  flex: 1 1 auto;
  padding: 20px 0 0;
  min-height: 0;
  overflow-y: auto;
  padding-right: 8px;
}
.detail-body .title {
  margin-bottom: 12px;
  font-size: 24px;
}
.detail-main-layout {
  display: block;
}
.detail-main-layout.with-media {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
  gap: 20px;
  align-items: start;
}
.detail-text-column,
.detail-media-column {
  min-height: 0;
}
.spot-tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}
.tag-item {
  font-size: 12px;
  color: #8b5cf6;
  background: #f5f3ff;
  padding: 2px 8px;
  border-radius: 4px;
}
.content-wrapper {
  margin: 20px 0;
  padding: 20px;
  background: #f9fafb;
  border-radius: 12px;
  max-height: none;
  overflow: visible;
}
.content-text {
  line-height: 1.8;
  white-space: pre-wrap;
  color: #374151;
}
.detail-footer {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.detail-stats {
  display: flex;
  gap: 20px;
  color: #666;
  font-size: 14px;
}
.rating-section {
  display: flex;
  align-items: center;
  gap: 10px;
}
.stars {
  display: flex;
  gap: 4px;
}
.star {
  font-size: 24px;
  cursor: pointer;
  color: #d1d5db;
  transition: color 0.2s;
}
.star:hover, .star.active {
  color: #f59e0b;
}
.rating-loading {
  font-size: 12px;
  color: #999;
}

.ai-btn {
  padding: 10px 18px;
  background: rgba(139, 69, 19, 0.08);
  border: 1px solid rgba(139, 69, 19, 0.3);
  border-radius: 6px; color: #8B4513;
  font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s;
  display: flex; align-items: center; gap: 8px;
}
.ai-btn:hover { background: rgba(139, 69, 19, 0.15); border-color: rgba(139, 69, 19, 0.5); transform: translateY(-1px); }
.ai-icon { font-size: 16px; }

.write-btn {
  padding: 10px 20px;
  background: linear-gradient(135deg, #8B4513, #A0522D);
  border: 1px solid #D4A574;
  border-radius: 6px; color: #FFF8DC;
  font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s;
  letter-spacing: 1px;
}
.write-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(139, 69, 19, 0.35); }

.diary-content {
  display: grid; grid-template-columns: 1fr 1fr; gap: 24px;
  z-index: 1; position: relative;
}
@media (max-width: 1024px) { .diary-content { grid-template-columns: 1fr; } }

section {
  background: linear-gradient(145deg, #FFF8DC, #F5E6C8);
  border: 2px solid #D4A574;
  border-radius: 10px; padding: 24px;
  box-shadow: 0 4px 16px rgba(139, 69, 19, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.4);
  position: relative;
}

section::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background:
    repeating-linear-gradient(
      0deg,
      transparent,
      transparent 28px,
      rgba(139, 69, 19, 0.025) 28px,
      rgba(139, 69, 19, 0.025) 29px
    );
  border-radius: 8px;
  pointer-events: none;
}

.section-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 16px; padding-bottom: 12px;
  border-bottom: 1px solid rgba(139, 69, 19, 0.2);
}
.section-header h2 {
  font-size: 16px; font-weight: 700; color: #5D3A1A; margin: 0;
  letter-spacing: 2px;
}
.count {
  font-size: 12px; color: #8B4513;
  background: rgba(139, 69, 19, 0.08); padding: 4px 10px; border-radius: 12px;
  border: 1px solid rgba(139, 69, 19, 0.15);
}

.empty-state {
  text-align: center; padding: 48px 20px;
  color: rgba(93, 58, 26, 0.4); font-size: 14px;
}

.diary-list {
  display: flex; flex-direction: column; gap: 14px;
  max-height: calc(100vh - 220px); overflow-y: auto;
}
.diary-list::-webkit-scrollbar { width: 5px; }
.diary-list::-webkit-scrollbar-thumb { background: rgba(139, 69, 19, 0.2); border-radius: 3px; }

.diary-card {
  padding: 18px; border-radius: 8px; transition: all 0.25s ease;
  position: relative;
}

.my-card {
  background: linear-gradient(135deg, rgba(255, 248, 220, 0.9), rgba(245, 230, 200, 0.9));
  border: 1px solid rgba(139, 69, 19, 0.2);
  box-shadow: 2px 2px 8px rgba(139, 69, 19, 0.08);
}
.my-card:hover {
  transform: translateX(4px);
  box-shadow: 4px 4px 16px rgba(139, 69, 19, 0.15);
  border-color: rgba(139, 69, 19, 0.35);
}

.community-card {
  background: linear-gradient(135deg, rgba(255, 248, 220, 0.7), rgba(245, 230, 200, 0.7));
  border: 1px solid rgba(139, 69, 19, 0.15);
  box-shadow: 2px 2px 8px rgba(139, 69, 19, 0.06);
}
.community-card:hover {
  border-color: rgba(139, 69, 19, 0.3);
  box-shadow: 4px 4px 16px rgba(139, 69, 19, 0.12);
}

.card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.date { font-size: 13px; font-weight: 600; color: #8B4513; letter-spacing: 1px; }

.card-actions { display: flex; align-items: center; gap: 5px; }

.public-btn {
  padding: 3px 8px; border: 1px solid rgba(139, 69, 19, 0.15); border-radius: 4px;
  font-size: 11px; cursor: pointer; transition: all 0.2s;
  background: rgba(139, 69, 19, 0.04); color: rgba(93, 58, 26, 0.5);
}
.public-btn.active { background: rgba(139, 69, 19, 0.1); color: #8B4513; border-color: rgba(139, 69, 19, 0.3); }
.public-btn:hover { background: rgba(139, 69, 19, 0.12); }

.edit-btn {
  width: 22px; height: 22px; border: 1px solid rgba(139, 69, 19, 0.15); border-radius: 4px;
  background: rgba(139, 69, 19, 0.04); color: #8B4513;
  cursor: pointer; font-size: 11px;
  display: flex; align-items: center; justify-content: center; transition: all 0.2s;
}
.edit-btn:hover { background: rgba(139, 69, 19, 0.12); }

.delete-btn {
  width: 22px; height: 22px; border: 1px solid rgba(139, 69, 19, 0.15); border-radius: 4px;
  background: rgba(139, 69, 19, 0.04); color: #A0522D;
  cursor: pointer; font-size: 11px;
  display: flex; align-items: center; justify-content: center; transition: all 0.2s;
}
.delete-btn:hover { background: rgba(139, 69, 19, 0.12); }

.title { font-size: 15px; font-weight: 700; color: #5D3A1A; margin: 0 0 8px 0; letter-spacing: 1px; }

.card-tags { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }

.card-media-preview {
  display: grid;
  grid-template-columns: 64px 1fr;
  align-items: center;
  gap: 10px;
  margin: 10px 0;
  padding: 8px;
  background: rgba(255, 248, 220, 0.7);
  border: 1px solid rgba(139, 69, 19, 0.12);
  border-radius: 6px;
  font-size: 12px;
  color: #8B4513;
}
.card-media-preview img,
.card-media-preview .video-cover {
  width: 64px;
  height: 48px;
  border-radius: 5px;
  object-fit: cover;
  background: rgba(139, 69, 19, 0.12);
}
.video-cover {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #5D3A1A;
  font-size: 12px;
  font-weight: 700;
}

.ai-tag {
  font-size: 11px; color: #8B4513;
  background: rgba(139, 69, 19, 0.08); padding: 3px 8px; border-radius: 4px;
  border: 1px solid rgba(139, 69, 19, 0.15);
}

.content {
  font-size: 14px; line-height: 1.8; color: rgba(93, 58, 26, 0.75); margin: 0 0 10px 0;
  text-indent: 2em;
}

.summary-tag {
  font-size: 12px; color: #8B4513;
  background: rgba(139, 69, 19, 0.06); padding: 4px 10px; border-radius: 4px;
  display: inline-block; border: 1px solid rgba(139, 69, 19, 0.12);
}

.user-info { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.avatar {
  width: 36px; height: 36px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: #FFF8DC; font-size: 14px; font-weight: 600;
  border: 2px solid rgba(139, 69, 19, 0.2);
}
.user-meta { display: flex; flex-direction: column; gap: 2px; }
.author { font-size: 14px; font-weight: 600; color: #5D3A1A; }
.post-time { font-size: 12px; color: rgba(93, 58, 26, 0.45); }

.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(93, 58, 26, 0.4); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; z-index: 9999;
}
.modal-card {
  width: 520px; max-width: 90vw;
  background: linear-gradient(145deg, #FFF8DC, #F5E6C8);
  border: 2px solid #D4A574;
  border-radius: 10px; padding: 28px;
  box-shadow: 0 16px 48px rgba(139, 69, 19, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.5);
  color: #5D3A1A;
}
.modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.modal-header h3 { font-size: 18px; color: #5D3A1A; margin: 0; letter-spacing: 2px; }
.close-btn {
  width: 28px; height: 28px; border: 1px solid rgba(139, 69, 19, 0.2); border-radius: 4px;
  background: rgba(139, 69, 19, 0.06); color: #8B4513;
  cursor: pointer; font-size: 14px;
  display: flex; align-items: center; justify-content: center; transition: all 0.2s;
}
.close-btn:hover { background: rgba(139, 69, 19, 0.15); }

.write-form { display: flex; flex-direction: column; gap: 16px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 13px; color: #8B4513; font-weight: 600; letter-spacing: 1px; }

.form-group input, .form-group textarea {
  padding: 12px 14px;
  background: rgba(255, 248, 220, 0.8);
  border: 1px solid rgba(139, 69, 19, 0.2);
  border-radius: 6px; color: #5D3A1A; font-size: 14px;
  outline: none; resize: vertical; transition: all 0.2s;
}
.form-group input:focus, .form-group textarea:focus {
  border-color: #8B4513;
  background: rgba(255, 248, 220, 1);
  box-shadow: 0 0 12px rgba(139, 69, 19, 0.1);
}
.form-group input::placeholder, .form-group textarea::placeholder { color: rgba(93, 58, 26, 0.3); }

.media-upload-group .media-input {
  padding: 10px;
}
.media-preview-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
  gap: 10px;
  margin-top: 8px;
}
.media-preview-item {
  position: relative;
  min-height: 84px;
  border: 1px solid rgba(139, 69, 19, 0.18);
  border-radius: 7px;
  overflow: hidden;
  background: rgba(255, 248, 220, 0.8);
}
.media-preview-item img,
.media-preview-item video {
  width: 100%;
  height: 72px;
  display: block;
  object-fit: cover;
}
.media-preview-item img {
  cursor: zoom-in;
}
.media-preview-item span {
  display: block;
  padding: 4px 6px;
  font-size: 11px;
  color: #8B4513;
}
.media-remove-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: rgba(93, 58, 26, 0.72);
  color: #FFF8DC;
  cursor: pointer;
}

.ai-modal { border-color: #8B4513; }
.ai-form { display: flex; flex-direction: column; gap: 18px; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.form-group select {
  padding: 12px 14px;
  background: rgba(255, 248, 220, 0.8);
  border: 1px solid rgba(139, 69, 19, 0.2);
  border-radius: 6px; color: #5D3A1A; font-size: 14px; outline: none;
}
.ai-notice {
  background: rgba(139, 69, 19, 0.06);
  border: 1px dashed rgba(139, 69, 19, 0.25);
  padding: 12px; border-radius: 6px;
}
.ai-notice p { margin: 0; font-size: 13px; color: #8B4513; line-height: 1.5; }
.ai-submit-btn { background: linear-gradient(135deg, #8B4513, #A0522D); margin-top: 4px; }

.animation-option {
  padding: 14px;
  border: 1px solid rgba(139, 69, 19, 0.18);
  border-radius: 8px;
  background: rgba(255, 248, 220, 0.72);
}
.animation-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #5d3a1a;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.animation-toggle input {
  width: 16px;
  height: 16px;
  accent-color: #8b4513;
}
.animation-option p {
  margin: 8px 0 0;
  color: #8b4513;
  font-size: 13px;
  line-height: 1.5;
}

.loading-spinner {
  width: 16px; height: 16px; border: 2px solid rgba(139, 69, 19, 0.2);
  border-top-color: #5D3A1A; border-radius: 50%;
  animation: spin 0.8s linear infinite; display: inline-block; margin-right: 8px;
}
@keyframes spin { to { transform: rotate(360deg); } }

.error-msg {
  padding: 10px 14px; background: rgba(139, 69, 19, 0.08);
  border: 1px solid rgba(139, 69, 19, 0.25);
  border-radius: 6px; color: #8B4513; font-size: 13px; text-align: center;
}
.submit-btn {
  padding: 13px; background: linear-gradient(135deg, #8B4513, #A0522D);
  border: 1px solid #D4A574; border-radius: 6px; color: #FFF8DC;
  font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s; letter-spacing: 2px;
}
.submit-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(139, 69, 19, 0.35); }
.submit-btn:disabled { opacity: 0.55; cursor: not-allowed; }

.search-bar {
  display: flex; gap: 8px; margin-bottom: 16px;
  flex-wrap: wrap; align-items: center;
}
.search-input {
  flex: 1; min-width: 180px;
  padding: 10px 14px;
  background: rgba(255, 248, 220, 0.8);
  border: 1px solid rgba(139, 69, 19, 0.2);
  border-radius: 6px; color: #5D3A1A; font-size: 14px;
}
.search-input::placeholder { color: rgba(93, 58, 26, 0.35); }
.search-input:focus { outline: none; border-color: #8B4513; box-shadow: 0 0 10px rgba(139, 69, 19, 0.1); }
.search-tag-input {
  width: 130px; padding: 10px 12px;
  background: rgba(255, 248, 220, 0.8);
  border: 1px solid rgba(139, 69, 19, 0.2);
  border-radius: 6px; color: #5D3A1A; font-size: 13px;
}
.search-tag-input::placeholder { color: rgba(93, 58, 26, 0.35); }
.search-tag-input:focus { outline: none; border-color: #8B4513; }
.search-btn {
  padding: 10px 20px;
  background: linear-gradient(135deg, #8B4513, #A0522D);
  border: 1px solid #D4A574; border-radius: 6px; color: #FFF8DC;
  font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.search-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(139, 69, 19, 0.3); }
.clear-search-btn {
  padding: 10px 16px;
  background: rgba(139, 69, 19, 0.06);
  border: 1px solid rgba(139, 69, 19, 0.25);
  border-radius: 6px; color: #8B4513; font-size: 13px; cursor: pointer;
}
.clear-search-btn:hover { background: rgba(139, 69, 19, 0.12); }

.match-badge {
  margin-left: auto;
  padding: 3px 10px; font-size: 11px; border-radius: 4px;
  background: rgba(139, 69, 19, 0.08); color: #8B4513; white-space: nowrap;
  border: 1px solid rgba(139, 69, 19, 0.15);
}
.card-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.style-tag {
  padding: 2px 8px; font-size: 11px; border-radius: 4px;
  background: rgba(139, 69, 19, 0.08); color: #8B4513;
  border: 1px solid rgba(139, 69, 19, 0.12);
}
.spot-tag {
  padding: 2px 8px; font-size: 11px; border-radius: 4px;
  background: rgba(160, 82, 45, 0.08); color: #A0522D;
  border: 1px solid rgba(160, 82, 45, 0.12);
}

.tags-group { margin-top: 4px; }
.tag-input-row { display: flex; gap: 10px; }
.tag-field {
  flex: 1; padding: 9px 12px;
  background: rgba(255, 248, 220, 0.8);
  border: 1px solid rgba(139, 69, 19, 0.2);
  border-radius: 6px; color: #5D3A1A; font-size: 13px;
}
.tag-field::placeholder { color: rgba(93, 58, 26, 0.3); }
.tag-field:focus { outline: none; border-color: #8B4513; }
.tag-hint { display: block; font-size: 11px; color: rgba(93, 58, 26, 0.4); margin-top: 4px; }

.search-result { border-color: rgba(139, 69, 19, 0.25); }

.detail-media-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 20px 0 0;
  max-height: min(52vh, 560px);
  overflow-y: auto;
}
.detail-media-item {
  border: 1px solid rgba(139, 69, 19, 0.16);
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 248, 220, 0.7);
}
.detail-media-item img,
.detail-media-item video {
  width: 100%;
  max-height: min(40vh, 360px);
  display: block;
  object-fit: contain;
  background: rgba(93, 58, 26, 0.08);
}
.detail-media-item img {
  cursor: zoom-in;
}
@media (max-width: 900px) {
  .detail-modal {
    width: min(96vw, 760px);
    max-height: 90vh;
  }
  .detail-main-layout.with-media {
    grid-template-columns: 1fr;
  }
  .content-wrapper,
  .detail-media-grid {
    max-height: none;
  }
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
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
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
  color: #FFF8DC;
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
}

/* 动画生成状态卡片 */
.animation-status-card {
  background: rgba(139, 69, 19, 0.04);
  border: 1px dashed rgba(139, 69, 19, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  text-align: center;
  padding: 20px;
}

.animation-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #8b4513;
}

.animation-loading .spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(139, 69, 19, 0.1);
  border-top-color: #8b4513;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.animation-loading span {
  font-weight: 600;
  font-size: 15px;
}

.animation-loading .hint {
  font-size: 12px;
  opacity: 0.7;
  margin: 0;
}

.animation-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #d9534f;
}

.animation-error .error-icon {
  font-size: 24px;
}

.animation-error .error-text {
  font-weight: 600;
  font-size: 15px;
}

.animation-error .error-detail {
  font-size: 12px;
  color: #a94442;
  margin: 0;
  max-width: 100%;
  word-break: break-all;
}

.retry-animation-btn {
  margin-top: 6px;
  padding: 8px 14px;
  border: 1px solid rgba(139, 69, 19, 0.22);
  border-radius: 6px;
  background: linear-gradient(135deg, #8B4513, #A0522D);
  color: #FFF8DC;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.retry-animation-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(139, 69, 19, 0.2);
}

.retry-animation-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.animation-pending-tag {
  background: rgba(139, 69, 19, 0.1);
  color: #8b4513;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid rgba(139, 69, 19, 0.2);
  display: flex;
  align-items: center;
  gap: 4px;
}

.animation-failed-tag {
  background: rgba(217, 83, 79, 0.1);
  color: #d9534f;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid rgba(217, 83, 79, 0.2);
  cursor: help;
}
.diary-container {
  --sm-bg-page: #f7f2eb;
  --sm-bg-card: rgba(255, 255, 255, 0.96);
  --sm-bg-card-soft: rgba(247, 242, 235, 0.88);
  --sm-text: #2b1f14;
  --sm-text-secondary: #6f5a45;
  --sm-text-muted: #9d8a74;
  --sm-accent: #c07858;
  --sm-accent-dark: #9a5f45;
  --sm-accent-soft: rgba(192, 120, 88, 0.12);
  --sm-gold: #d4a574;
  --sm-border: #dccfc0;
  --sm-border-light: #eee4d9;
  --sm-shadow-sm: 0 10px 28px rgba(43, 31, 20, 0.08);
  --sm-shadow-md: 0 18px 42px rgba(43, 31, 20, 0.12);
  background:
    radial-gradient(circle at 10% 10%, rgba(212, 165, 116, 0.14), transparent 24%),
    radial-gradient(circle at 86% 16%, rgba(192, 120, 88, 0.1), transparent 26%),
    linear-gradient(180deg, #fbf7f2 0%, #f7f2eb 100%);
  color: var(--sm-text);
  padding: 28px;
}

.diary-container::before,
.diary-container::after {
  display: none;
}

.diary-header,
section,
.modal-card,
.detail-modal,
.image-viewer-overlay img {
  border: 1px solid rgba(220, 207, 192, 0.88);
  background: var(--sm-bg-card);
  box-shadow: var(--sm-shadow-sm);
}

.diary-header {
  padding: 18px 22px;
  border-radius: 20px;
  margin-bottom: 24px;
  backdrop-filter: blur(18px);
}

.page-title {
  color: var(--sm-text);
  font-size: 24px;
  letter-spacing: 0.5px;
  text-shadow: none;
}

.back-btn,
.ai-btn,
.write-btn,
.search-btn,
.clear-search-btn,
.submit-btn,
.retry-animation-btn,
.detail-actions .edit-btn,
.detail-actions .delete-btn,
.detail-header-actions .close-btn,
.public-btn {
  border-radius: 14px;
}

.back-btn,
.ai-btn,
.clear-search-btn,
.public-btn,
.detail-actions .edit-btn,
.detail-actions .delete-btn,
.detail-header-actions .close-btn {
  border: 1px solid var(--sm-border);
  background: rgba(247, 242, 235, 0.88);
  color: var(--sm-text-secondary);
}

.back-btn:hover,
.ai-btn:hover,
.clear-search-btn:hover,
.public-btn:hover,
.detail-actions .edit-btn:hover,
.detail-actions .delete-btn:hover,
.detail-header-actions .close-btn:hover {
  border-color: var(--sm-gold);
  background: rgba(255, 255, 255, 0.98);
  color: var(--sm-accent);
}

.write-btn,
.search-btn,
.submit-btn,
.ai-submit-btn,
.retry-animation-btn {
  border: none;
  background: linear-gradient(135deg, var(--sm-accent), var(--sm-accent-dark));
  color: #fff;
  letter-spacing: 0.5px;
  box-shadow: 0 12px 24px rgba(192, 120, 88, 0.22);
}

.write-btn:hover,
.search-btn:hover,
.submit-btn:hover:not(:disabled),
.retry-animation-btn:hover:not(:disabled) {
  box-shadow: 0 16px 28px rgba(192, 120, 88, 0.28);
}

.diary-content {
  gap: 24px;
}

section {
  padding: 22px;
  border-radius: 22px;
  position: relative;
  overflow: hidden;
}

section::before {
  display: none;
}

.section-header {
  padding-bottom: 14px;
  border-bottom: 1px solid var(--sm-border-light);
}

.section-header h2,
.title,
.author,
.detail-body .title,
.modal-header h3 {
  color: var(--sm-text);
}

.section-header h2 {
  font-size: 18px;
  letter-spacing: 0.5px;
}

.count,
.match-badge,
.ai-tag,
.style-tag,
.spot-tag,
.summary-tag,
.tag-item,
.animation-pending-tag,
.animation-failed-tag {
  border-radius: 999px;
}

.count,
.match-badge,
.ai-tag,
.summary-tag,
.tag-item,
.animation-pending-tag {
  background: var(--sm-accent-soft);
  color: var(--sm-accent);
  border: 1px solid rgba(192, 120, 88, 0.14);
}

.spot-tag {
  background: rgba(212, 165, 116, 0.14);
  color: #9a6a47;
  border: 1px solid rgba(212, 165, 116, 0.2);
}

.animation-failed-tag {
  background: rgba(217, 83, 79, 0.08);
  color: #c85650;
  border: 1px solid rgba(217, 83, 79, 0.16);
}

.dest-search,
.sort-group,
.search-input,
.search-tag-input,
.content-wrapper,
.card-media-preview,
.animation-option,
.ai-notice,
.detail-media-item,
.animation-status-card {
  border-radius: 16px;
}

.dest-search,
.sort-group,
.search-input,
.search-tag-input,
.content-wrapper,
.card-media-preview,
.animation-option,
.ai-notice,
.detail-media-item {
  border: 1px solid var(--sm-border);
  background: var(--sm-bg-card-soft);
}

.dest-search input,
.search-input,
.search-tag-input,
.form-group input,
.form-group textarea,
.form-group select,
.tag-field {
  color: var(--sm-text);
}

.dest-search input::placeholder,
.search-input::placeholder,
.search-tag-input::placeholder,
.form-group input::placeholder,
.form-group textarea::placeholder,
.tag-field::placeholder {
  color: var(--sm-text-muted);
}

.sort-group {
  padding: 4px;
}

.sort-group button {
  border-radius: 12px;
  color: var(--sm-text-secondary);
}

.sort-group button.active {
  background: #fff;
  color: var(--sm-accent);
  box-shadow: 0 8px 18px rgba(43, 31, 20, 0.08);
}

.diary-list {
  gap: 14px;
}

.diary-card {
  padding: 18px;
  border-radius: 18px;
  border: 1px solid rgba(220, 207, 192, 0.82);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 10px 24px rgba(43, 31, 20, 0.05);
}

.my-card,
.community-card {
  background: rgba(255, 255, 255, 0.92);
  border-color: rgba(220, 207, 192, 0.82);
  box-shadow: 0 10px 24px rgba(43, 31, 20, 0.05);
}

.my-card:hover,
.community-card:hover {
  transform: translateY(-2px);
  border-color: rgba(212, 165, 116, 0.5);
  box-shadow: var(--sm-shadow-sm);
}

.date,
.post-time,
.card-stats,
.detail-stats,
.rating-loading,
.tag-hint {
  color: var(--sm-text-muted);
}

.content,
.content-text,
.ai-notice p,
.animation-option p,
.error-detail {
  color: var(--sm-text-secondary);
}

.avatar {
  border: 2px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 8px 18px rgba(43, 31, 20, 0.08);
}

.modal-overlay,
.image-viewer-overlay {
  background: rgba(43, 31, 20, 0.3);
  backdrop-filter: blur(8px);
}

.modal-card {
  padding: 26px;
  border-radius: 22px;
  color: var(--sm-text);
}

.detail-modal {
  background: rgba(255, 252, 248, 0.98);
}

.detail-body {
  padding-top: 18px;
}

.content-wrapper {
  max-height: none;
}

.detail-media-item img,
.detail-media-item video,
.image-viewer-overlay img {
  border-radius: 14px;
}

.close-btn,
.image-viewer-close,
.media-remove-btn {
  border-radius: 999px;
}

.close-btn,
.image-viewer-close {
  border: 1px solid rgba(220, 207, 192, 0.86);
}

.error-msg {
  border-radius: 14px;
  background: rgba(217, 83, 79, 0.08);
  border: 1px solid rgba(217, 83, 79, 0.16);
  color: #bf4d47;
}

.animation-loading,
.animation-error {
  color: var(--sm-text-secondary);
}

.animation-loading .spinner,
.loading-spinner {
  border-top-color: var(--sm-accent);
}

@media (max-width: 900px) {
  .diary-container {
    padding: 16px;
  }

  .diary-header {
    flex-wrap: wrap;
    gap: 14px;
    align-items: flex-start;
  }

  .header-actions,
  .community-controls,
  .tag-input-row,
  .form-row {
    width: 100%;
  }

  .header-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .dest-search {
    width: 100%;
  }
}

.topbar-right .tbr-user {
  padding: 4px 8px 4px 4px;
  gap: 8px;
}

.topbar-right {
  margin-left: auto;
  flex: 0 0 auto;
}

.topbar-right .diary-weather-btn {
  border-color: #e6dbcf;
  background: rgba(255, 250, 244, 0.92);
  color: #765f47;
  border-radius: 16px;
  font-weight: 700;
  white-space: nowrap;
}

.topbar-right .diary-weather-btn:hover:not(:disabled) {
  border-color: #d4a574;
  background: #fff;
  color: #9a5f45;
}

.diary-weather-popup {
  position: fixed;
  top: 76px;
  right: 18px;
  width: min(320px, calc(100vw - 32px));
  max-height: calc(100vh - 104px);
  overflow-y: auto;
  z-index: 12000;
  border: 1px solid rgba(212, 165, 116, 0.42);
  border-radius: 16px;
  background: rgba(255, 253, 246, 0.97);
  box-shadow: 0 18px 44px rgba(64, 40, 23, 0.22);
  backdrop-filter: blur(14px);
  color: #5d3a1a;
}

.diary-weather-close {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: rgba(139, 69, 19, 0.08);
  color: #8b4513;
  cursor: pointer;
}

.diary-weather-close:hover {
  background: rgba(139, 69, 19, 0.16);
}

.diary-weather-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 44px 14px 18px;
  border-bottom: 1px solid rgba(139, 69, 19, 0.1);
}

.diary-weather-emoji {
  font-size: 30px;
}

.diary-weather-temp {
  font-size: 24px;
  font-weight: 900;
}

.diary-weather-desc {
  margin-left: auto;
  font-size: 13px;
  color: #8b4513;
  font-weight: 800;
}

.diary-weather-body {
  padding: 14px 18px 16px;
}

.diary-weather-row,
.diary-weather-hourly-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.diary-weather-row {
  margin-bottom: 8px;
}

.diary-weather-alert {
  margin: 10px 0;
  padding: 10px;
  border-radius: 10px;
  background: rgba(232, 93, 58, 0.08);
  color: #a74830;
  font-size: 13px;
  line-height: 1.5;
}

.diary-weather-safe {
  background: rgba(67, 143, 85, 0.08);
  color: #3f7a4a;
}

.diary-weather-forecast-title {
  margin: 12px 0 6px;
  font-size: 12px;
  color: #8b4513;
  font-weight: 900;
}

.diary-weather-hourly {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.diary-weather-hourly-item {
  justify-content: space-between;
  padding: 7px 8px;
  border-radius: 8px;
  background: rgba(139, 69, 19, 0.04);
}

.diary-weather-slide-enter-active {
  transition: all 0.28s ease-out;
}

.diary-weather-slide-leave-active {
  transition: all 0.22s ease-in;
}

.diary-weather-slide-enter-from,
.diary-weather-slide-leave-to {
  opacity: 0;
  transform: translateX(24px);
}

.topbar-right .tbr-avatar {
  flex: 0 0 auto;
}

.topbar-right .tbr-name {
  display: none;
}

.topbar-right .tbr-logout {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid #dfd0c2;
  background: #fffaf4;
  color: #765f47;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.topbar-right .tbr-logout:hover {
  border-color: #d4a574;
  background: #fff;
  color: #9a5f45;
}

.my-diaries,
.community-diaries {
  overflow: visible;
}

.my-diaries .diary-list,
.community-diaries .diary-list {
  padding-bottom: 28px;
  scroll-padding-bottom: 28px;
}

.diary-container {
  padding-bottom: 72px;
}

/* Align diary topbar with the main app shell. */
.topbar {
  height: 64px;
  padding: 0 20px;
  background: rgba(255, 252, 247, 0.88);
  border-bottom: 1px solid rgba(220, 207, 192, 0.9);
  box-shadow: 0 10px 32px rgba(43, 31, 20, 0.06);
  backdrop-filter: blur(18px);
}

.topbar-brand {
  gap: 10px;
  padding: 0 8px;
  border-radius: 14px;
}

.brand-mark {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(212, 165, 116, 0.28), rgba(192, 120, 88, 0.2));
}

.brand-name {
  font-size: 17px;
}

.topbar-nav {
  gap: 22px;
}

.tbn {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 12px;
  color: #765f47;
  font-weight: 700;
}

.tbn.active {
  background: rgba(192, 120, 88, 0.12);
  color: #c07858;
  box-shadow: inset 0 0 0 1px rgba(192, 120, 88, 0.14);
}

.tbr-btn,
.tbr-user {
  min-height: 38px;
  border-radius: 14px;
  border: 1px solid #dfd0c2;
  background: rgba(255, 255, 255, 0.68);
}

.diary-container {
  padding-top: 94px;
}

.diary-page-head {
  padding-top: 26px;
  padding-bottom: 34px;
}

.diary-page-head .header-actions {
  margin-top: 18px;
}

.detail-footer {
  gap: 16px;
  flex-wrap: wrap;
}

.diary-social-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.diary-social-btn {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid #dfd0c2;
  border-radius: 999px;
  background: #fffaf4;
  color: #765f47;
  font-weight: 800;
  cursor: pointer;
}

.diary-social-btn.active {
  border-color: rgba(192, 120, 88, 0.36);
  background: rgba(192, 120, 88, 0.12);
  color: #c07858;
}

.star {
  color: #d6dce4;
}

.star.active {
  color: #f59e0b;
}

.star:hover {
  color: #f59e0b;
}

.diary-comment-section {
  margin-top: 20px;
  padding-top: 18px;
  border-top: 1px solid #eee4da;
}

.diary-comment-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.diary-comment-head h3 {
  margin: 0;
  font-size: 16px;
  color: #2b1f14;
}

.diary-comment-head span {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(192, 120, 88, 0.1);
  color: #c07858;
  font-size: 12px;
  font-weight: 800;
}

.diary-comment-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.diary-comment-item {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 10px;
  border: 1px solid #eee4da;
  border-radius: 12px;
  background: #fffdf9;
}
.comment-row {
  display: flex;
  gap: 10px;
}

.diary-comment-avatar {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #ead2ae;
  color: #8b5b33;
  font-weight: 900;
}

.diary-comment-main {
  flex: 1;
  min-width: 0;
}

.diary-comment-line {
  display: flex;
  align-items: center;
  gap: 10px;
}

.diary-comment-line small,
.diary-comment-empty {
  color: #9d8a74;
  font-size: 12px;
}

.diary-comment-main p {
  margin: 4px 0 0;
  color: #5f4b38;
  line-height: 1.5;
}

.diary-comment-compose {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  margin-top: 12px;
}

.diary-comment-compose textarea {
  resize: vertical;
  min-height: 76px;
  border: 1px solid #dfd0c2;
  border-radius: 12px;
  padding: 10px;
  background: #fffaf4;
  color: #2b1f14;
  outline: none;
}

.diary-comment-compose button {
  align-self: end;
  min-height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: 12px;
  background: #c07858;
  color: #fff;
  font-weight: 900;
  cursor: pointer;
}

.diary-comment-compose button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 回复按钮 */
.comment-reply-btn { font-size: 11px; color: #8B4513; background: none; border: none; cursor: pointer; margin-left: auto; padding: 0 4px; flex-shrink: 0; }
.comment-reply-btn:hover { text-decoration: underline; }
.diary-comment-line { display: flex; align-items: center; gap: 6px; }
.diary-comment-line strong { flex-shrink: 0; }
.diary-comment-line small { color: #bbb; font-size: 11px; }

/* 回复区域 */
.comment-reply-area {
  margin: 4px 0 0 42px; padding: 8px 10px;
  background: #f7f1ea; border-radius: 8px;
}
.comment-reply-area.child {
  margin: 4px 0 0 0;
}
.comment-reply-area .reply-label {
  font-size: 11px; color: #a08060; margin-bottom: 4px;
}
.comment-reply-compose { display: flex; gap: 6px; align-items: center; }
.comment-reply-compose input { flex: 1; font-size: 12px; padding: 5px 8px; border: 1px solid #d4c5b5; border-radius: 6px; background: #fff; outline: none; }
.comment-reply-compose input:focus { border-color: #A0522D; }
.reply-send-btn { font-size: 12px; padding: 4px 12px; background: #8B4513; color: #fff; border: none; border-radius: 6px; cursor: pointer; }
.reply-cancel-btn { font-size: 12px; padding: 4px 8px; background: none; color: #999; border: none; cursor: pointer; }

.reply-to-label { font-size: 11px; color: #a08060; margin-bottom: 2px; }

/* 子回复列表 */
.reply-children {
  margin: 6px 0 2px 40px; padding: 6px 10px;
  background: #f8f4ef; border-radius: 8px;
}
.reply-child-item {
  padding: 4px 0;
}
.reply-child-item + .reply-child-item {
  border-top: 1px solid #ece3da; padding-top: 8px;
}
.diary-comment-avatar.small {
  width: 24px; height: 24px; font-size: 11px;
}
</style>

