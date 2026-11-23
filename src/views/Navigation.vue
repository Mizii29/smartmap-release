<template>
  <div class="navigation-container">
    <header class="topbar">
      <button class="topbar-brand" type="button" @click="switchMainTab('map')">
        <span class="brand-mark">🏮</span>
        <span class="brand-name">行摄天工</span>
        <small>SmartMap</small>
      </button>

      <nav class="topbar-nav" aria-label="主导航">
        <button class="tbn" :class="{ active: activeMainTab === 'map' }" type="button" @click="switchMainTab('map')">🗺️ 地图</button>
        <button class="tbn" :class="{ active: activeMainTab === 'trip' }" type="button" @click="switchMainTab('trip')">🧭 行程</button>
        <button class="tbn" :class="{ active: activeMainTab === 'discover' }" type="button" @click="switchMainTab('discover')">✨ 发现</button>
        <button class="tbn" type="button" @click="goToDiary">📖 日记</button>
        <button class="tbn profile-tab-btn" :class="{ active: activeMainTab === 'profile' }" type="button" @click="switchMainTab('profile')">
          <span v-if="hasUnreadNotifications" class="topbar-notification-dot" aria-hidden="true"></span>
          👤 我的
        </button>
      </nav>

      <div class="topbar-right">
        <button v-if="weatherData" class="tbr-btn" type="button" @click="showWeatherDetail = !showWeatherDetail">
          {{ weatherData.current.emoji }} {{ weatherData.current.temp }}°C {{ weatherCodeText(weatherData.current.code) }}
        </button>
        <button v-else class="tbr-btn" type="button" @click="locateMeOnMap">📍 定位</button>
        <div v-if="currentUser" class="tbr-user" @click="switchMainTab('profile')">
          <div class="tbr-avatar">
            <img v-if="isImageAvatar(profileAvatar)" :src="profileAvatar" alt="头像" />
            <span v-else>{{ currentUser.username.charAt(0) }}</span>
          </div>
          <button class="tbr-logout" type="button" @click.stop="handleLogout">退出</button>
        </div>
        <button v-else class="tbr-btn" type="button" @click="router.push('/login')">登录</button>
      </div>
    </header>

    <div class="app-body">
    <BaseMap ref="baseMapRef" class="map-area" @mapClick="handleMapClick" />

    <div v-if="activeMainTab === 'discover' || activeMainTab === 'profile'" class="page-screen"></div>

    <div v-if="activeMainTab === 'trip' && false" class="app-page app-page-journey">
      <div class="page-inner">
        <div class="page-header">
          <div>
            <h1>🧭 行程规划</h1>
            <p>把多位一体推荐、完整路线、旅拍服务和当前旅程状态整合到一个页面里。</p>
          </div>
          <div class="page-header-actions">
            <button class="page-action-btn primary" type="button" @click="fetchSmartItinerary">立即生成行程</button>

            <button class="page-action-btn" type="button" @click="activeMainTab = 'map'; panelOpen = true">返回地图规划</button>
          </div>
        </div>

        <div class="page-stat-grid">
          <div class="page-stat-card">
            <span class="stat-k">当前终点</span>
            <strong>{{ currentEnd?.name || '未选择' }}</strong>
            <small>{{ hasRoute ? '已生成路线，可直接开始旅程' : '先在下方选择风格或推荐方案' }}</small>
          </div>
          <div class="page-stat-card">
            <span class="stat-k">路线概览</span>
            <strong>{{ travelTimes?.distance?.toFixed(1) || '--' }} km</strong>
            <small>{{ travelTimes ? formatMinutes(activeTravelMinutes) : '尚未计算时间' }}</small>
          </div>
          <div class="page-stat-card">
            <span class="stat-k">交通方式</span>
            <strong>{{ activeTransportLabel }}</strong>
            <small>{{ hasRoute ? `途经点 ${waypoints.length} 个` : '切换方式后可重新规划' }}</small>
          </div>
          <div class="page-stat-card">
            <span class="stat-k">旅程状态</span>
            <strong>{{ journeyActive ? '进行中' : '未开始' }}</strong>
            <small>{{ journeyActive ? `${journeyStages.length} 个阶段` : '生成路线后可开始旅程' }}</small>
          </div>
        </div>

        <section class="page-card planner-card">
          <div class="section-head">
            <div>
              <h2>多位一体规划器</h2>
              <p>选择风格、景点数量和出发时间，直接对接你的推荐与行程接口。</p>
            </div>
            <div class="section-actions">
              <button class="page-chip-btn" type="button" @click="fetchStyleRecommendations">只看景点</button>
              <button class="page-chip-btn" type="button" @click="fetchPersonalRecommend">个性化</button>
            </div>
          </div>

          <div class="planner-grid">
            <div class="planner-block">
              <span class="planner-label">风格选择</span>
              <div class="planner-tags">
                <button
                  v-for="s in availableStyles"
                  :key="s"
                  class="planner-tag"
                  :class="{ active: selectedStyle === s }"
                  type="button"
                  @click="selectedStyle = s"
                >
                  {{ s }}
                </button>
              </div>
            </div>

            <div class="planner-block planner-inline">
              <div>
                <span class="planner-label">景点数量</span>
                <div class="planner-stepper">
                  <button type="button" @click="styleCount = Math.max(1, styleCount - 1)">−</button>
                  <strong>{{ styleCount }}</strong>
                  <button type="button" @click="styleCount = Math.min(8, styleCount + 1)">+</button>
                </div>
              </div>
              <div>
                <span class="planner-label">出发时间</span>
                <div class="planner-stepper">
                  <button type="button" @click="smartStartHour = Math.max(6, smartStartHour - 1)">−</button>
                  <strong>{{ smartStartHour }}:00</strong>
                  <button type="button" @click="smartStartHour = Math.min(22, smartStartHour + 1)">+</button>
                </div>
              </div>
              <div>
                <span class="planner-label">交通方式</span>
                <div class="planner-tags compact">
                  <button
                    v-for="opt in transportOptions"
                    :key="'journey-' + opt.value"
                    class="planner-tag"
                    :class="{ active: transportMode === opt.value }"
                    type="button"
                    @click="transportMode = opt.value"
                  >
                    {{ opt.icon }} {{ opt.label }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="planner-actions">
            <button class="page-action-btn primary" type="button" :disabled="!selectedStyle || styleLoading" @click="fetchSmartItinerary">
              {{ styleLoading ? '生成中...' : '生成完整行程' }}
            </button>
            <button class="page-action-btn" type="button" :disabled="!selectedStyle || styleLoading" @click="fetchStyleRecommendations">景点推荐</button>
            <button class="page-action-btn" type="button" :disabled="styleLoading" @click="fetchPersonalRecommend">个性化方案</button>
          </div>
        </section>

        <section v-if="smartItinerary" class="page-card">
          <div class="section-head">
            <div>
              <h2>智能行程结果</h2>
              <p>已对接 `/api/smartItinerary` 与多点路线规划。</p>
            </div>
            <div class="section-actions">
              <button class="page-chip-btn" type="button" @click="rerunSmartItinerary">重新搜索旅拍</button>
              <button v-if="hasRoute && !journeyActive" class="page-chip-btn strong" type="button" @click="openJourneySetup">开始旅程</button>
            </div>
          </div>

          <div v-if="smartItinerary.warning" class="page-alert">{{ smartItinerary.warning }}</div>
          <div class="timeline-list">
            <div v-for="(evt, idx) in smartItinerary.events" :key="'timeline-' + idx" class="timeline-row">
              <div class="timeline-time">{{ evt.startLabel }} - {{ evt.endLabel }}</div>
              <div class="timeline-content">
                <strong>{{ eventLabel(evt) }}</strong>
                <span>{{ evt.type === 'meal' ? '餐饮推荐' : evt.type === 'photo' ? '旅拍服务' : '景点游览' }}</span>
              </div>
              <div class="timeline-actions">
                <button v-if="evt.type === 'meal'" class="mini-action" type="button" @click="setFoodAsEnd(evt.data)">设为终点</button>
                <button v-if="evt.type === 'photo'" class="mini-action" type="button" @click="setServiceAsEnd(evt.data)">设为终点</button>
                <button v-if="evt.type !== 'spot'" class="mini-action danger" type="button" @click="removeSmartEvent(Number(idx))">移除</button>
              </div>
            </div>
          </div>
        </section>

        <div class="page-two-col">
          <section class="page-card">
            <div class="section-head">
              <div>
                <h2>风格推荐景点</h2>
                <p>点击卡片可直接规划路线或查看详情。</p>
              </div>
              <div class="section-actions">
                <button v-if="styleResults.length > 1" class="page-chip-btn" type="button" @click="applyFullStyleRoute">规划完整路线</button>
              </div>
            </div>

            <div v-if="styleResults.length === 0" class="page-empty">还没有风格推荐结果，先选择风格后生成。</div>
            <div v-else class="page-list">
              <div v-for="(poi, idx) in styleResults" :key="'style-page-' + poi.id" class="page-list-card" @click="applyStyleRoute(poi, idx)">
                <div class="page-list-main">
                  <strong>{{ poi.name }}</strong>
                  <span>{{ poi.style || selectedStyle }} · 热度 {{ poi.hotness }} · {{ poi.distance?.toFixed(1) || '--' }}km</span>
                </div>
                <div class="page-list-actions">
                  <button class="mini-action" type="button" @click.stop="openPoiDetail(poi)">详情</button>
                </div>
              </div>
            </div>
          </section>

          <section class="page-card">
            <div class="section-head">
              <div>
                <h2>个性化推荐</h2>
                <p>已改为对接后端个性化内容推荐接口。</p>
              </div>
            </div>

            <div v-if="personalMessage" class="page-tip">{{ personalMessage }}</div>
            <div v-if="personalPreferences.length > 0" class="planner-tags">
              <span v-for="p in personalPreferences" :key="'pref-' + p.style" class="planner-tag static">{{ p.style }} {{ (Number(p.weight || 0) * 100).toFixed(0) }}%</span>
            </div>
            <div v-if="personalResults.length === 0" class="page-empty">登录后可生成更贴合历史偏好的推荐。</div>
            <div v-else class="page-list">
              <div v-for="(poi, idx) in personalResults" :key="'personal-page-' + poi.id" class="page-list-card" @click="applyStyleRoute(poi, idx)">
                <div class="page-list-main">
                  <strong>{{ poi.name }}</strong>
                  <span>{{ poi.style || '未分类' }} · 热度 {{ poi.hotness }} · {{ poi.distance?.toFixed(1) || '--' }}km</span>
                </div>
                <div class="page-list-actions">
                  <button class="mini-action" type="button" @click.stop="openPoiDetail(poi)">详情</button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section v-if="journeyActive" class="page-card">
          <div class="section-head">
            <div>
              <h2>旅程进行中</h2>
              <p>当前阶段、时间线与轨迹日记入口都保留。</p>
            </div>
            <div class="section-actions">
              <button class="page-chip-btn" type="button" @click="openAIDiaryFromJourney">生成轨迹日记</button>
            </div>
          </div>
          <div class="journey-stage-grid">
            <div
              v-for="(stage, idx) in journeyStages"
              :key="'journey-stage-' + idx"
              class="journey-stage-card"
              :class="{ current: idx === currentStageIndex }"
            >
              <strong>{{ stage.name }}</strong>
              <span>{{ stage.timeLabel }}</span>
              <small>{{ stage.type === 'travel' ? `通行 ${stage.duration}h` : `停留 ${stage.duration}h` }}</small>
            </div>
          </div>
        </section>
      </div>
    </div>

    <div v-if="activeMainTab === 'discover'" class="app-page app-page-discover">
      <div class="discover-page-shell">
        <div class="discover-fixed-head">
          <header class="discover-hero">
            <div>
              <h1>✨ 发现</h1>
              <p>探索热门景点、美食与旅拍服务</p>
            </div>
            <button class="discover-refresh-btn" type="button" @click="refreshDiscoverPage">刷新发现页</button>
          </header>

          <div class="discover-search-wrap">
            <div class="discover-search-bar" :class="{ focus: searchFocused }">
              <span class="discover-search-icon">🔍</span>
              <input
                v-model="searchQuery"
                class="discover-search-input"
                type="search"
                placeholder="搜索景点、美食、旅拍服务..."
                @input="onSearchInput"
                @focus="searchFocused = true"
                @blur="onSearchBlur"
                @keydown.escape="searchFocused = false"
              />
              <span v-if="searchLoading" class="discover-search-loading">搜索中</span>
            </div>

            <div
              v-if="searchFocused && searchQuery.trim() && !searchLoading && (searchPoiResults.length > 0 || searchFoodResults.length > 0 || searchServiceResults.length > 0)"
              class="discover-search-dropdown"
            >
              <div v-if="searchPoiResults.length > 0" class="discover-search-group">
                <div class="discover-search-title">📍 景点</div>
                <button
                  v-for="poi in searchPoiResults"
                  :key="'discover-p' + poi.id"
                  class="discover-search-item"
                  type="button"
                  @mousedown.prevent="selectSearchPoi(poi)"
                >
                  <span>{{ poi.name }}</span>
                  <small>{{ poi.style || '景点' }}</small>
                </button>
              </div>
              <div v-if="searchFoodResults.length > 0" class="discover-search-group">
                <div class="discover-search-title">🍽️ 美食</div>
                <button
                  v-for="food in searchFoodResults"
                  :key="'discover-f' + food.id"
                  class="discover-search-item"
                  type="button"
                  @mousedown.prevent="selectSearchFood(food)"
                >
                  <span>{{ food.name }}</span>
                  <small>{{ food.cuisine || food.address || '美食' }}</small>
                </button>
              </div>
              <div v-if="searchServiceResults.length > 0" class="discover-search-group">
                <div class="discover-search-title">📸 旅拍服务</div>
                <button
                  v-for="svc in searchServiceResults"
                  :key="'discover-s' + svc.id"
                  class="discover-search-item"
                  type="button"
                  @mousedown.prevent="selectSearchService(svc)"
                >
                  <span>{{ svc.name }}</span>
                  <small>{{ getServiceTypeLabel(svc.type) }}</small>
                </button>
              </div>
            </div>
            <div v-if="searchFocused && searchQuery.trim() && searchPoiResults.length === 0 && searchFoodResults.length === 0 && searchServiceResults.length === 0 && !searchLoading" class="discover-search-empty">
              未找到相关结果
            </div>
          </div>

          <div class="discover-distance-anchor">
            <div>
              <span>距离基准</span>
              <strong>{{ discoverDistanceAnchorLabel }}</strong>
            </div>
            <p>在上方搜索并点选地点后，景点、美食和旅拍服务会按它附近重新排序。</p>
            <button class="discover-filter-btn slim" type="button" @click="useCurrentLocationAsDiscoverAnchor">用当前位置</button>
          </div>

          <nav class="discover-tabs" aria-label="发现页分区导航">
            <button
              v-for="tab in discoverSectionTabs"
              :key="tab.value"
              class="discover-tab-btn"
              :class="{ active: activeDiscoverSection === tab.value }"
              type="button"
              @click="scrollDiscoverSection(tab.value)"
            >
              {{ tab.label }}
            </button>
          </nav>
        </div>

        <div class="discover-scroll-body">
        <div v-if="discoverLoading" class="discover-empty">正在从数据库加载发现页数据...</div>
        <div v-else-if="discoverDataError" class="discover-empty">{{ discoverDataError }}</div>

        <section ref="discoverSpotsRef" class="discover-section discover-spots-section">
          <div class="discover-section-head">
            <div>
              <h2>🏯 热门景点</h2>
              <p>来自推荐接口，可点击卡片查看详情、评价、收藏，并设为终点。</p>
            </div>
            <div class="discover-filter-row">
              <button
                class="discover-filter-btn"
                :class="{ active: activeDiscoverSpotSort === 'distance' }"
                type="button"
                @click="setDiscoverSpotSort('distance')"
              >
                按距离
              </button>
              <button
                class="discover-filter-btn"
                :class="{ active: activeDiscoverSpotSort === 'hotness' }"
                type="button"
                @click="setDiscoverSpotSort('hotness')"
              >
                按热度
              </button>
            </div>
          </div>
          <div v-if="discoverSpotItems.length === 0" class="discover-empty">暂无景点数据，请检查后端数据库是否已有景点记录。</div>
          <div v-else class="discover-spot-grid">
            <article
              v-for="item in discoverSpotItems"
              :key="item.uid"
              class="discover-spot-card"
              @click="openDiscoverDetail(item)"
            >
              <div class="spot-cover" :class="item.coverClass">
                <span>{{ item.icon }}</span>
              </div>
              <div class="spot-card-body">
                <div class="spot-title-row">
                  <h3>{{ item.name }}</h3>
                  <button
                    class="discover-fav-btn"
                    :class="{ active: isDiscoverFavorite(item) }"
                    type="button"
                    @click.stop="toggleDiscoverFavorite(item)"
                    :aria-label="isDiscoverFavorite(item) ? '取消收藏' : '收藏'"
                    :title="isDiscoverFavorite(item) ? '取消收藏' : '收藏'"
                  >
                    {{ isDiscoverFavorite(item) ? '★' : '☆' }}
                  </button>
                </div>
                <div class="spot-meta-line">
                  <span v-for="tag in item.tags.slice(0, 2)" :key="tag">{{ tag }}</span>
                  <span>⭐ {{ (item.rating ? item.rating.toFixed(1) : '暂无评分') }}</span>
                  <span>{{ formatDiscoverDistance(item.distance) }}</span>
                </div>
                <div class="spot-hot-line">🔥 热度 {{ Math.round(item.hotness) }}</div>
                <div class="spot-card-actions">
                  <button class="discover-primary-mini" type="button" @click.stop="addDiscoverItemToJourney(item)">📋 加入行程</button>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section ref="discoverFoodsRef" class="discover-section discover-foods-section">
          <div class="discover-section-head">
            <div>
              <h2>🍽️ 美食推荐</h2>
              <p>按菜系和排序筛选，支持设为终点、大众点评、评价和收藏。</p>
            </div>
            <button class="discover-filter-btn" type="button" @click="fetchFoodRecommendations">刷新美食</button>
          </div>
          <div class="discover-filter-stack">
            <div class="discover-filter-row">
              <button
                v-for="cuisine in discoverFoodCuisines"
                :key="cuisine"
                class="discover-filter-btn pill"
                :class="{ active: activeFoodCuisine === cuisine }"
                type="button"
                @click="setDiscoverFoodCuisine(cuisine)"
              >
                {{ cuisine }}
              </button>
            </div>
            <div class="discover-filter-row">
              <button
                v-for="sort in discoverFoodSortOptions"
                :key="sort.value"
                class="discover-filter-btn slim"
                :class="{ active: activeFoodSort === sort.value }"
                type="button"
                @click="setDiscoverFoodSort(sort.value)"
              >
                {{ sort.label }}
              </button>
            </div>
          </div>
          <div v-if="filteredDiscoverFoodItems.length === 0" class="discover-empty">暂无美食数据，请检查 foods 表或点击“刷新美食”重新加载。</div>
          <div v-else class="discover-food-grid">
            <article
              v-for="item in filteredDiscoverFoodItems"
              :key="item.uid"
              class="discover-food-card"
              @click="openDiscoverDetail(item)"
            >
              <div class="food-icon-box">{{ item.icon }}</div>
              <div class="food-card-main">
                <div class="food-title-row">
                  <h3>{{ item.name }} <span>⭐ {{ (item.rating ? item.rating.toFixed(1) : '暂无评分') }}</span></h3>
                  <button
                    class="discover-fav-btn"
                    :class="{ active: isDiscoverFavorite(item) }"
                    type="button"
                    @click.stop="toggleDiscoverFavorite(item)"
                    :aria-label="isDiscoverFavorite(item) ? '取消收藏' : '收藏'"
                    :title="isDiscoverFavorite(item) ? '取消收藏' : '收藏'"
                  >
                    {{ isDiscoverFavorite(item) ? '★' : '☆' }}
                  </button>
                </div>
                <div class="food-meta-line">
                  <span>{{ item.cuisine || '美食' }}</span>
                  <span>{{ item.price || '价格待定' }}</span>
                  <span>{{ formatDiscoverDistance(item.distance) }}</span>
                </div>
                <p>{{ item.address || '地址待补充' }}</p>
                <div class="food-card-actions">
                  <button class="discover-primary-mini" type="button" @click.stop="addDiscoverItemToJourney(item)">📋 加入行程</button>
                  <a
                    v-if="item.dianpingUrl"
                    class="discover-secondary-mini"
                    :href="item.dianpingUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    @click.stop
                  >
                    大众点评 ↗
                  </a>
                  <button v-else class="discover-secondary-mini" type="button" disabled @click.stop>暂无点评</button>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section ref="discoverServicesRef" class="discover-section discover-services-section">
          <div class="discover-section-head">
            <div>
              <h2>📸 旅拍服务</h2>
              <p>摄影师、妆娘、无人机和服装租赁集中展示，支持路线规划。</p>
            </div>
            <button class="discover-filter-btn" type="button" @click="fetchTravelServices">刷新服务</button>
          </div>
          <div class="discover-filter-row">
            <button
              v-for="type in discoverServiceTypes"
              :key="type.value"
              class="discover-filter-btn pill"
              :class="{ active: activeServiceType === type.value }"
              type="button"
              @click="activeServiceType = type.value"
            >
              {{ type.label }}
            </button>
          </div>
          <div v-if="filteredDiscoverServiceItems.length === 0" class="discover-empty">暂无旅拍服务数据，请检查 travel_services 表或点击“刷新服务”重新加载。</div>
          <div v-else class="discover-service-grid">
            <article
              v-for="item in filteredDiscoverServiceItems"
              :key="item.uid"
              class="discover-service-card"
              @click="openDiscoverDetail(item)"
            >
              <div class="service-title-row">
                <div class="service-icon-box">{{ item.icon }}</div>
                <button
                  class="discover-fav-btn"
                  :class="{ active: isDiscoverFavorite(item) }"
                  type="button"
                  @click.stop="toggleDiscoverFavorite(item)"
                  :aria-label="isDiscoverFavorite(item) ? '取消收藏' : '收藏'"
                  :title="isDiscoverFavorite(item) ? '取消收藏' : '收藏'"
                >
                  {{ isDiscoverFavorite(item) ? '★' : '☆' }}
                </button>
              </div>
              <h3>{{ item.name }}</h3>
              <p>{{ item.description }}</p>
              <div class="service-meta-line">
                <span>⭐ {{ (item.rating ? item.rating.toFixed(1) : '暂无评分') }}</span>
                <span>🔥 热度 {{ Math.round(item.hotness) }}</span>
                <span>{{ formatDiscoverDistance(item.distance) }}</span>
              </div>
              <div class="service-card-actions">
                <button class="discover-secondary-mini" type="button" @click.stop="addDiscoverItemToJourney(item)">📋 加入行程</button>
              </div>
            </article>
          </div>
        </section>
        </div>
      </div>
    </div>

    <div v-if="activeMainTab === 'profile'" class="app-page app-page-profile">
      <div class="page-inner profile-page-inner">
        <div class="page-header profile-page-header">
          <div>
            <h1>👤 个人中心</h1>
            <p>管理你的旅程与偏好</p>
          </div>
        </div>

        <section class="page-card profile-hero-card">
          <div class="profile-avatar">
            <img v-if="isImageAvatar(profileAvatar)" :src="profileAvatar" alt="头像" />
            <span v-else>{{ profileAvatar }}</span>
          </div>
          <div class="profile-copy">
            <h2>{{ currentUser?.username || '游客模式' }}</h2>
            <p>
              {{ weatherData?.current?.emoji || '🏮' }} 旅行爱好者 ·
              {{ journeyActive ? '1 个进行中' : '暂无进行中' }}
            </p>
          </div>
        </section>

        <div class="profile-menu-grid">
          <button class="profile-menu-card" type="button" @click="openProfilePreference">
            <span class="profile-menu-icon">⭐</span>
            <strong>我的偏好</strong>
            <small>风格权重 · 访问历史 · 推荐依据</small>
          </button>
          <button class="profile-menu-card" type="button" @click="openProfileSettings">
            <span class="profile-menu-icon">⚙️</span>
            <strong>账号设置</strong>
            <small>个人信息 · 密码</small>
          </button>
          <button class="profile-menu-card" type="button" @click="handleLogout">
            <span class="profile-menu-icon">🚪</span>
            <strong>退出登录</strong>
            <small>返回登录/注册页面</small>
          </button>
        </div>

        <!-- 通知模块 -->
        <section v-if="currentUser" class="page-card notification-section" :class="{ 'has-unread': hasUnreadNotifications }">
          <span v-if="hasUnreadNotifications" class="notification-section-dot" aria-hidden="true"></span>
          <div class="notification-header">
            <h3>
              🔔 通知
              <em v-if="unreadNotificationCount > 0">{{ unreadNotificationCount }} 条未读</em>
            </h3>
            <div class="notification-actions">
              <button v-if="notifications.length > 0" class="notif-read-all" type="button" @click="markAllNotificationsRead">全部已读</button>
              <button class="notif-refresh-btn" type="button" @click="fetchNotifications">🔄</button>
            </div>
          </div>

          <div v-if="notifications.length === 0" class="notif-empty">
            暂无通知
          </div>

          <div v-else class="notif-list">
            <article
              v-for="notif in notifications"
              :key="notif.id"
              class="notif-item"
              :class="{ 'notif-unread': !notif.is_read }"
              role="button"
              tabindex="0"
              @click="openNotificationDetail(notif)"
              @keydown.enter.prevent="openNotificationDetail(notif)"
            >
              <span v-if="!notif.is_read" class="notif-card-dot" aria-hidden="true"></span>
              <div class="notif-icon">
                {{ notificationIcon(notif) }}
              </div>
              <div class="notif-body">
                <div class="notif-text">
                  <strong>{{ notif.actor_name }}</strong>
                  <span>{{ notificationActionText(notif) }}</span>
                  <span class="notif-diary-title">《{{ notif.diary_title }}》</span>
                </div>
                <div v-if="notif.comment_text" class="notif-comment">
                  <p>{{ notif.comment_text }}</p>
                </div>
                <div class="notif-meta">
                  <span class="notif-time">{{ formatNotificationTime(notif.created_at) }}</span>
                </div>
              </div>
              <button class="notif-open-btn" type="button" @click.stop="openNotificationDetail(notif)">查看详情</button>
            </article>
          </div>
        </section>

      </div>
    </div>



    <div v-if="selectedNotification" class="modal-overlay notification-detail-overlay" @click.self="closeNotificationDetail">
      <div class="notification-detail-card">
        <div class="notification-detail-head">
          <div>
            <span class="notification-detail-icon">{{ notificationIcon(selectedNotification) }}</span>
            <h3>{{ notificationDetailTitle(selectedNotification) }}</h3>
            <p>{{ formatNotificationTime(selectedNotification.created_at) }}</p>
          </div>
          <button class="close-btn" type="button" @click="closeNotificationDetail">✕</button>
        </div>

        <div class="notification-detail-body">
          <div class="notification-detail-line">
            <span>来源日记</span>
            <strong>《{{ selectedNotification.diary_title || '日记已删除' }}》</strong>
          </div>
          <div class="notification-detail-line">
            <span>互动用户</span>
            <strong>{{ selectedNotification.actor_name || '旅者' }}</strong>
          </div>
          <div v-if="selectedNotification.comment_text" class="notification-detail-comment">
            <span>{{ selectedNotification.type === 'reply' ? '回复内容' : '评论内容' }}</span>
            <p>{{ selectedNotification.comment_text }}</p>
          </div>

          <div v-if="canReplyNotification(selectedNotification)" class="notification-detail-reply">
            <label>回复</label>
            <textarea
              v-model="replyDraft"
              rows="3"
              maxlength="500"
              placeholder="写下你的回复..."
            ></textarea>
            <div class="notification-detail-actions">
              <button class="profile-modal-action" type="button" @click="openNotificationDiary">去日记页</button>
              <button class="profile-modal-action primary" type="button" :disabled="!replyDraft.trim()" @click="submitNotificationReply(selectedNotification)">发送回复</button>
            </div>
          </div>
          <div v-else class="notification-detail-actions">
            <button class="profile-modal-action primary" type="button" @click="openNotificationDiary">去日记页</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showProfileSettingsModal" class="modal-overlay" @click.self="showProfileSettingsModal = false">
      <div class="profile-modal-card">
        <div class="profile-modal-head">
          <h3>⚙️ 账号设置</h3>
          <button class="close-btn" type="button" @click="showProfileSettingsModal = false">✕</button>
        </div>
        <div class="profile-settings-form">
          <div class="profile-settings-avatar-row">
            <span>头像</span>
            <div class="profile-avatar-upload">
              <div class="profile-avatar-preview">
                <img v-if="isImageAvatar(profileAvatarPreview)" :src="profileAvatarPreview" alt="头像预览" />
                <span v-else>{{ profileAvatarPreview }}</span>
              </div>
              <label class="profile-avatar-upload-btn">
                <input type="file" accept="image/*" @change="handleProfileAvatarChange" />
                <span>上传图片</span>
              </label>
            </div>
          </div>
          <label>
            <span>昵称</span>
            <input v-model="profileSettings.nickname" maxlength="128" placeholder="输入昵称" />
          </label>
          <label>
            <span>新密码</span>
            <input v-model="profileSettings.password" type="password" maxlength="128" placeholder="可选，留空则不修改" />
          </label>
          <label>
            <span>确认密码</span>
            <input v-model="profileSettings.confirmPassword" type="password" maxlength="128" placeholder="再次输入新密码" />
          </label>
          <p v-if="profileSettingsMessage" class="profile-settings-message">{{ profileSettingsMessage }}</p>
          <button class="profile-modal-primary" type="button" @click="saveProfileSettings">保存设置</button>
        </div>
      </div>
    </div>

    <div v-if="showProfilePreferenceModal" class="modal-overlay" @click.self="showProfilePreferenceModal = false">
      <div class="profile-modal-card profile-preference-modal">
        <div class="profile-modal-head">
          <h3>⭐ 我的偏好</h3>
          <button class="close-btn" type="button" @click="showProfilePreferenceModal = false">✕</button>
        </div>
        <div class="profile-preference-picker">
          <button
            v-for="group in profilePreferenceGroups"
            :key="'pref-tab-' + group.key"
            class="profile-preference-tab"
            :class="{ active: activeProfilePreferenceGroup === group.key }"
            type="button"
            @click="activeProfilePreferenceGroup = group.key"
          >
            <span>{{ group.label }}</span>
            <small>{{ group.items.length }}</small>
          </button>
        </div>
        <div class="profile-preference-kind-tabs">
          <button
            v-for="kind in profilePreferenceKinds"
            :key="'pref-kind-' + kind.value"
            class="profile-preference-kind"
            :class="{ active: activeProfilePreferenceKind === kind.value }"
            type="button"
            @click="activeProfilePreferenceKind = kind.value"
          >
            {{ kind.label }}
          </button>
        </div>
        <div class="profile-preference-content">
          <div v-if="filteredProfilePreferenceItems.length === 0" class="profile-modal-empty compact">
            暂无{{ activeProfilePreferenceKind === 'all' ? '' : activeProfilePreferenceKind }}记录。
          </div>
          <div v-else class="profile-preference-list">
            <article
              v-for="item in filteredProfilePreferenceItems"
              :key="activeProfilePreferenceGroup + item.id + item.kind"
              class="profile-preference-row"
            >
              <span>{{ item.icon }}</span>
              <div>
                <strong>{{ item.name }}</strong>
                <small>{{ item.kind }} · {{ item.meta }}</small>
              </div>
            </article>
          </div>
        </div>
      </div>
    </div>

    <div v-if="activeMainTab === 'map' || activeMainTab === 'trip'" class="map-tools">
      <button class="map-tool" type="button" title="定位" @click="locateMeOnMap">📍</button>
      <button class="map-tool" type="button" title="打开面板" @click="panelOpen = true">☰</button>
      <button class="map-tool" type="button" title="天气" @click="showWeatherDetail = !showWeatherDetail">☀️</button>
    </div>

    <div v-if="(activeMainTab === 'map' || activeMainTab === 'trip') && (hasRoute || travelTimes)" class="route-bar" :class="{ 'panel-offset': panelOpen }">
      <div class="rs-item">
        <div class="rs-n">{{ travelTimes?.distance?.toFixed(1) || '--' }} <small>km</small></div>
        <div class="rs-l">总距离</div>
      </div>
      <div class="rs-d"></div>
      <div class="rs-item">
        <div class="rs-n">{{ travelTimes ? formatMinutes(activeTravelMinutes) : '--' }}</div>
        <div class="rs-l">{{ activeTransportLabel }}</div>
      </div>
      <div class="rs-d"></div>
      <div class="rs-item">
        <div class="rs-n">{{ waypoints.length }}</div>
        <div class="rs-l">途经点</div>
      </div>
      <div class="rs-d"></div>
      <div class="rs-item route-end">
        <div class="rs-n">{{ currentEnd?.name || '未选择终点' }}</div>
        <div class="rs-l">当前终点</div>
      </div>
    </div>

    <div v-if="activeMainTab === 'map' || activeMainTab === 'trip'" class="map-bottom" :class="{ 'panel-offset': panelOpen }">
      <button
        v-for="opt in transportOptions"
        :key="'bottom-' + opt.value"
        class="mapb-btn"
        :class="{ active: transportMode === opt.value }"
        type="button"
        @click="transportMode = opt.value"
      >
        {{ opt.icon }} {{ opt.label }}
      </button>
      <div class="mapb-d"></div>
      <button class="mapb-btn" type="button" @click="openPoiSearchModal">➕ 途经点</button>
    </div>

    <button v-if="activeMainTab === 'map' || activeMainTab === 'trip'" class="jf-fab" type="button" title="开始行程" @click="switchMainTab('trip')">🏮</button>
    <div v-if="activeMainTab === 'map' || activeMainTab === 'trip'" class="panel-backdrop" :class="{ show: panelOpen }" @click="panelOpen = false"></div>

    <div v-if="(activeMainTab === 'map' || activeMainTab === 'trip') && hasRoute && !journeyActive" class="start-journey-btn" @click="openJourneySetup">
      🏮 开始旅程
    </div>

    <div v-if="activeMainTab === 'map' || activeMainTab === 'trip'" class="sidebar" :class="{ open: panelOpen }">
      <div class="panel-hd">
        <h2>{{ panelView === 'trip' ? '🧭 行程' : '📍 推荐景点' }}</h2>
        <button class="ph-close" type="button" @click="panelOpen = false">✕</button>
      </div>
      <div class="user-bar">
        <span class="user-name">👤 {{ currentUser?.username || '用户' }}</span>
        <button @click="handleLogout" class="logout-btn">退出</button>
        <span v-if="weatherData" class="weather-badge" @click="showWeatherDetail = !showWeatherDetail" title="点击查看天气详情">
          {{ weatherData.current.emoji }} {{ weatherData.current.temp }}°C
        </span>
      </div>

      <template v-if="panelView === 'map'">
      <h2>智能旅拍规划</h2>

      <!-- 统一搜索栏 -->
      <div class="search-bar-container">
        <div class="search-bar" :class="{ 'search-bar-focus': searchFocused }">
          <span class="search-icon">🔍</span>
          <input
            v-model="searchQuery"
            @input="onSearchInput"
            @focus="searchFocused = true"
            @blur="onSearchBlur"
            @keydown.escape="searchFocused = false"
            placeholder="搜索景点、美食、妆娘、摄影师..."
            class="search-input"
          />
          <span v-if="searchQuery && !searchLoading" class="search-clear" @click="clearSearch">✕</span>
          <span v-if="searchLoading" class="search-loading-spin">⏳</span>
        </div>
        <div
          v-if="searchFocused && searchQuery.trim() && !searchLoading && (searchPoiResults.length > 0 || searchFoodResults.length > 0 || searchServiceResults.length > 0)"
          class="search-dropdown"
        >
          <div v-if="searchPoiResults.length > 0" class="search-group">
            <div class="search-group-title">📍 景点</div>
            <div
              v-for="poi in searchPoiResults"
              :key="'p' + poi.id"
              class="search-item"
              @mousedown.prevent="selectSearchPoi(poi)"
            >
              <span class="search-item-name">{{ poi.name }}</span>
              <span v-if="poi.style" class="search-item-tag">{{ poi.style }}</span>
              <span class="search-item-hot">{{ poi.hotness }}</span>
            </div>
          </div>
          <div v-if="searchFoodResults.length > 0" class="search-group">
            <div class="search-group-title">🍽️ 美食</div>
            <div
              v-for="food in searchFoodResults"
              :key="'f' + food.id"
              class="search-item"
              @mousedown.prevent="selectSearchFood(food)"
            >
              <span class="search-item-name">{{ food.name }}</span>
              <span class="search-item-cuisine">{{ food.cuisine }}</span>
              <span class="search-item-addr" v-if="food.address">· {{ food.address }}</span>
            </div>
          </div>
          <div v-if="searchServiceResults.length > 0" class="search-group">
            <div class="search-group-title">🛎️ 旅拍服务</div>
            <div
              v-for="svc in searchServiceResults"
              :key="'s' + svc.id"
              class="search-item"
              @mousedown.prevent="selectSearchService(svc)"
            >
              <span class="search-item-name">{{ svc.name }}</span>
              <span class="search-item-addr">
                {{ getServiceTypeLabel(svc.type) }}
              </span>
              <span class="search-item-hot">{{ svc.hotness }}</span>
            </div>
          </div>
        </div>
        <div v-if="searchFocused && searchQuery.trim() && searchPoiResults.length === 0 && searchFoodResults.length === 0 && searchServiceResults.length === 0 && !searchLoading" class="search-empty">
          未找到相关结果
        </div>
      </div>

      <!-- 交通方式选择 -->
      <div class="transport-mode-selector">
        <span class="transport-label">交通方式</span>
        <div class="transport-options">
          <button
            v-for="opt in transportOptions"
            :key="opt.value"
            class="transport-btn"
            :class="{ active: transportMode === opt.value }"
            @click="transportMode = opt.value"
            :title="opt.desc"
          >
            <span class="transport-icon">{{ opt.icon }}</span>
            <span class="transport-name">{{ opt.label }}</span>
            <span class="transport-speed">{{ opt.speed }}km/h</span>
          </button>
        </div>
        <!-- 三种方式预计时间 -->
        <div v-if="travelTimes" class="travel-times-panel">
          <div class="time-row" :class="{ active: transportMode === 'driving' }" @click="transportMode = 'driving'">
            <span class="time-icon">🚗</span>
            <span class="time-label">驾车</span>
            <span class="time-value">{{ formatMinutes(travelTimes.driving) }}</span>
          </div>
          <div class="time-row" :class="{ active: transportMode === 'cycling' }" @click="transportMode = 'cycling'">
            <span class="time-icon">🚲</span>
            <span class="time-label">骑车</span>
            <span class="time-value">{{ formatMinutes(travelTimes.cycling) }}</span>
          </div>
          <div class="time-row" :class="{ active: transportMode === 'walking' }" @click="transportMode = 'walking'">
            <span class="time-icon">🚶</span>
            <span class="time-label">步行</span>
            <span class="time-value">{{ formatMinutes(travelTimes.walking) }}</span>
          </div>
        </div>
      </div>

      <div class="location-info">
        <span class="label">起点</span>
        <span class="coords">{{ userLocation.lat.toFixed(4) }}, {{ userLocation.lng.toFixed(4) }}</span>
      </div>

      <div class="btn-group">
        <button :class="{ active: activeRecommendationDrawer === 'nearby' && lastRecommendSort === 'distance' }" @click="fetchRecommendations('distance')">📍 按距离推荐</button>
        <button :class="{ active: activeRecommendationDrawer === 'nearby' && lastRecommendSort === 'hotness' }" @click="fetchRecommendations('hotness')">🔥 按热度推荐</button>
        <button :class="{ active: activeRecommendationDrawer === 'style' }" @click="openStyleRecommend" class="style-btn">🧭 多位一体推荐</button>
        <button :class="{ active: activeRecommendationDrawer === 'personal' }" @click="fetchPersonalRecommend" class="personal-btn">⭐ 个性化推荐</button>
        <button :class="{ active: activeRecommendationDrawer === 'food' }" @click="fetchFoodRecommendations" class="food-btn">🍽️ 美食推荐</button>
        <button :class="{ active: activeRecommendationDrawer === 'service' }" @click="fetchTravelServices" class="service-btn">📸 旅拍服务</button>
      </div>

      <div v-if="showStylePanel" class="style-panel">
        <div class="style-panel-header">
          <span class="style-panel-title">🧭 多位一体推荐</span>
          <button class="style-panel-close" @click="showStylePanel = false">✕</button>
        </div>
        <div class="style-tags">
          <button
            v-for="s in availableStyles"
            :key="s"
            :class="['style-tag', { 'style-tag-active': selectedStyle === s }]"
            @click="selectedStyle = s"
          >{{ s }}</button>
        </div>
        <div class="style-count-row">
          <span class="style-count-label">景点数量</span>
          <div class="style-count-ctrl">
            <button class="style-count-btn" @click="styleCount = Math.max(1, styleCount - 1)">−</button>
            <span class="style-count-val">{{ styleCount }}</span>
            <button class="style-count-btn" @click="styleCount = Math.min(8, styleCount + 1)">+</button>
          </div>
        </div>
        <div class="style-count-row">
          <span class="style-count-label">出发时间</span>
          <div class="style-count-ctrl">
            <button class="style-count-btn" @click="smartStartHour = Math.max(6, smartStartHour - 1)">−</button>
            <span class="style-count-val">{{ smartStartHour }}:00</span>
            <button class="style-count-btn" @click="smartStartHour = Math.min(22, smartStartHour + 1)">+</button>
          </div>
        </div>
        <button
          class="style-go-btn"
          :disabled="!selectedStyle || styleLoading"
          @click="fetchSmartItinerary"
        >
          {{ styleLoading ? '推荐中...' : '🧭 开始多位一体推荐' }}
        </button>
        <button
          class="style-secondary-btn"
          :disabled="!selectedStyle || styleLoading"
          @click="fetchStyleRecommendations"
        >
          仅推荐景点
        </button>
      </div>

      </template>

      <div v-if="panelView === 'map' && hasRoute" class="waypoint-section">
        <div class="waypoint-title">途经点管理</div>
        <div class="waypoint-btns">
          <button class="wp-btn" @click="addWaypointMode = true">➕ 增加途经点</button>
          <button class="wp-btn" @click="openPoiSearchModal">🏞️ 增加途经景点</button>
        </div>
        <div v-if="addWaypointMode" class="waypoint-hint">
          点击地图选择途经点位置...
          <button class="wp-cancel" @click="addWaypointMode = false">取消</button>
        </div>
        <div v-if="waypoints.length > 0" class="waypoint-list">
          <div
            v-for="(wp, idx) in waypoints"
            :key="idx"
            class="waypoint-item"
          >
            <span class="wp-label">{{ wp.type === 'poi' ? '途经景点' : '途经点' }}{{ idx + 1 }}</span>
            <span class="wp-name">{{ wp.name || `(${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)})` }}</span>
            <button class="wp-del" @click="removeWaypoint(idx)">✕</button>
          </div>
          <button class="replan-btn" @click="replanMultiRoute">🔄 重新规划路线</button>
        </div>
      </div>

      <div v-if="panelView === 'map' && nearbyFoods.length > 0" class="food-list nearby-food-list">
        <div class="food-list-title">📍 附近美食推荐</div>
        <button class="food-list-close" @click="nearbyFoods = []">✕</button>
        <div
          v-for="food in nearbyFoods"
          :key="'nf' + food.id"
          class="food-item"
          @click="flyToFood(food)"
        >
          <div class="food-header">
            <span class="food-name">{{ food.name }}</span>
            <span class="food-rating">⭐ {{ food.rating }}</span>
          </div>
          <div class="food-meta">
            <span class="food-cuisine">{{ food.cuisine }}</span>
            <span class="food-style-tag" v-if="food.style">{{ food.style }}</span>
            <span class="food-dist">{{ food.distance }}km</span>
            <span class="food-price">{{ food.avg_price ? '¥' + food.avg_price + '/人' : '' }}</span>
          </div>
          <div class="food-actions">
            <button class="food-set-end-btn" @click.stop="setFoodAsEnd(food)">📍 设为终点</button>
            <a v-if="food.dianpingUrl" :href="food.dianpingUrl" target="_blank" rel="noopener noreferrer" class="food-dp-link" @click.stop>去大众点评查看 ↗</a>
          </div>
        </div>
      </div>

      <div v-if="panelView === 'map'" class="status-panel" v-html="statusMessage"></div>

      <div v-if="panelView === 'map'" class="sidebar-spacer"></div>

      <router-link v-if="panelView === 'trip'" class="page-action-btn" to="/planner">地图选点与手动排期</router-link>
      <div v-if="panelView === 'trip' && itineraryItems.length === 0" class="itinerary-empty-standalone">
        <div class="itinerary-empty-box">
          <div class="itinerary-empty-icon">🧭</div>
          <div class="itinerary-empty-text">尚未添加行程</div>
          <div class="itinerary-empty-hint">去发现页加入景点、美食或旅拍吧！</div>
        </div>
      </div>

      <div v-if="panelView === 'trip' && itineraryItems.length > 0" class="itinerary-panel">
        <div class="panel-header">
          <span>🗺️ 我的行程（{{ itineraryItems.length }}）</span>
        </div>
        <div class="itinerary-list">
          <div
            v-for="(item, idx) in itineraryItems"
            :key="item.id"
            class="itinerary-item"
            draggable="true"
            @dragstart="onItineraryDragStart($event, idx)"
            @dragover.prevent="onItineraryDragOver($event, idx)"
            @dragend="onItineraryDragEnd"
          >
            <div class="itinerary-drag-handle" title="拖动排序">
              <span class="itinerary-drag-icon">⠿</span>
              <span class="itinerary-order">{{ idx + 1 }}</span>
            </div>
            <div class="itinerary-icon-box">{{ item.icon }}</div>
            <div class="itinerary-info">
              <div class="itinerary-name">
                {{ item.name }}
                <span v-if="visitedItineraryNames.includes(item.name)" class="visited-badge">已游览</span>
              </div>
              <div class="itinerary-tags">
                <span v-for="tag in item.tags.slice(0, 2)" :key="tag">{{ tag }}</span>
              </div>
            </div>
            <div class="itinerary-duration">
              <label>停留</label>
              <select v-model="item.duration" @change="syncItineraryDurations">
                <option v-for="h in [1,2,3,4]" :key="h" :value="h">{{ h }}h</option>
              </select>
            </div>
            <button class="itinerary-remove" @click="removeItineraryItem(idx)" title="移除">✕</button>
          </div>
        </div>
        <button
          v-if="itineraryItems.length > 1"
          class="itinerary-start-btn"
          type="button"
          @click="startItineraryJourney"
        >
          🚀 开始旅程
        </button>
      </div>

    </div>

    <Transition name="recommend-drawer">
      <aside
        v-if="recommendationDrawerVisible"
        class="recommend-drawer"
        :class="'recommend-drawer-' + activeRecommendationDrawer"
      >
        <header class="recommend-drawer-head">
          <div>
            <span class="recommend-drawer-kicker">{{ recommendationDrawerKicker }}</span>
            <h3>{{ recommendationDrawerTitle }}</h3>
            <p>{{ recommendationDrawerSubtitle }}</p>
          </div>
          <button class="recommend-drawer-close" type="button" @click="closeRecommendationDrawer">✕</button>
        </header>

        <div class="recommend-drawer-body">
          <template v-if="activeRecommendationDrawer === 'nearby'">
            <div v-if="recommendedPois.length === 0" class="recommend-empty">还没有推荐结果，点击左侧距离或热度推荐生成。</div>
            <article
              v-for="poi in recommendedPois"
              :key="'drawer-poi-' + poi.id"
              class="recommend-poi-card"
              @click="openPoiDetail(poi)"
            >
              <span class="recommend-dot">📍</span>
              <div>
                <strong>{{ poi.name }}</strong>
                <span>{{ poi.style || '景点' }} · 热度 {{ poi.hotness }} · {{ formatMaybeDistance(poi.distance) }}</span>
              </div>
              <button class="recommend-mini-btn" type="button" @click.stop="selectPoiAsEnd(poi)">设为终点</button>
            </article>
          </template>

          <template v-else-if="activeRecommendationDrawer === 'style'">
            <div v-if="styleResults.length === 0" class="recommend-empty">先在左侧选择风格和数量，再生成多位一体推荐。</div>
            <article
              v-for="(poi, idx) in styleResults"
              :key="'drawer-style-' + poi.id"
              class="recommend-poi-card"
              @click="applyStyleRoute(poi, idx)"
            >
              <span class="style-route-idx">{{ idx + 1 }}</span>
              <div>
                <strong>{{ poi.name }}</strong>
                <span>{{ poi.style || selectedStyle }} · 热度 {{ poi.hotness }} · {{ poi.distance?.toFixed(1) || '--' }}km</span>
              </div>
              <button class="recommend-mini-btn" type="button" @click.stop="openPoiDetail(poi)">详情</button>
            </article>
            <button v-if="styleResults.length > 1" class="recommend-route-btn" type="button" @click="applyFullStyleRoute">🗺️ 规划完整路线</button>
          </template>

          <template v-else-if="activeRecommendationDrawer === 'personal'">
            <div v-if="personalMessage" class="personal-message">{{ personalMessage }}</div>
            <div v-if="personalPreferences.length > 0" class="personal-pref-tags">
              <span v-for="p in personalPreferences" :key="'drawer-pref-' + p.style" class="personal-pref-tag">
                {{ p.style }} <small>{{ (Number(p.weight || 0) * 100).toFixed(0) }}%</small>
              </span>
            </div>
            <div v-if="personalResults.length === 0" class="recommend-empty">登录并浏览、点赞或收藏内容后，会在这里看到按偏好展开的推荐。</div>
            <article
              v-for="(poi, idx) in personalResults"
              :key="'drawer-personal-' + poi.id"
              class="recommend-poi-card"
              @click="applyStyleRoute(poi, idx)"
            >
              <span class="style-route-idx">{{ idx + 1 }}</span>
              <div>
                <strong>{{ poi.name }}</strong>
                <span>{{ poi.style || '未分类' }} · 热度 {{ poi.hotness }} · {{ formatMaybeDistance(poi.distance) }}</span>
              </div>
              <button class="recommend-mini-btn" type="button" @click.stop="openPoiDetail(poi)">详情</button>
            </article>
            <button v-if="personalResults.length > 1" class="recommend-route-btn" type="button" @click="applyPersonalRoute">🗺️ 规划完整路线</button>
          </template>

          <template v-else-if="activeRecommendationDrawer === 'food'">
            <div class="food-filter-bar drawer-food-filter">
              <div class="food-sort-btns">
                <button
                  v-for="s in foodSortOptions"
                  :key="'drawer-food-sort-' + s.value"
                  class="food-sort-btn"
                  :class="{ active: foodSortType === s.value }"
                  @click="changeFoodSort(s.value)"
                >{{ s.label }}</button>
              </div>
              <select v-model="foodCuisineFilter" @change="changeFoodCuisine" class="food-cuisine-select">
                <option value="全部">全部菜系</option>
                <option v-for="c in cuisineList" :key="'drawer-cuisine-' + c" :value="c">{{ c }}</option>
              </select>
            </div>
            <div v-if="foodRecommendations.length === 0" class="recommend-empty">
              {{ foodRecommendationMode === 'nearby' ? '这个景点附近暂时没有筛选到美食，可以切换菜系或扩大搜索范围。' : '还没有美食推荐，点击左侧美食推荐生成。' }}
            </div>
            <article
              v-for="food in foodRecommendations"
              :key="'drawer-food-' + food.id"
              class="food-item recommend-food-card"
              @click="flyToFood(food)"
            >
              <div class="food-header">
                <span class="food-name">{{ food.name }}</span>
                <span class="food-rating">⭐ {{ food.rating }}</span>
              </div>
              <div class="food-meta">
                <span class="food-cuisine">{{ food.cuisine }}</span>
                <span class="food-style-tag" v-if="food.style">{{ food.style }}</span>
                <span class="food-dist">{{ food.distance }}km</span>
                <span class="food-price">{{ food.avg_price ? '¥' + food.avg_price + '/人' : '¥'.repeat(food.price_level || 1) }}</span>
              </div>
              <div class="food-addr" v-if="food.address">{{ food.address }}</div>
              <div class="food-actions">
                <button class="food-set-end-btn" @click.stop="setFoodAsEnd(food)">📍 设为终点</button>
                <a v-if="food.dianpingUrl" :href="food.dianpingUrl" target="_blank" rel="noopener noreferrer" class="food-dp-link" @click.stop>大众点评 ↗</a>
              </div>
            </article>
          </template>

          <template v-else-if="activeRecommendationDrawer === 'service'">
            <div v-if="travelServices.length === 0" class="recommend-empty">还没有旅拍服务结果，点击左侧旅拍服务生成。</div>
            <article
              v-for="service in travelServices"
              :key="'drawer-service-' + service.id"
              class="service-item recommend-service-card"
              :class="'service-' + service.type"
            >
              <div class="service-header">
                <span class="service-icon">{{ getServiceIcon(service.type) }}</span>
                <span class="service-name">{{ service.name }}</span>
                <span class="service-hotness">♥ {{ service.hotness }}</span>
              </div>
              <div class="service-actions">
                <button class="book-status set-end" @click.stop="setServiceAsEnd(service)">📍 设为终点</button>
              </div>
            </article>
          </template>
        </div>
      </aside>
    </Transition>

    <div v-if="journeyActive" class="journey-sidebar" :class="{ compact: journeyCompact }" :style="{ left: journeySidebarPos.x + 'px', top: journeySidebarPos.y + 'px' }">
      <div class="journey-drag-handle" @mousedown="onJourneyDragStart">⋮⋮ 拖拽移动</div>
      <div class="journey-header">
        <h3>🏮 旅程进行中</h3>
        <div class="journey-clock">{{ currentTimeStr }}</div>
        <div v-if="journeyCompact" class="journey-current-stage" :title="(journeyStages[currentStageIndex]?.name || '')">
          <span class="jcs-dot">●</span>
          <span class="jcs-name">{{ journeyStages[currentStageIndex]?.name || '准备出发' }}</span>
        </div>
        <div class="journey-compact-actions">
          <button class="journey-toggle-btn" type="button" @click="journeyCompact = !journeyCompact">
            {{ journeyCompact ? '📋 展开详情' : '📌 最小化' }}
          </button>
        </div>
      </div>

      <template v-if="!journeyCompact && !showJourneyEdit">
        <div class="journey-timeline">
          <div
            v-for="(stage, idx) in journeyStages"
            :key="idx"
            class="journey-stage"
            :class="{
              'stage-current': idx === currentStageIndex,
              'stage-past': idx < currentStageIndex,
              'stage-future': idx > currentStageIndex
            }"
          >
            <div class="stage-dot">
              <span v-if="idx < currentStageIndex">✓</span>
              <span v-else-if="idx === currentStageIndex">●</span>
              <span v-else>○</span>
            </div>
            <div class="stage-info">
              <div class="stage-name">{{ stage.name }}</div>
              <div class="stage-time">{{ stage.timeLabel }}</div>
              <div v-if="stage.type === 'visit' && stage.duration > 0" class="stage-duration">游览 {{ stage.duration }}小时</div>
              <div v-else-if="stage.type === 'travel'" class="stage-duration">通行 {{ stage.duration }}小时</div>
              <div v-else-if="stage.type === 'custom'" class="stage-duration">{{ stage.customType || '自定义' }} {{ stage.duration }}小时</div>
            </div>
          </div>
        </div>
        <button class="update-progress-btn" @click="openJourneyEdit">📝 更新我的进度</button>
        <button class="flowchart-btn" @click="showFlowchart = true">🗺️ 绘制流程图</button>
        <button class="ai-diary-journey-btn" @click="openAIDiaryFromJourney">✨ 生成轨迹日记</button>
        <button class="exit-journey-btn" @click="exitJourney">退出旅程</button>
      </template>

      <template v-else>
        <div class="edit-header">
          <h4>编辑旅程进度</h4>
          <span class="edit-hint">修改当前阶段、时长或添加自定义阶段</span>
        </div>
        <div class="edit-current-stage">
          <label>当前所处阶段：</label>
          <select v-model="editCurrentIdx" class="edit-select">
            <option v-for="(s, i) in editStages" :key="i" :value="i">{{ s.name }}</option>
          </select>
        </div>
        <div class="edit-stages-list">
          <div v-for="(stage, idx) in editStages" :key="idx" class="edit-stage-item">
            <div class="edit-stage-row">
              <input
                v-if="stage.type === 'custom'"
                v-model="stage.name"
                class="edit-name-input"
                placeholder="输入名称..."
              />
              <span v-else class="edit-stage-name">{{ stage.name }}</span>
              <div v-if="stage.type !== 'travel'" class="edit-stage-dur">
                <button class="dur-sm-btn" @click="editStageDur(idx, -0.5)">−</button>
                <span class="dur-sm-val">{{ stage.duration }}h</span>
                <button class="dur-sm-btn" @click="editStageDur(idx, 0.5)">+</button>
              </div>
              <span v-else class="edit-stage-fixed">通行1h</span>
            </div>
            <div v-if="stage.type === 'custom' && stage.poiInfo" class="edit-poi-info">
              📍 {{ stage.poiInfo.name }}
            </div>
            <div class="edit-stage-actions">
              <button class="edit-add-btn" @click="addCustomStage(idx, 'before')">+前插</button>
              <button v-if="stage.type === 'custom'" class="edit-del-btn" @click="removeCustomStage(idx)">删除</button>
              <button class="edit-add-btn edit-poi-btn" @click="openInsertPoi(idx)">🏞️ 插入景点</button>
              <button class="edit-add-btn" @click="addCustomStage(idx, 'after')">+后插</button>
            </div>
          </div>
        </div>
        <div class="edit-footer">
          <button class="edit-save-btn" @click="saveJourneyEdit">保存修改</button>
          <button class="edit-cancel-btn" @click="showJourneyEdit = false">取消</button>
        </div>
      </template>
    </div>

    <div v-if="showJourneySetup" class="modal-overlay" @click.self="showJourneySetup = false">
      <div class="modal-card journey-setup-card">
        <div class="modal-header">
          <h3>🏮 设置旅程时长</h3>
          <button class="close-btn" @click="showJourneySetup = false">✕</button>
        </div>
        <div class="modal-body journey-setup-body">
          <p class="setup-hint">为每个景点设置游览时长（通行时间根据交通方式自动估算）</p>
          <div
            v-for="(spot, idx) in journeySetupSpots"
            :key="idx"
            class="setup-spot"
          >
            <span class="setup-spot-name">{{ spot.name }}</span>
            <div class="setup-duration">
              <button class="dur-btn" @click="spot.duration = Math.max(0.5, spot.duration - 0.5)">−</button>
              <span class="dur-value">{{ spot.duration }}h</span>
              <button class="dur-btn" @click="spot.duration = Math.min(8, spot.duration + 0.5)">+</button>
            </div>
          </div>
          <button class="submit-book-btn" @click="startJourney">启程出发</button>
        </div>
      </div>
    </div>







    <div v-if="showPoiPopup && poiPopupData" class="poi-popup" data-drag-root :style="{ left: poiPopupPos.x + 'px', top: poiPopupPos.y + 'px' }">
      <div class="poi-popup-drag-handle" @mousedown="(e: MouseEvent) => onDragStart(e, 'poi-popup')">
        <span class="drag-dots">···</span>
      </div>
      <button class="poi-popup-close" @click="closePoiPopup">✕</button>
      <div class="poi-popup-name">{{ poiPopupData.name }}</div>
      <div class="poi-popup-desc">{{ poiPopupData.description }}</div>
      <div class="poi-popup-actions">
        <button class="poi-popup-btn" @click="openPoiDetail(poiPopupData)">📖 查看详情与拍照指导</button>
        <button class="poi-popup-btn" @click="setPoiAsStart">将起点改为此处</button>
        <button class="poi-popup-btn poi-popup-btn-end" @click="setPoiAsEnd">将终点改为此处</button>
        <button class="poi-popup-btn poi-popup-food" @click="recommendNearbyFoods()">🍽️ 推荐附近美食</button>
      </div>
    </div>

    <!-- 发现详情弹窗 -->
    <div v-if="showDiscoverDetail && selectedDiscoverItem" class="discover-detail-overlay">
      <div class="discover-detail-modal" data-drag-root :style="{
        left: discoverDetailPos.x + 'px',
        top: discoverDetailPos.y + 'px',
        margin: 0,
        transform: 'none',
        position: 'fixed',
      }">
        <div class="discover-detail-drag-handle" @mousedown="(e: MouseEvent) => onDragStart(e, 'discover-detail')">
          <span class="drag-dots">···</span>
        </div>
        <header class="discover-detail-header">
          <h2>{{ selectedDiscoverItem.name }}</h2>
          <div class="discover-detail-header-actions">
            <button
              class="discover-detail-reaction-btn"
              :class="{ active: isDiscoverLiked(selectedDiscoverItem) }"
              type="button"
              @click="toggleDiscoverLike(selectedDiscoverItem)"
            >
              <span>{{ isDiscoverLiked(selectedDiscoverItem) ? '♥' : '♡' }}</span>
              <strong>点赞</strong>
              <em>{{ getDiscoverLikeCount(selectedDiscoverItem) }}</em>
            </button>
            <button
              class="discover-detail-reaction-btn"
              :class="{ active: isDiscoverFavorite(selectedDiscoverItem) }"
              type="button"
              @click="toggleDiscoverFavorite(selectedDiscoverItem)"
            >
              <span>{{ isDiscoverFavorite(selectedDiscoverItem) ? '★' : '☆' }}</span>
              <strong>收藏</strong>
              <em>{{ getDiscoverFavoriteCount(selectedDiscoverItem) }}</em>
            </button>
            <button class="discover-detail-icon-btn" type="button" @click="closeDiscoverDetail">×</button>
          </div>
        </header>

        <div class="discover-detail-body">
          <section class="discover-detail-hero">
            <div class="discover-detail-icon" :class="selectedDiscoverItem.coverClass">{{ selectedDiscoverItem.icon }}</div>
            <div class="discover-detail-copy">
              <h3>
                {{ selectedDiscoverItem.name }}
                <span>⭐ {{ getDiscoverDisplayRating(selectedDiscoverItem).toFixed(1) }}</span>
              </h3>
              <div class="discover-detail-tags">
                <span v-for="tag in selectedDiscoverItem.tags" :key="tag">{{ tag }}</span>
              </div>
            </div>
          </section>

          <div class="discover-detail-meta">
            <span v-if="selectedDiscoverItem.type === 'spot'">🕘 08:30-17:00</span>
            <span v-if="selectedDiscoverItem.type === 'spot'">🎫 {{ selectedDiscoverItem.price }}</span>
            <span v-if="selectedDiscoverItem.type === 'food'">💰 {{ selectedDiscoverItem.price }}</span>
            <span>🏷️ {{ formatDiscoverDistance(selectedDiscoverItem.distance) }}</span>
            <span v-if="selectedDiscoverItem.address">📍 {{ selectedDiscoverItem.address }}</span>
          </div>

          <p class="discover-detail-desc">{{ selectedDiscoverItem.description }}</p>

          <section v-if="selectedDiscoverItem.gallery.length" class="discover-detail-gallery">
            <h4>🖼️ 图片预览</h4>
            <div class="discover-gallery-row">
              <div v-for="(gallery, idx) in selectedDiscoverItem.gallery" :key="gallery + idx" class="discover-gallery-item">
                {{ gallery }}
              </div>
            </div>
          </section>

          <div class="discover-detail-actions">
            <button class="discover-primary-mini" type="button" @click="setDiscoverItemAsEnd(selectedDiscoverItem)">📍 设为终点</button>
            <button class="discover-primary-mini" type="button" @click="addDiscoverItemToJourney(selectedDiscoverItem)">📋 加入行程</button>
            <a
              v-if="selectedDiscoverItem.type === 'food' && selectedDiscoverItem.dianpingUrl"
              class="discover-secondary-mini"
              :href="selectedDiscoverItem.dianpingUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              大众点评 ↗
            </a>
          </div>

          <section class="discover-review-section">
            <h4>💬 评价（{{ getDiscoverReviews(selectedDiscoverItem).length }}）</h4>
            <div class="discover-review-list">
              <article v-for="review in getDiscoverReviews(selectedDiscoverItem)" :key="review.user + review.time + review.text" class="discover-review-item">
                <div class="review-avatar">{{ review.avatar }}</div>
                <div class="review-main">
                  <div class="review-line">
                    <strong>{{ review.user }}</strong>
                    <span>{{ '★'.repeat(review.stars) }}{{ '☆'.repeat(5 - review.stars) }}</span>
                    <small>{{ review.time }}</small>
                  </div>
                  <p>{{ review.text }}</p>
                </div>
              </article>
            </div>

            <div class="discover-review-composer">
              <div class="discover-rating-picker">
                <button
                  v-for="star in 5"
                  :key="'draft-star-' + star"
                  type="button"
                  :class="{ active: star <= ratingDraft }"
                  @click="ratingDraft = star"
                >
                  ★
                </button>
              </div>
              <textarea v-model="commentDraft" rows="3" placeholder="写下你的评价..."></textarea>
              <button class="discover-submit-review" type="button" :disabled="!commentDraft.trim()" @click="submitDiscoverReview">
                提交评价
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>

    <!-- 景点详情弹窗 -->
    <div v-if="showPoiDetail" class="poi-detail-overlay">
      <div class="poi-detail-card" data-drag-root :style="{
        left: poiDetailPos.x + 'px',
        top: poiDetailPos.y + 'px',
        margin: 0,
        transform: 'none',
        position: 'fixed',
      }">
        <div class="poi-detail-drag-handle" @mousedown="(e: MouseEvent) => onDragStart(e, 'poi-detail')">
          <span class="drag-dots">···</span>
        </div>
        <button class="poi-detail-close" @click="closePoiDetail">✕</button>
        <div class="poi-detail-icon">🏛️</div>
        <div class="poi-detail-name">{{ poiDetailData.name }}</div>
        <div class="poi-detail-style" v-if="poiDetailData.style">#{{ poiDetailData.style }}</div>
        <div class="poi-detail-hottness">❤️ 热度 {{ poiDetailData.hotness }}</div>
        <div class="poi-detail-desc">{{ buildPoiDescription(poiDetailData) }}</div>

        <!-- AI 拍照指导部分 -->
        <div class="poi-detail-guidance-section">
          <div class="guidance-header">
            <span class="guidance-icon">📸</span>
            <span class="guidance-title">AI 摄影助手</span>
            <button 
              class="guidance-refresh-btn" 
              @click="fetchPhotoGuidance(poiDetailData)"
              :disabled="loadingGuidance"
              title="刷新指导"
            >
              {{ loadingGuidance ? '⌛' : '🔄' }}
            </button>
          </div>
          <button
            v-if="!loadingGuidance && photoGuidancePoses.length > 0"
            class="pose-view-tag"
            @click="openPoseModal"
            type="button"
          >
            📍 查看推荐拍照姿势
          </button>
          <div v-if="loadingGuidance" class="guidance-loading">
            <div class="loading-dots"><span>.</span><span>.</span><span>.</span></div>
            正在为您生成专业拍照建议...
          </div>
          <div v-else-if="photoGuidanceText" class="guidance-content">
            <div v-if="guidanceContext.clothing || guidanceContext.makeup" class="guidance-context-tag">
              ✨ 已结合您今日预约的{{ guidanceContext.clothing }}{{ guidanceContext.clothing && guidanceContext.makeup ? '和' : '' }}{{ guidanceContext.makeup }}
            </div>
            <p>{{ photoGuidanceText }}</p>
          </div>
          <div v-else class="guidance-empty">
            点击上方按钮获取该景点的专业拍照姿势指导
          </div>
        </div>

        <div class="poi-detail-links">
          <a v-if="poiDetailData.baiduUrl" :href="poiDetailData.baiduUrl" target="_blank" rel="noopener noreferrer" class="poi-detail-baidu-btn" @click.stop>🔍 百度搜索详情</a>
        </div>
        <div class="poi-detail-actions">
          <button class="poi-detail-btn" @click="setPoiDetailAsStart">📍 设为起点</button>
          <button class="poi-detail-btn poi-detail-btn-end" @click="setPoiDetailAsEnd">📍 设为终点</button>
          <button class="poi-detail-btn poi-detail-food-btn" @click="setPoiDetailAndRecommendFood">🍽️ 推荐附近美食</button>
        </div>
      </div>
    </div>

    <div v-if="showPoseModal" class="modal-overlay pose-modal-overlay" @click.self="closePoseModal">
      <div class="pose-modal-card" :class="{ 'pose-modal-card-compact': photoGuidancePoses.length <= 2 }">
        <button class="pose-modal-close" @click="closePoseModal">✕</button>
        <div class="pose-modal-title">推荐拍照姿势</div>
        <button class="pose-reroll-btn" type="button" @click="openPoseModal">换一组</button>
        <div class="pose-grid">
          <div v-for="(p, idx) in photoGuidancePoses" :key="(p.keyword || 'pose') + idx" class="pose-card">
            <img
              class="pose-img"
              :src="p.image_url || poseFallbackUrl"
              :alt="p.keyword || 'pose'"
              loading="lazy"
              @error="onPoseImgError"
            />
            <div class="pose-keyword">{{ p.keyword }}</div>
            <div class="pose-desc">{{ p.description }}</div>
            <div v-if="p.pose_tip && p.pose_tip !== p.description" class="pose-tip">{{ p.pose_tip }}</div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showPoiSearchModal" class="modal-overlay" @click.self="closePoiSearchModal">
      <div class="modal-card">
        <div class="modal-header">
          <h3>🏞️ 搜索途经景点</h3>
          <button class="close-btn" @click="closePoiSearchModal">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <input
              v-model="poiSearchKeyword"
              class="poi-search-input"
              placeholder="输入景点名称搜索..."
              @keyup.enter="searchPois"
            />
            <button class="search-poi-btn" @click="searchPois" :disabled="poiSearchLoading">
              {{ poiSearchLoading ? '搜索中...' : '搜索' }}
            </button>
          </div>
          <div v-if="poiSearchResults.length > 0" class="poi-search-results">
            <div
              v-for="poi in poiSearchResults"
              :key="poi.id"
              class="poi-search-item"
              @click="selectPoiAsWaypoint(poi)"
            >
              <span class="poi-search-name">{{ poi.name }}</span>
              <span class="poi-search-hot">热度 {{ poi.hotness }}</span>
            </div>
          </div>
          <div v-else-if="poiSearchDone" class="poi-search-empty">
            未找到相关景点
          </div>
        </div>
      </div>
    </div>

    <div v-if="showInsertPoiModal" class="modal-overlay" @click.self="closeInsertPoiModal">
      <div class="modal-card">
        <div class="modal-header">
          <h3>🏞️ 插入景点到旅程</h3>
          <button class="close-btn" @click="closeInsertPoiModal">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <input
              v-model="insertPoiKeyword"
              class="poi-search-input"
              placeholder="输入景点名称搜索..."
              @keyup.enter="searchInsertPois"
            />
            <button class="search-poi-btn" @click="searchInsertPois" :disabled="insertPoiLoading">
              {{ insertPoiLoading ? '搜索中...' : '搜索' }}
            </button>
          </div>
          <div v-if="insertPoiResults.length > 0" class="poi-search-results">
            <div
              v-for="poi in insertPoiResults"
              :key="poi.id"
              class="poi-search-item"
              @click="confirmInsertPoi(poi)"
            >
              <span class="poi-search-name">{{ poi.name }}</span>
              <span class="poi-search-hot">热度 {{ poi.hotness }}</span>
            </div>
          </div>
          <div v-else-if="insertPoiDone" class="poi-search-empty">
            未找到相关景点
          </div>
        </div>
      </div>

      <!-- 降雨弹窗提醒（旅程中可关闭） -->
      <div v-if="showRainAlert" class="rain-alert-overlay">
        <div class="rain-alert-card">
          <div class="rain-alert-icon">🌧️</div>
          <div class="rain-alert-title">降雨提醒</div>
          <div class="rain-alert-desc">
            未来几小时预计有降雨，建议携带雨具。<br/>
            如需调整行程，可以重新规划路线。
          </div>
          <div class="rain-alert-actions">
            <button class="rain-alert-btn" @click="showRainAlert = false">知道了</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 流程图弹窗（外层，不受侧边栏约束） -->
    <div v-if="showFlowchart" class="modal-overlay" @click.self="showFlowchart = false">
      <div class="flowchart-modal">
        <div class="flowchart-header">
          <h3>🗺️ 旅程流程图</h3>
          <button class="close-btn" @click="showFlowchart = false">✕</button>
        </div>
        <div class="flowchart-body">
          <div class="flowchart-start">
            <div class="fc-node fc-node-start">📍 起点</div>
            <div class="fc-arrow">↓</div>
          </div>
          <template v-for="(stage, idx) in journeyStages" :key="idx">
            <div
              class="fc-node"
              :class="{
                'fc-node-visit': stage.type === 'visit',
                'fc-node-travel': stage.type === 'travel',
                'fc-node-custom': stage.type === 'custom',
                'fc-node-current': idx === currentStageIndex,
                'fc-node-past': idx < currentStageIndex
              }"
            >
              <span class="fc-icon">{{ stage.type === 'visit' ? '🏯' : stage.type === 'travel' ? '🚶' : '⭐' }}</span>
              <span class="fc-label">{{ stage.name }}</span>
              <span class="fc-dur">{{ stage.duration }}h</span>
            </div>
            <div v-if="idx < journeyStages.length - 1" class="fc-arrow">↓</div>
          </template>
          <div class="fc-arrow">↓</div>
          <div class="fc-node fc-node-end">🏁 终点</div>
        </div>
      </div>
    </div>

    <!-- 天气详情弹窗（右侧自动关闭） -->
    <Transition name="weather-slide">
      <div v-if="showWeatherDetail && weatherData" class="weather-popup-right" @click="showWeatherDetail = false">
        <button class="weather-popup-close" @click.stop="showWeatherDetail = false">✕</button>
        <div class="weather-popup-header">
          <span class="weather-popup-emoji">{{ weatherData.current.emoji }}</span>
          <span class="weather-popup-temp">{{ weatherData.current.temp }}°C</span>
          <span class="weather-popup-desc">{{ weatherCodeText(weatherData.current.code) }}</span>
        </div>
        <div class="weather-popup-body">
          <div v-if="currentAddress" class="weather-popup-row">
            <span>📍</span>
            <span>{{ currentAddress }}</span>
          </div>
          <div v-if="weatherData.current.precipitation > 0" class="weather-popup-row">
            <span>🌧️</span>
            <span>降水 {{ weatherData.current.precipitation }} mm</span>
          </div>
          <div class="weather-popup-alert" v-if="weatherData.rainAlert">
            ⚠️ 未来数小时可能有降雨，建议携带雨具
          </div>
          <div class="weather-popup-alert weather-popup-safe" v-else>
            ✅ 未来一天内无雨，请放心出行
          </div>
          <div class="weather-popup-forecast-title">未来 12 小时</div>
          <div class="weather-popup-hourly">
            <div v-for="h in weatherData.hourly" :key="h.time" class="weather-popup-hourly-item">
              <span class="wp-time">{{ formatHour(h.time) }}</span>
              <span class="wp-emoji">{{ h.emoji }}</span>
              <span class="wp-temp">{{ h.temp }}°</span>
              <span v-if="h.precipProb > 10" class="wp-rain">{{ h.precipProb }}%</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    </div>
  </div>

  <!-- 加入行程 Toast -->
  <Transition name="toast-fade">
    <div v-if="journeyToast" class="journey-toast">{{ journeyToast }}</div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BaseMap from '@/components/BaseMap.vue'

const router = useRouter()
const route = useRoute()
const baseMapRef = ref<InstanceType<typeof BaseMap> | null>(null)
const statusMessage = ref('点击地图设置起点，然后点击推荐按钮。')
const panelOpen = ref(true)
type MainTab = 'map' | 'trip' | 'discover' | 'profile'
const activeMainTab = ref<MainTab>('map')
const panelView = ref<'map' | 'trip'>('map')
type RecommendationDrawerType = 'nearby' | 'style' | 'personal' | 'food' | 'service'
const activeRecommendationDrawer = ref<RecommendationDrawerType | null>(null)
const lastRecommendSort = ref<'distance' | 'hotness'>('distance')
const recommendationDrawerVisible = computed(() => {
  return (activeMainTab.value === 'map' || activeMainTab.value === 'trip') && panelView.value === 'map' && panelOpen.value && !!activeRecommendationDrawer.value
})
const recommendationDrawerKicker = computed(() => {
  if (activeRecommendationDrawer.value === 'nearby') return lastRecommendSort.value === 'distance' ? '附近景点' : '热门景点'
  if (activeRecommendationDrawer.value === 'style') return '多位一体'
  if (activeRecommendationDrawer.value === 'personal') return '用户偏好'
  if (activeRecommendationDrawer.value === 'food') return foodRecommendationMode.value === 'nearby' ? '附近美食' : '餐饮推荐'
  if (activeRecommendationDrawer.value === 'service') return '旅拍服务'
  return '推荐结果'
})
const recommendationDrawerTitle = computed(() => {
  if (activeRecommendationDrawer.value === 'nearby') return lastRecommendSort.value === 'distance' ? '按距离推荐' : '按热度推荐'
  if (activeRecommendationDrawer.value === 'style') return selectedStyle.value ? `${selectedStyle.value} · 多位一体推荐` : '多位一体推荐'
  if (activeRecommendationDrawer.value === 'personal') return '个性化推荐'
  if (activeRecommendationDrawer.value === 'food') {
    return foodRecommendationMode.value === 'nearby' && foodRecommendationAnchorName.value
      ? `${foodRecommendationAnchorName.value}附近美食`
      : '美食推荐'
  }
  if (activeRecommendationDrawer.value === 'service') return '旅拍服务推荐'
  return '推荐结果'
})
const recommendationDrawerSubtitle = computed(() => {
  if (activeRecommendationDrawer.value === 'nearby') return '点击卡片查看详情，也可以直接设为终点。'
  if (activeRecommendationDrawer.value === 'style') return '按风格生成景点序列，可单点查看或规划完整路线。'
  if (activeRecommendationDrawer.value === 'personal') return '根据你的浏览、收藏、点赞和风格权重展开内容推荐。'
  if (activeRecommendationDrawer.value === 'food') {
    return foodRecommendationMode.value === 'nearby'
      ? '按距离和口味筛选，适合从当前景点直接加入路线。'
      : '按排序和菜系筛选，适合直接加入路线。'
  }
  if (activeRecommendationDrawer.value === 'service') return '摄影、妆造、无人机和服装服务可设为终点。'
  return ''
})

function openRecommendationDrawer(type: RecommendationDrawerType) {
  activeRecommendationDrawer.value = type
  panelOpen.value = true
  panelView.value = 'map'
}

function closeRecommendationDrawer() {
  activeRecommendationDrawer.value = null
}

function openRecommendationDrawerIfMap(type: RecommendationDrawerType) {
  if (activeMainTab.value === 'map' && panelView.value === 'map') {
    openRecommendationDrawer(type)
  }
}

const userLocation = ref({ lat: 39.90923, lng: 116.397428 })
let userMarker: any = null
let prevStartMarker: any = null
const recommendedPois = ref<any[]>([])
const poiMarkers: any[] = []
const travelServices = ref<any[]>([])
const serviceMarkers: any[] = []
const foodRecommendations = ref<any[]>([])
const nearbyFoods = ref<any[]>([])
const foodRecommendationMode = ref<'general' | 'nearby'>('general')
const foodRecommendationAnchorName = ref('')
const nearbyFoodAnchor = ref<any | null>(null)
const nearbyFoodAllResults = ref<any[]>([])
const foodSortType = ref('composite')
const foodCuisineFilter = ref('全部')
const cuisineList = ref<string[]>([])
const foodSortOptions = [
  { label: '综合', value: 'composite' },
  { label: '热度', value: 'hotness' },
  { label: '评价', value: 'rating' },
  { label: '距离', value: 'distance' },
]

type DiscoverSection = 'spots' | 'foods' | 'services'
type DiscoverItemType = 'spot' | 'food' | 'service'
type DiscoverSpotSort = 'distance' | 'hotness'
type DiscoverFoodSort = 'composite' | 'rating' | 'hotness' | 'distance'
type DiscoverServiceFilter = 'all' | 'photographer' | 'makeup' | 'drone' | 'clothing'

interface DiscoverReview {
  user: string
  avatar: string
  stars: number
  text: string
  time: string
}

interface DiscoverItem {
  uid: string
  type: DiscoverItemType
  raw: any
  id: string | number
  name: string
  icon: string
  coverClass: string
  tags: string[]
  rating: number
  hotness: number
  distance: number | null
  address: string
  price: string
  description: string
  gallery: string[]
  reviews: DiscoverReview[]
  cuisine?: string
  serviceType?: string
  dianpingUrl?: string
  likeCount: number
  favoriteCount: number
}

interface DiscoverInteractionState {
  likeCount: number
  favoriteCount: number
  myLike: boolean
  myFavorite: boolean
  ratingAvg: number
  ratingCount: number
  reviews: DiscoverReview[]
}

const discoverSectionTabs: Array<{ value: DiscoverSection; label: string }> = [
  { value: 'spots', label: '🏛️ 景点' },
  { value: 'foods', label: '🍽️ 美食' },
  { value: 'services', label: '📸 旅拍服务' }
]
const activeDiscoverSection = ref<DiscoverSection>('spots')
const activeDiscoverSpotSort = ref<DiscoverSpotSort>('hotness')
const discoverSpotsRef = ref<HTMLElement | null>(null)
const discoverFoodsRef = ref<HTMLElement | null>(null)
const discoverServicesRef = ref<HTMLElement | null>(null)
interface DiscoverDistanceAnchor {
  name: string
  lat: number
  lng: number
  source: DiscoverItemType | 'current'
}
const discoverDistanceAnchor = ref<DiscoverDistanceAnchor | null>(null)
const discoverDistanceAnchorLabel = computed(() => {
  const anchor = discoverDistanceAnchor.value
  if (anchor) return anchor.name
  return `当前位置 ${userLocation.value.lat.toFixed(4)}, ${userLocation.value.lng.toFixed(4)}`
})

const discoverFoodCuisines = ['全部', '川菜', '粤菜', '日料', '西餐', '甜品', '小吃']
const discoverFoodSortOptions: Array<{ value: DiscoverFoodSort; label: string }> = [
  { value: 'composite', label: '综合推荐' },
  { value: 'rating', label: '评分最高' },
  { value: 'hotness', label: '热度最高' },
  { value: 'distance', label: '距离最近' }
]
const discoverServiceTypes: Array<{ value: DiscoverServiceFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'photographer', label: '摄影师' },
  { value: 'makeup', label: '妆娘' },
  { value: 'drone', label: '无人机' },
  { value: 'clothing', label: '服装租赁' }
]
const activeFoodCuisine = ref('全部')
const activeFoodSort = ref<DiscoverFoodSort>('composite')
const activeServiceType = ref<DiscoverServiceFilter>('all')
const discoverInteractionMap = ref<Record<string, DiscoverInteractionState>>({})
const discoverLoading = ref(false)
const discoverDataError = ref('')
const showDiscoverDetail = ref(false)
const selectedDiscoverItem = ref<DiscoverItem | null>(null)
const discoverDetailPos = ref({ x: 0, y: 0 })
const ratingDraft = ref(5)
const commentDraft = ref('')

const discoverSpotItems = computed(() => {
  const source = recommendedPois.value
  const raw = source.slice(0, 30).map(mapPoiToDiscoverItem)

  // 默认排序：用户偏好（收藏/点赞）提升 + 热度降序
  function preferenceBoost(item: DiscoverItem): number {
    const liked = isDiscoverLiked(item) ? 5000 : 0
    const favorited = isDiscoverFavorite(item) ? 8000 : 0
    return item.hotness + liked + favorited
  }

  const sorted = raw.sort((a, b) => {
    if (activeDiscoverSpotSort.value === 'distance') return (a.distance ?? 9999) - (b.distance ?? 9999)
    return preferenceBoost(b) - preferenceBoost(a)
  })
  return sorted.slice(0, 15)
})
const filteredDiscoverFoodItems = computed(() => {
  const source = foodRecommendations.value
  const items = source.map(mapFoodToDiscoverItem)
    .filter(item => activeFoodCuisine.value === '全部' || item.cuisine === activeFoodCuisine.value)

  function preferenceBoost(item: DiscoverItem): number {
    const liked = isDiscoverLiked(item) ? 5000 : 0
    const favorited = isDiscoverFavorite(item) ? 8000 : 0
    return (item.rating * 18 + item.hotness) + liked + favorited
  }

  return items.sort((a, b) => {
    if (activeFoodSort.value === 'rating') return b.rating - a.rating
    if (activeFoodSort.value === 'hotness') return b.hotness - a.hotness
    if (activeFoodSort.value === 'distance') return (a.distance ?? 9999) - (b.distance ?? 9999)
    // 默认复合排序（热度+评分+用户偏好）
    return preferenceBoost(b) - preferenceBoost(a)
  }).slice(0, 15)
})
const filteredDiscoverServiceItems = computed(() => {
  const source = travelServices.value
  return source.map(mapServiceToDiscoverItem)
    .filter(item => activeServiceType.value === 'all' || item.serviceType === activeServiceType.value)
    .sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999))
    .slice(0, 15)
})

function mapDiscoverPreferenceItems(items: DiscoverItem[]) {
  const rows: Array<{ id: string; name: string; icon: string; kind: string; meta: string }> = []
  items.forEach(item => {
    if (isDiscoverFavorite(item)) {
      rows.push({ id: item.uid + '-fav', name: item.name, icon: item.icon, kind: '收藏', meta: item.tags.join(' · ') || item.address || '已收藏' })
    }
    if (isDiscoverLiked(item)) {
      rows.push({ id: item.uid + '-like', name: item.name, icon: item.icon, kind: '点赞', meta: `热度 ${Math.round(item.hotness)}` })
    }
    if (profileBrowseHistory.value.some(h => h.id === item.uid)) {
      rows.push({ id: item.uid + '-view', name: item.name, icon: item.icon, kind: '浏览', meta: item.address || item.description.slice(0, 18) })
    }
  })
  return rows
}

const profilePreferenceGroups = computed(() => {
  const diaryLikeMap = JSON.parse(localStorage.getItem('diary_like_map') || '{}')
  const diaryFavoriteMap = JSON.parse(localStorage.getItem('diary_favorite_map') || '{}')
  const diaryBrowseById = new Map(
    profileBrowseHistory.value
      .filter(item => item.type === 'diary')
      .map(item => [String(item.id).replace(/^diary-/, ''), item])
  )
  const diaryRows = [
    ...Object.keys(diaryFavoriteMap).filter(id => diaryFavoriteMap[id]).map(id => ({ id: `diary-fav-${id}`, name: diaryBrowseById.get(id)?.name || `日记 #${id}`, icon: '📖', kind: '收藏', meta: '来自日记详情' })),
    ...Object.keys(diaryLikeMap).filter(id => diaryLikeMap[id]).map(id => ({ id: `diary-like-${id}`, name: diaryBrowseById.get(id)?.name || `日记 #${id}`, icon: '📖', kind: '点赞', meta: '来自日记详情' })),
    ...profileBrowseHistory.value.filter(item => item.type === 'diary').map(item => ({ id: `diary-view-${item.id}`, name: item.name, icon: item.icon, kind: '浏览', meta: item.meta }))
  ]

  return [
    { key: 'diary', label: '📖 日记', items: diaryRows },
    { key: 'spots', label: '🏛️ 景点', items: mapDiscoverPreferenceItems(discoverSpotItems.value) },
    { key: 'foods', label: '🍽️ 美食', items: mapDiscoverPreferenceItems(filteredDiscoverFoodItems.value) },
    { key: 'services', label: '📸 旅拍服务', items: mapDiscoverPreferenceItems(filteredDiscoverServiceItems.value) }
  ]
})
const profilePreferenceKinds = [
  { value: 'all', label: '全部' },
  { value: '浏览', label: '浏览过' },
  { value: '点赞', label: '点赞过' },
  { value: '收藏', label: '收藏过' }
]
const activeProfilePreferenceGroup = ref('diary')
const activeProfilePreferenceKind = ref('all')
const activeProfilePreferenceData = computed(() => {
  return profilePreferenceGroups.value.find(group => group.key === activeProfilePreferenceGroup.value) || profilePreferenceGroups.value[0]
})
const filteredProfilePreferenceItems = computed(() => {
  const group = activeProfilePreferenceData.value
  if (!group) return []
  if (activeProfilePreferenceKind.value === 'all') return group.items
  return group.items.filter(item => item.kind === activeProfilePreferenceKind.value)
})
const currentUser = ref<{ id: number; username: string; avatar?: string; avatar_url?: string; role?: string } | null>(null)
const showProfileBookingsModal = ref(false)
const showProfileSettingsModal = ref(false)
const showProfilePreferenceModal = ref(false)
const profileSettings = ref<{ avatarFile: File | null; avatarPreview: string; nickname: string; password: string; confirmPassword: string }>({
  avatarFile: null,
  avatarPreview: '',
  nickname: '',
  password: '',
  confirmPassword: ''
})
const profileSettingsMessage = ref('')
const profileBrowseHistory = ref<Array<{ id: string; type: DiscoverItemType | 'diary'; name: string; icon: string; meta: string }>>(
  JSON.parse(localStorage.getItem('profile_browse_history') || '[]')
)
const profileAvatar = computed(() => currentUser.value?.avatar_url || currentUser.value?.avatar || '🎭')
const profileAvatarPreview = computed(() => profileSettings.value.avatarPreview || profileAvatar.value || '🎭')

function isImageAvatar(value?: string | null) {
  if (!value) return false
  return /^(data:image\/|https?:\/\/|\/api\/|\/uploads\/|blob:)/i.test(value)
}

// === 通知系统 ===
const notifications = ref<any[]>([])
const selectedNotification = ref<any | null>(null)
const replyDraft = ref('')
const unreadNotificationCount = computed(() => notifications.value.filter(n => !n.is_read).length)
const hasUnreadNotifications = computed(() => unreadNotificationCount.value > 0)

async function fetchNotifications() {
  if (!currentUser.value) return
  try {
    const token = localStorage.getItem('token')
    const res = await fetch('/api/notifications', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    const data = await res.json()
    console.log('[通知调试] fetchNotifications response:', data)
    if (data.success) notifications.value = data.notifications
  } catch { console.error('获取通知失败') }
}

async function markAllNotificationsRead() {
  try {
    const token = localStorage.getItem('token')
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {}
    })
    notifications.value.forEach(n => n.is_read = true)
  } catch { console.error('标记已读失败') }
}

async function markNotificationRead(notif: any) {
  if (!notif || notif.is_read) return
  notif.is_read = true
  try {
    const token = localStorage.getItem('token')
    await fetch(`/api/notifications/${notif.id}/read`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {}
    })
  } catch {
    notif.is_read = false
  }
}

function openNotificationDetail(notif: any) {
  selectedNotification.value = notif
  replyDraft.value = ''
  markNotificationRead(notif)
}

function closeNotificationDetail() {
  selectedNotification.value = null
  replyDraft.value = ''
}

function notificationIcon(notif: any) {
  if (notif?.type === 'like') return '❤️'
  if (notif?.type === 'favorite') return '⭐'
  if (notif?.type === 'reply') return '↩️'
  return '💬'
}

function notificationActionText(notif: any) {
  if (notif?.type === 'like') return ' 赞了你的日记'
  if (notif?.type === 'favorite') return ' 收藏了你的日记'
  if (notif?.type === 'reply') return ' 回复了你的日记评论'
  return ' 评论了你的日记'
}

function notificationDetailTitle(notif: any) {
  const actor = notif?.actor_name || '旅者'
  if (notif?.type === 'like') return `${actor} 赞了你的日记`
  if (notif?.type === 'favorite') return `${actor} 收藏了你的日记`
  if (notif?.type === 'reply') return `${actor} 回复了评论`
  return `${actor} 评论了你的日记`
}

function canReplyNotification(notif: any) {
  return notif?.type === 'comment' || notif?.type === 'reply'
}

function openNotificationDiary() {
  if (selectedNotification.value?.diary_id) {
    sessionStorage.setItem('smartmap_open_diary_id', String(selectedNotification.value.diary_id))
  }
  router.push('/diary')
}

async function submitNotificationReply(notif: any = selectedNotification.value) {
  if (!notif?.diary_id) return
  if (!replyDraft.value.trim()) return
  try {
    const token = localStorage.getItem('token')
    const parentId = notif?.comment_id || notif?.parent_comment_id || null
    const res = await fetch(`/api/diaries/${notif.diary_id}/comments`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {},
      body: JSON.stringify({ comment: replyDraft.value.trim(), parent_id: parentId })
    })
    const data = await res.json()
    if (data.success) {
      replyDraft.value = ''
      fetchNotifications()
      closeNotificationDetail()
    }
  } catch { console.error('回复失败') }
}

function formatNotificationTime(dateStr: string) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000)
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  if (diff < 604800) return `${Math.floor(diff / 86400)}天前`
  return `${d.getMonth()+1}月${d.getDate()}日`
}

const showBookModal = ref(false)
const selectedService = ref<any>(null)
const selectedDate = ref('')
const selectedSlot = ref('')
const daySlots = ref<any[]>([])
const slotsLoading = ref(false)
const bookErrorMsg = ref('')
const bookingSubmit = ref(false)

const showConflictModal = ref(false)
const conflictMsg = ref('')
function closeConflictModal() { showConflictModal.value = false; conflictMsg.value = '' }

const showBookingAlert = ref(false)
const bookingAlertMsg = ref('')

const hasRoute = ref(false)
const currentEnd = ref<any>(null)
const waypoints = ref<any[]>([])
const addWaypointMode = ref(false)
const waypointMarkers: any[] = []

// 交通方式
type TransportMode = 'driving' | 'cycling' | 'walking'
interface TransportOption {
  value: TransportMode
  label: string
  icon: string
  speed: number
  desc: string
}
const transportMode = ref<TransportMode>('driving')
const transportOptions: TransportOption[] = [
  { value: 'driving', label: '驾车', icon: '🚗', speed: 60, desc: '四环内50km/h，四环外65km/h，受拥挤影响' },
  { value: 'cycling', label: '骑车', icon: '🚲', speed: 20, desc: '理想速度20km/h，仅受景区拥挤影响' },
  { value: 'walking', label: '步行', icon: '🚶', speed: 5, desc: '理想速度5km/h，仅受景区拥挤影响' },
]
const activeTransportLabel = computed(() => transportOptions.find(opt => opt.value === transportMode.value)?.label || '驾车')

// 三种交通方式的时间估算
const travelTimes = ref<{ driving: number; cycling: number; walking: number; turnCount: number; distance: number } | null>(null)
const activeTravelMinutes = computed(() => travelTimes.value ? travelTimes.value[transportMode.value] : 0)

function formatMinutes(mins: number): string {
  if (!mins || mins <= 0) return '--'
  if (mins < 60) return `${Math.round(mins)}分钟`
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  return m > 0 ? `${h}小时${m}分钟` : `${h}小时`
}

const showPoiSearchModal = ref(false)
const poiSearchKeyword = ref('')
const poiSearchResults = ref<any[]>([])
const poiSearchLoading = ref(false)
const poiSearchDone = ref(false)

const showPoiPopup = ref(false)
const poiPopupData = ref<{ name: string; description: string; lat: number; lng: number; style?: string } | null>(null)
const poiPopupPos = ref({ x: 0, y: 0 })

// === 弹窗拖拽状态 ===
const dragState = ref<{
  active: 'poi-detail' | 'poi-popup' | 'discover-detail' | null
  startX: number; startY: number
  origX: number; origY: number
}>({ active: null, startX: 0, startY: 0, origX: 0, origY: 0 })

function onDragStart(e: MouseEvent, type: 'poi-detail' | 'poi-popup' | 'discover-detail') {
  dragState.value.active = type
  dragState.value.startX = e.clientX
  dragState.value.startY = e.clientY
  const card = (e.currentTarget as HTMLElement).closest('[data-drag-root]') as HTMLElement
  if (!card) return
  const rect = card.getBoundingClientRect()
  dragState.value.origX = rect.left
  dragState.value.origY = rect.top
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
  e.preventDefault()
}

function onDragMove(e: MouseEvent) {
  if (!dragState.value.active) return
  const dx = e.clientX - dragState.value.startX
  const dy = e.clientY - dragState.value.startY
  if (dragState.value.active === 'poi-detail') {
    poiDetailPos.value = { x: dragState.value.origX + dx, y: dragState.value.origY + dy }
  } else if (dragState.value.active === 'poi-popup') {
    poiPopupPos.value = { x: dragState.value.origX + dx, y: dragState.value.origY + dy }
  } else if (dragState.value.active === 'discover-detail') {
    discoverDetailPos.value = { x: dragState.value.origX + dx, y: dragState.value.origY + dy }
  }
}

function onDragEnd() {
  dragState.value.active = null
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
}

// === POI 悬停提示 ===

// === 地图标记点击处理 ===
function handleMarkerClick(data: any) {
  if (journeyActive.value) {
    openPoiDetail(data)
  } else {
    openPoiPopup(data)
  }
}

// === POI 详情弹窗 ===
const showPoiDetail = ref(false)
const poiDetailData = ref<any>({})
const poiDetailPos = ref({ x: 0, y: 0 })

// === 统一搜索栏状态 ===
const searchQuery = ref('')
const searchPoiResults = ref<any[]>([])
const searchFoodResults = ref<any[]>([])
const searchServiceResults = ref<any[]>([])
const searchLoading = ref(false)
const searchFocused = ref(false)
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
let searchRequestSeq = 0

function onSearchInput() {
  searchFocused.value = true
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  const trimmed = searchQuery.value.trim()
  if (!trimmed) {
    searchRequestSeq += 1
    searchPoiResults.value = []
    searchFoodResults.value = []
    searchServiceResults.value = []
    searchLoading.value = false
    return
  }
  const requestId = ++searchRequestSeq
  searchLoading.value = true
  searchDebounceTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/search/autocomplete?q=${encodeURIComponent(trimmed)}`)
      const json = await res.json()
      if (requestId !== searchRequestSeq) return
      const d = json.data || json
      searchPoiResults.value = d.pois || []
      searchFoodResults.value = d.foods || []
      searchServiceResults.value = d.services || []
    } catch {
      if (requestId !== searchRequestSeq) return
      searchPoiResults.value = []
      searchFoodResults.value = []
      searchServiceResults.value = []
    } finally {
      if (requestId === searchRequestSeq) searchLoading.value = false
    }
  }, 300)
}

function onSearchBlur() {
  setTimeout(() => { searchFocused.value = false }, 200)
}

function clearSearch() {
  searchRequestSeq += 1
  searchQuery.value = ''
  searchPoiResults.value = []
  searchFoodResults.value = []
  searchServiceResults.value = []
  searchLoading.value = false
  searchFocused.value = false
}

function selectSearchPoi(poi: any) {
  searchQuery.value = poi.name
  searchFocused.value = false

  if (activeMainTab.value === 'discover') {
    setDiscoverDistanceAnchor(poi, 'spot')
    openDiscoverDetail(mapPoiToDiscoverItem(poi, 0))
    return
  }
  
  
  // 1. 飞向景点
  const map = baseMapRef.value?.getMap?.()
  if (map) {
    map.flyTo({ center: [poi.lng, poi.lat], zoom: 15, duration: 1500 })
  }

  // 2. 在地图上打点
  baseMapRef.value?.addMarker?.([poi.lng, poi.lat], {
    color: '#A0522D',
    data: poi,
    onClick: (_m: any, data: any) => { handleMarkerClick(data) }
  })

  // 3. 强制显示“开始旅程”按钮（不再依赖路线规划成功）
  hasRoute.value = true
  currentEnd.value = poi
  statusMessage.value = `已选定 <b>${poi.name}</b> 为目的地。`

  // 4. 打开详情页并触发拍照推荐
  openPoiDetail(poi)
}

function selectSearchFood(food: any) {
  searchQuery.value = food.name
  searchFocused.value = false

  if (activeMainTab.value === 'discover') {
    setDiscoverDistanceAnchor(food, 'food')
    openDiscoverDetail(mapFoodToDiscoverItem(food, 0))
    return
  }

  // 飞到美食位置 + 弹窗
  const map = baseMapRef.value?.getMap?.()
  if (map) {
    map.flyTo({ center: [food.lng, food.lat], zoom: 15, duration: 1500 })
  }
  // 在美食位置添加标记
  baseMapRef.value?.addMarker?.([food.lng, food.lat], {
    color: '#E85D3A',
    data: { type: 'food', name: food.name }
  })
  // 用statusMessage显示美食信息
  statusMessage.value = `🍽️ <b>${food.name}</b> (${food.cuisine})<br/>📍 ${food.address || '暂无地址'} · 热度 ${food.hotness}`
}

function selectSearchService(svc: any) {
  searchQuery.value = svc.name
  searchFocused.value = false

  if (activeMainTab.value === 'discover') {
    setDiscoverDistanceAnchor(svc, 'service')
    openDiscoverDetail(mapServiceToDiscoverItem(svc, 0))
    return
  }

  const map = baseMapRef.value?.getMap?.()
  if (map) {
    map.flyTo({ center: [svc.lng, svc.lat], zoom: 15, duration: 1500 })
  }
  baseMapRef.value?.addMarker?.([svc.lng, svc.lat], {
    color: '#9B59B6',
    data: { type: 'service', name: svc.name }
  })
  statusMessage.value = `🛎️ <b>${svc.name}</b> (${getServiceTypeLabel(svc.type)})<br/>热度 ${svc.hotness}`
}

const journeySidebarPos = ref({ x: 0, y: 0 })
let dragOffset = { x: 0, y: 0 }
let isDragging = false

const myBookings = ref<any[]>([])
const validBookings = computed(() => myBookings.value.filter(b => !b.is_expired))
const bookingsCollapsed = ref(false)
let countdownTimer: any = null

// === 天气状态 ===
const weatherData = ref<{
  current: { temp: number; code: number; emoji: string; precipitation: number }
  hourly: { time: string; temp: number; code: number; emoji: string; precipProb: number }[]
  rainAlert: boolean
} | null>(null)
const weatherLoaded = ref(false)
const currentAddress = ref('')
const showWeatherDetail = ref(false)
let weatherAutoCloseTimer: any = null
watch(showWeatherDetail, (val) => {
  if (val) {
    clearTimeout(weatherAutoCloseTimer)
    weatherAutoCloseTimer = setTimeout(() => { showWeatherDetail.value = false }, 5000)
  } else {
    clearTimeout(weatherAutoCloseTimer)
  }
})

// 切到"我的"页面时刷新通知
watch(activeMainTab, (tab) => {
  if (tab === 'profile') {
    fetchNotifications()
    if (!notifPollTimer) {
      notifPollTimer = setInterval(fetchNotifications, 15000)
    }
  } else {
    if (notifPollTimer) {
      clearInterval(notifPollTimer)
      notifPollTimer = null
    }
  }
})

const showRainAlert = ref(false)
let weatherRefreshTimer: any = null
let notifPollTimer: any = null

function weatherCodeText(code: number): string {
  if (code === 0) return '晴天'
  if (code === 1) return '少云'
  if (code === 2) return '多云'
  if (code === 3) return '阴天'
  if (code === 45 || code === 48) return '雾'
  if (code >= 51 && code <= 55) return '毛毛雨'
  if (code >= 56 && code <= 67) return '雨'
  if (code >= 71 && code <= 77) return '雪'
  if (code >= 80 && code <= 82) return '阵雨'
  if (code >= 85 && code <= 86) return '阵雪'
  if (code >= 95) return '雷暴'
  return '未知'
}

function formatHour(timeStr: string): string {
  return timeStr.slice(11, 16)
}

async function fetchWeather() {
  try {
    const res = await fetch(`/api/weather?lat=${userLocation.value.lat}&lng=${userLocation.value.lng}`)
    const json = await res.json()
    if (json.success && json.data) {
      weatherData.value = json.data
      weatherLoaded.value = true
      // 获取地址
      fetchAddress()
      // 旅程中检测降雨
      if (journeyActive.value && json.data.rainAlert && !showRainAlert.value) {
        showRainAlert.value = true
      }
    }
  } catch (e) {
    console.warn('[天气] 获取失败:', e)
    weatherLoaded.value = true // 即使失败也隐藏加载态，避免永久转圈
  }
}

// 启动定时刷新天气（每30分钟）
function startWeatherRefresh() {
  // 立即获取，不等待
  fetchWeather()
  weatherRefreshTimer = setInterval(fetchWeather, 30 * 60 * 1000)
}

function stopWeatherRefresh() {
  if (weatherRefreshTimer) {
    clearInterval(weatherRefreshTimer)
    weatherRefreshTimer = null
  }
}

// 获取当前位置地址
async function fetchAddress() {
  try {
    const res = await fetch(`/api/geocode/reverse?lat=${userLocation.value.lat}&lng=${userLocation.value.lng}`)
    const json = await res.json()
    if (json.success && json.data?.address) {
      currentAddress.value = json.data.address
    }
  } catch (e) {
    console.warn('[地址] 获取失败:', e)
  }
}

function applyUserLocation(lat: number, lng: number, focusMap = false) {
  userLocation.value = { lat, lng }

  if (userMarker) {
    userMarker.remove()
    userMarker = null
  }
  if (baseMapRef.value) {
    userMarker = baseMapRef.value.addMarker([lng, lat], {
      color: '#8B4513',
      data: { type: 'user' }
    })
  }

  const map = baseMapRef.value?.getMap?.()
  if (focusMap && map) {
    map.flyTo({ center: [lng, lat], zoom: 15, duration: 1200 })
  }

  fetchAddress()
  fetchWeather()
}

function focusKnownUserLocation() {
  const map = baseMapRef.value?.getMap?.()
  const { lat, lng } = userLocation.value
  if (map) {
    map.flyTo({ center: [lng, lat], zoom: 15, duration: 1200 })
  }
  if (!userMarker && baseMapRef.value) {
    userMarker = baseMapRef.value.addMarker([lng, lat], {
      color: '#8B4513',
      data: { type: 'user' }
    })
  }
}

// 获取用户真实位置
function getUserLocation(focusMap = false) {
  if (!navigator.geolocation) {
    focusKnownUserLocation()
    if (focusMap) statusMessage.value = '当前浏览器不支持定位。'
    return
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude
      const lng = pos.coords.longitude
      applyUserLocation(lat, lng, focusMap)
      if (focusMap) statusMessage.value = '已定位到当前位置。'
    },
    (error) => {
      console.warn('[定位] 获取位置失败，使用默认位置', error)
      if (focusMap) {
        focusKnownUserLocation()
        statusMessage.value = '定位失败，请检查浏览器定位权限。已回到当前起点位置。'
      }
    },
    { enableHighAccuracy: true, timeout: 6000 }
  )
}

function locateMeOnMap() {
  statusMessage.value = '正在定位当前位置...'
  getUserLocation(true)
}

const journeyActive = ref(false)
const journeyCompact = ref(true)
const showJourneySetup = ref(false)
const journeySetupSpots = ref<{ name: string; duration: number }[]>([])
const journeyToast = ref('')
const journeyStartTime = ref<Date | null>(null)
const currentTimeStr = ref('')
let journeyTimer: any = null

interface ItineraryItem {
  id: string
  name: string
  icon: string
  type: DiscoverItemType | 'custom'
  duration: number
  tags: string[]
  distance: number | null
  raw: any
}
const itineraryItems = ref<ItineraryItem[]>([])
const visitedItineraryNames = computed(() => {
  if (!journeyActive.value) return []
  const visited: string[] = []
  for (let i = 0; i <= currentStageIndex.value; i++) {
    const stage = journeyStages.value[i]
    if (stage && (stage.type === 'visit' || stage.type === 'custom')) {
      visited.push(stage.name)
    }
  }
  return visited
})
const itineraryDragIdx = ref<number | null>(null)

function onItineraryDragStart(e: DragEvent, idx: number) {
  itineraryDragIdx.value = idx
  e.dataTransfer?.setData('text/plain', String(idx))
  if (e.currentTarget instanceof HTMLElement) {
    e.currentTarget.classList.add('dragging')
  }
}

function onItineraryDragOver(_e: DragEvent, idx: number) {
  if (itineraryDragIdx.value === null || itineraryDragIdx.value === idx) return
  const items = itineraryItems.value
  const from = itineraryDragIdx.value
  // 交换位置
  const temp = items[from]
  items[from] = items[idx]
  items[idx] = temp
  itineraryDragIdx.value = idx
  // 同步到行程系统
  journeySetupSpots.value = items.map(i => ({ name: i.name, duration: i.duration }))
}

function onItineraryDragEnd(e: DragEvent) {
  if (e.currentTarget instanceof HTMLElement) {
    e.currentTarget.classList.remove('dragging')
  }
  itineraryDragIdx.value = null
}

function removeItineraryItem(idx: number) {
  itineraryItems.value.splice(idx, 1)
  journeySetupSpots.value = itineraryItems.value.map(i => ({ name: i.name, duration: i.duration }))
}

function syncItineraryDurations() {
  journeySetupSpots.value = itineraryItems.value.map(i => ({ name: i.name, duration: i.duration }))
}

/** 将地图上的途经点同步到侧边栏行程列表 */
function syncWaypointsToItineraryItems() {
  const items: ItineraryItem[] = []
  // 起点（当前位置）
  if (userLocation.value.lat && userLocation.value.lng) {
    items.push({
      id: 'start',
      name: '📍 当前位置',
      icon: '📍',
      type: 'spot',
      duration: 0,
      tags: ['起点'],
      distance: null,
      raw: { lat: userLocation.value.lat, lng: userLocation.value.lng }
    })
  }
  // 途经点
  waypoints.value.forEach((wp, i) => {
    if (wp.name) {
      items.push({
        id: 'waypoint-' + i,
        name: wp.name,
        icon: wp.type === 'poi' ? '🏯' : '📍',
        type: wp.type === 'poi' ? 'spot' : 'custom',
        duration: 2,
        tags: wp.type === 'poi' ? ['途经景点'] : ['途经点'],
        distance: null,
        raw: { lat: wp.lat, lng: wp.lng, name: wp.name }
      })
    }
  })
  // 终点
  if (currentEnd.value) {
    items.push({
      id: 'end',
      name: currentEnd.value.name,
      icon: '🏁',
      type: 'spot',
      duration: 2,
      tags: ['终点'],
      distance: null,
      raw: { lat: currentEnd.value.lat, lng: currentEnd.value.lng, name: currentEnd.value.name }
    })
  }
  itineraryItems.value = items
  journeySetupSpots.value = items.map(i => ({ name: i.name, duration: i.duration }))
}

interface JourneyStage {
  name: string
  type: 'visit' | 'travel' | 'custom'
  duration: number
  startOffset: number
  timeLabel: string
  customType?: string
  poiInfo?: { name: string; lat: number; lng: number }
}

const journeyStages = ref<JourneyStage[]>([])

const showJourneyEdit = ref(false)
const editStages = ref<JourneyStage[]>([])
const editCurrentIdx = ref(0)

const showInsertPoiModal = ref(false)
const insertPoiTargetIdx = ref(-1)
const insertPoiKeyword = ref('')
const insertPoiResults = ref<any[]>([])
const insertPoiLoading = ref(false)
const insertPoiDone = ref(false)

const showStylePanel = ref(false)
const availableStyles = ref<string[]>([])
const selectedStyle = ref('')
const styleCount = ref(5)
const styleLoading = ref(false)
const styleResults = ref<any[]>([])
const personalResults = ref<any[]>([])
const personalPreferences = ref<any[]>([])
const personalMessage = ref('')

function hideStylePanelForOtherRecommendation() {
  showStylePanel.value = false
}

const smartStartHour = ref(8)
const smartItinerary = ref<any>(null)

// === AI 拍照指导状态 ===
const photoGuidanceText = ref('')
const photoGuidancePoses = ref<any[]>([])
const photoGuidancePosePool = ref<any[]>([])
const loadingGuidance = ref(false)
const guidanceContext = ref({ clothing: '', makeup: '' })
const showPoseModal = ref(false)
const poseFallbackUrl = '/images/poses/pose-placeholder.svg'

function openPoseModal() {
  const pool = photoGuidancePosePool.value.length > 0 ? photoGuidancePosePool.value : photoGuidancePoses.value
  if (pool.length === 0) return
  photoGuidancePoses.value = [...pool]
    .map(item => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, 2)
    .map(entry => entry.item)
  showPoseModal.value = true
}

function closePoseModal() {
  showPoseModal.value = false
}

function onPoseImgError(e: Event) {
  const img = e.target as HTMLImageElement | null
  if (!img) return
  if (img.src.endsWith(poseFallbackUrl)) return
  img.src = poseFallbackUrl
}

const showFlowchart = ref(false)
const showCampusNavModal = ref(false)

async function ensureStyleOptions() {
  if (availableStyles.value.length > 0) return
  try {
    const res = await fetch('/api/styles')
    const data = await res.json()
    availableStyles.value = data.data || []
  } catch (e) {
    console.error(e)
    availableStyles.value = ['古风', '现代', '自然', '欧风', '商业', '其他']
  }
}

async function fetchUserPreferences() {
  const token = localStorage.getItem('token')
  if (!token) {
    personalPreferences.value = []
    return
  }
  try {
    const res = await fetch('/api/userPreference', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const data = await res.json()
    if (data.success) {
      personalPreferences.value = data.preferences || []
    }
  } catch (error) {
    console.error('获取用户偏好失败', error)
  }
}

function clampRating(value: any, fallback = 4.6): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.max(0, Math.min(5, n))
}

function numOrNull(value: any): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function numOr(value: any, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function clientHaversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => deg * Math.PI / 180
  const radius = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function getDiscoverAnchorPoint() {
  return discoverDistanceAnchor.value || {
    name: '当前位置',
    lat: userLocation.value.lat,
    lng: userLocation.value.lng,
    source: 'current' as const
  }
}

function getRecommendationAnchor() {
  if (activeMainTab.value === 'discover') {
    const anchor = getDiscoverAnchorPoint()
    return { lat: anchor.lat, lng: anchor.lng }
  }
  return { lat: userLocation.value.lat, lng: userLocation.value.lng }
}

function getDiscoverItemDistance(raw: any): number | null {
  const lat = Number(raw?.lat)
  const lng = Number(raw?.lng)
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const anchor = getDiscoverAnchorPoint()
    return Math.round(clientHaversineDistance(anchor.lat, anchor.lng, lat, lng) * 10) / 10
  }
  return numOrNull(raw?.distance)
}

function setDiscoverDistanceAnchor(raw: any, source: DiscoverItemType | 'current') {
  const lat = Number(raw?.lat)
  const lng = Number(raw?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
  discoverDistanceAnchor.value = {
    name: raw?.name || (source === 'current' ? '当前位置' : '已选地点'),
    lat,
    lng,
    source
  }
  activeDiscoverSpotSort.value = 'distance'
  activeFoodSort.value = 'distance'
  foodSortType.value = 'distance'
  statusMessage.value = `发现页距离基准已设为 ${discoverDistanceAnchor.value.name}。`
  refreshDiscoverPage()
}

function useCurrentLocationAsDiscoverAnchor() {
  discoverDistanceAnchor.value = null
  activeDiscoverSpotSort.value = 'distance'
  activeFoodSort.value = 'distance'
  foodSortType.value = 'distance'
  statusMessage.value = '发现页距离基准已切回当前位置。'
  refreshDiscoverPage()
}

function discoverUid(type: DiscoverItemType, raw: any): string {
  return `${type}:${raw?.id ?? raw?.name ?? Math.random().toString(36).slice(2)}`
}

function emptyDiscoverInteraction(): DiscoverInteractionState {
  return {
    likeCount: 0,
    favoriteCount: 0,
    myLike: false,
    myFavorite: false,
    ratingAvg: 0,
    ratingCount: 0,
    reviews: []
  }
}

function getDiscoverInteraction(uid: string): DiscoverInteractionState {
  return discoverInteractionMap.value[uid] || emptyDiscoverInteraction()
}

function getPoiIcon(idx: number, style?: string): string {
  if (style?.includes('自然')) return '🌿'
  if (style?.includes('现代')) return '🏙️'
  if (style?.includes('商业')) return '🏠'
  return ['🏛️', '🌿', '🏙️', '🏠'][idx % 4]
}

function buildPoiDescription(poi: any): string {
  return poi?.description || '暂无介绍'
}

function getFoodIcon(food: any): string {
  const name = `${food?.name || ''}${food?.cuisine || ''}`
  if (name.includes('川') || name.includes('辣')) return '🌶️'
  if (name.includes('烤鸭')) return '🦆'
  if (name.includes('日') || name.includes('寿司') || name.includes('鮨')) return '🍣'
  if (name.includes('甜') || name.includes('蛋糕') || name.includes('Lady')) return '🍰'
  if (name.includes('包') || name.includes('饺')) return '🥟'
  return '🍜'
}

function getServiceDiscoverIcon(type: string): string {
  const icons: Record<string, string> = {
    photographer: '📷',
    makeup: '💄',
    drone: '🚁',
    clothing: '👗'
  }
  return icons[type] || '📸'
}

function mapPoiToDiscoverItem(poi: any, idx: number): DiscoverItem {
  const uid = discoverUid('spot', poi)
  const interaction = getDiscoverInteraction(uid)
  const hotness = numOr(poi?.hotness, 0)
  const rating = clampRating(interaction.ratingAvg || poi?.rating_avg || poi?.rating, 0)
  const style = poi?.style || '城市漫游'
  return {
    uid,
    type: 'spot',
    raw: poi,
    id: poi?.id ?? poi?.name ?? idx,
    name: poi?.name || '未命名景点',
    icon: getPoiIcon(idx, style),
    coverClass: `cover-${idx % 4}`,
    tags: [style, poi?.category || '景点'].filter(Boolean),
    rating,
    hotness,
    distance: getDiscoverItemDistance(poi),
    address: poi?.address || '地址待补充',
    price: poi?.ticket || poi?.price || '门票待定',
    description: buildPoiDescription(poi),
    gallery: ['🏯', '🏛️', '🎨'],
    reviews: interaction.reviews,
    likeCount: interaction.likeCount,
    favoriteCount: interaction.favoriteCount
  }
}

function mapFoodToDiscoverItem(food: any, idx: number): DiscoverItem {
  const uid = discoverUid('food', food)
  const interaction = getDiscoverInteraction(uid)
  const rating = clampRating(interaction.ratingAvg || food?.rating, 0)
  const hotness = numOr(food?.hotness, 0)
  const price = food?.avg_price ? `¥${food.avg_price}/人` : food?.price_level ? '¥'.repeat(Number(food.price_level)) : '价格待定'
  return {
    uid,
    type: 'food',
    raw: food,
    id: food?.id ?? food?.name ?? idx,
    name: food?.name || '未命名美食',
    icon: getFoodIcon(food),
    coverClass: `food-${idx % 6}`,
    tags: [food?.cuisine || '美食', food?.style].filter(Boolean),
    rating,
    hotness,
    distance: getDiscoverItemDistance(food),
    address: food?.address || '地址待补充',
    price,
    description: food?.description || `${food?.cuisine || '本地'}风味餐厅，适合加入旅行路线中的用餐节点。`,
    gallery: [getFoodIcon(food), '🍽️', '🥢'],
    reviews: interaction.reviews,
    cuisine: food?.cuisine || '美食',
    dianpingUrl: food?.dianpingUrl,
    likeCount: interaction.likeCount,
    favoriteCount: interaction.favoriteCount
  }
}

function mapServiceToDiscoverItem(service: any, idx: number): DiscoverItem {
  const uid = discoverUid('service', service)
  const interaction = getDiscoverInteraction(uid)
  const type = service?.type || 'photographer'
  const hotness = numOr(service?.hotness, 0)
  const rating = clampRating(interaction.ratingAvg || service?.rating, 0)
  return {
    uid,
    type: 'service',
    raw: service,
    id: service?.id ?? service?.name ?? idx,
    name: service?.name || '未命名旅拍服务',
    icon: getServiceDiscoverIcon(type),
    coverClass: `service-${idx % 4}`,
    tags: [getServiceTypeLabel(type).replace(/^.+? /, ''), service?.style || '旅拍'].filter(Boolean),
    rating,
    hotness,
    distance: getDiscoverItemDistance(service),
    address: service?.address || '支持路线规划，可直接设为终点。',
    price: service?.price ? `¥${service.price}` : '价格咨询',
    description: service?.description || service?.address || '可设为路线终点。',
    gallery: [getServiceDiscoverIcon(type), '📸', '✨'],
    reviews: interaction.reviews,
    serviceType: type,
    likeCount: interaction.likeCount,
    favoriteCount: interaction.favoriteCount
  }
}

function scrollDiscoverSection(section: DiscoverSection) {
  activeDiscoverSection.value = section
  const target = {
    spots: discoverSpotsRef.value,
    foods: discoverFoodsRef.value,
    services: discoverServicesRef.value
  }[section]
  const scroller = target?.closest('.discover-scroll-body') as HTMLElement | null
  if (target && scroller) {
    const top = target.offsetTop - scroller.offsetTop
    scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  } else {
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function setDiscoverSpotSort(sort: DiscoverSpotSort) {
  activeDiscoverSpotSort.value = sort
  fetchRecommendations(sort)
}

function setDiscoverFoodCuisine(cuisine: string) {
  activeFoodCuisine.value = cuisine
  foodCuisineFilter.value = cuisine
  fetchFoodRecommendations()
}

function setDiscoverFoodSort(sort: DiscoverFoodSort) {
  activeFoodSort.value = sort
  foodSortType.value = sort
  fetchFoodRecommendations()
}

function formatDiscoverDistance(distance: number | null): string {
  return typeof distance === 'number' ? `${distance.toFixed(1)}km` : '-- km'
}

function formatMaybeDistance(distance: any): string {
  const n = Number(distance)
  return Number.isFinite(n) ? `${n.toFixed(1)}km` : '-- km'
}

function authHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = {}
  const token = localStorage.getItem('token')
  if (token) headers.Authorization = `Bearer ${token}`
  if (json) headers['Content-Type'] = 'application/json'
  return headers
}

function normalizeDiscoverInteraction(data: any): DiscoverInteractionState {
  return {
    likeCount: numOr(data?.likeCount, 0),
    favoriteCount: numOr(data?.favoriteCount, 0),
    myLike: !!data?.myLike,
    myFavorite: !!data?.myFavorite,
    ratingAvg: numOr(data?.ratingAvg, 0),
    ratingCount: numOr(data?.ratingCount, 0),
    reviews: Array.isArray(data?.reviews) ? data.reviews : []
  }
}

function mergeDiscoverInteraction(uid: string, data: any) {
  const next = normalizeDiscoverInteraction(data)
  discoverInteractionMap.value = {
    ...discoverInteractionMap.value,
    [uid]: next
  }
  if (selectedDiscoverItem.value?.uid === uid) {
    selectedDiscoverItem.value = {
      ...selectedDiscoverItem.value,
      rating: next.ratingAvg || selectedDiscoverItem.value.rating,
      reviews: next.reviews,
      likeCount: next.likeCount,
      favoriteCount: next.favoriteCount
    }
  }
}

async function loadDiscoverInteractions(keys: string[]) {
  const uniqueKeys = Array.from(new Set(keys.filter(Boolean)))
  if (uniqueKeys.length === 0) return
  try {
    const res = await fetch(`/api/discover/interactions?items=${encodeURIComponent(uniqueKeys.join(','))}`, {
      headers: authHeaders()
    })
    const data = await res.json()
    if (!res.ok || !data.success) {
      throw new Error(data.error || '互动数据加载失败')
    }
    const nextMap = { ...discoverInteractionMap.value }
    Object.entries(data.data || {}).forEach(([uid, state]) => {
      nextMap[uid] = normalizeDiscoverInteraction(state)
    })
    discoverInteractionMap.value = nextMap
    if (selectedDiscoverItem.value?.uid && nextMap[selectedDiscoverItem.value.uid]) {
      mergeDiscoverInteraction(selectedDiscoverItem.value.uid, nextMap[selectedDiscoverItem.value.uid])
    }
  } catch (error) {
    console.warn('[发现页互动] 加载失败:', error)
  }
}

async function refreshVisibleDiscoverInteractions() {
  await nextTick()
  await loadDiscoverInteractions([
    ...recommendedPois.value.slice(0, 12).map(item => discoverUid('spot', item)),
    ...foodRecommendations.value.map(item => discoverUid('food', item)),
    ...travelServices.value.map(item => discoverUid('service', item))
  ])
}

function isDiscoverFavorite(item: DiscoverItem | null): boolean {
  if (!item) return false
  return getDiscoverInteraction(item.uid).myFavorite
}

async function toggleDiscoverFavorite(item: DiscoverItem | null) {
  if (!item) return
  if (!localStorage.getItem('token')) {
    statusMessage.value = '请先登录后再收藏。'
    return
  }
  try {
    const res = await fetch(`/api/discover/${item.type}/${encodeURIComponent(String(item.id))}/reaction`, {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify({ reactionType: 'favorite' })
    })
    const data = await res.json()
    if (!res.ok || !data.success) {
      throw new Error(data.error || '收藏失败')
    }
    mergeDiscoverInteraction(item.uid, data.data)
  } catch (error: any) {
    statusMessage.value = error?.message || '收藏失败，请稍后重试。'
  }
}

function isDiscoverLiked(item: DiscoverItem | null): boolean {
  if (!item) return false
  return getDiscoverInteraction(item.uid).myLike
}

async function toggleDiscoverLike(item: DiscoverItem | null) {
  if (!item) return
  if (!localStorage.getItem('token')) {
    statusMessage.value = '请先登录后再点赞。'
    return
  }
  try {
    const res = await fetch(`/api/discover/${item.type}/${encodeURIComponent(String(item.id))}/reaction`, {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify({ reactionType: 'like' })
    })
    const data = await res.json()
    if (!res.ok || !data.success) {
      throw new Error(data.error || '点赞失败')
    }
    mergeDiscoverInteraction(item.uid, data.data)
  } catch (error: any) {
    statusMessage.value = error?.message || '点赞失败，请稍后重试。'
  }
}

function getDiscoverLikeCount(item: DiscoverItem | null): number {
  if (!item) return 0
  return getDiscoverInteraction(item.uid).likeCount || item.likeCount
}

function getDiscoverFavoriteCount(item: DiscoverItem | null): number {
  if (!item) return 0
  return getDiscoverInteraction(item.uid).favoriteCount || item.favoriteCount
}

function getDiscoverReviews(item: DiscoverItem | null): DiscoverReview[] {
  if (!item) return []
  return getDiscoverInteraction(item.uid).reviews || item.reviews
}

function getDiscoverDisplayRating(item: DiscoverItem | null): number {
  if (!item) return 0
  const reviews = getDiscoverReviews(item)
  if (!reviews.length) return item.rating
  return reviews.reduce((sum, review) => sum + review.stars, 0) / reviews.length
}

function openDiscoverDetail(item: DiscoverItem) {
  selectedDiscoverItem.value = item
  ratingDraft.value = 5
  commentDraft.value = ''
  recordProfileBrowse(item)
  showDiscoverDetail.value = true
  discoverDetailPos.value = { x: (window.innerWidth - 860) / 2, y: (window.innerHeight - 500) / 2 }
  loadDiscoverInteractions([item.uid])
}

function closeDiscoverDetail() {
  showDiscoverDetail.value = false
  selectedDiscoverItem.value = null
}

function recordProfileBrowse(item: DiscoverItem) {
  const row = {
    id: item.uid,
    type: item.type,
    name: item.name,
    icon: item.icon,
    meta: item.tags.join(' · ') || item.address || '浏览记录'
  }
  profileBrowseHistory.value = [row, ...profileBrowseHistory.value.filter(history => history.id !== item.uid)].slice(0, 30)
  localStorage.setItem('profile_browse_history', JSON.stringify(profileBrowseHistory.value))
}

async function openProfileBookings() {

  showProfileBookingsModal.value = true
}

async function openProfilePreference() {
  await fetchUserPreferences()
  showProfilePreferenceModal.value = true
}

function openProfileSettings() {
  profileSettings.value = {
    avatarFile: null,
    avatarPreview: profileAvatar.value || '🎭',
    nickname: currentUser.value?.username || '',
    password: '',
    confirmPassword: ''
  }
  profileSettingsMessage.value = ''
  showProfileSettingsModal.value = true
}

function handleProfileAvatarChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    profileSettingsMessage.value = '请选择图片文件作为头像'
    input.value = ''
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    profileSettingsMessage.value = '头像图片不能超过 5MB'
    input.value = ''
    return
  }
  profileSettingsMessage.value = ''
  profileSettings.value.avatarFile = file
  const reader = new FileReader()
  reader.onload = () => {
    profileSettings.value.avatarPreview = String(reader.result || profileAvatar.value || '🎭')
  }
  reader.readAsDataURL(file)
}

async function saveProfileSettings() {
  const nickname = profileSettings.value.nickname.trim()
  if (!nickname) {
    profileSettingsMessage.value = '昵称不能为空'
    return
  }
  const password = profileSettings.value.password.trim()
  const confirmPassword = profileSettings.value.confirmPassword.trim()
  if (password || confirmPassword) {
    if (password !== confirmPassword) {
      profileSettingsMessage.value = '两次输入的密码不一致'
      return
    }
    if (!/^.{8,128}$/u.test(password)) {
      profileSettingsMessage.value = '密码必须为8至128个字符'
      return
    }
  }
  const token = localStorage.getItem('token')
  if (!token) {
    profileSettingsMessage.value = '请先登录后再修改个人信息'
    return
  }

  try {
    const hasAvatarFile = !!profileSettings.value.avatarFile
    let body: BodyInit
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`
    }

    if (hasAvatarFile) {
      const formData = new FormData()
      formData.append('username', nickname)
      if (password) formData.append('password', password)
      if (profileSettings.value.avatarFile) {
        formData.append('avatar', profileSettings.value.avatarFile)
      }
      body = formData
    } else {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify({
        username: nickname,
        ...(password ? { password } : {})
      })
    }

    const res = await fetch('/api/user/profile', {
      method: 'PUT',
      headers,
      body
    })
    const data = await res.json()
    if (!res.ok || !data.success) {
      throw new Error(data.error || '保存失败')
    }
    if (data.token) {
      localStorage.setItem('token', data.token)
    }

    const savedUser = currentUser.value || { id: 0, username: nickname }
    const returnedUser = data.user || {}
    const avatar = returnedUser.avatar_url || returnedUser.avatar || profileAvatar.value || '🎭'
    const nextUser = { ...savedUser, ...returnedUser, username: nickname, avatar, avatar_url: avatar }
    currentUser.value = nextUser
    localStorage.setItem('user', JSON.stringify(nextUser))
    profileSettings.value.avatarFile = null
    profileSettings.value.avatarPreview = avatar
    profileSettings.value.password = ''
    profileSettings.value.confirmPassword = ''
    profileSettingsMessage.value = '已保存个人信息'
  } catch (error: any) {
    profileSettingsMessage.value = error?.message || '保存失败，请稍后重试'
  }
}

async function submitDiscoverReview() {
  const item = selectedDiscoverItem.value
  const text = commentDraft.value.trim()
  if (!item || !text) return
  if (!localStorage.getItem('token')) {
    statusMessage.value = '请先登录后再评价。'
    return
  }

  try {
    const res = await fetch(`/api/discover/${item.type}/${encodeURIComponent(String(item.id))}/reviews`, {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify({
        rating: ratingDraft.value,
        comment: text
      })
    })
    const data = await res.json()
    if (!res.ok || !data.success) {
      throw new Error(data.error || '评价提交失败')
    }
    mergeDiscoverInteraction(item.uid, data.data)
    commentDraft.value = ''
  } catch (error: any) {
    statusMessage.value = error?.message || '评价提交失败，请稍后重试。'
  }
}

function setDiscoverItemAsEnd(item: DiscoverItem | null) {
  if (!item) return
  if (item.type === 'spot') {
    selectPoiAsEnd(item.raw)
  } else if (item.type === 'food') {
    setFoodAsEnd(item.raw)
  } else {
    setServiceAsEnd(item.raw)
  }
}

function addDiscoverItemToJourney(item: DiscoverItem | null) {
  if (!item) return
  // 加入行程队列（按点击顺序，保留所有）
  const existing = itineraryItems.value.find(s => s.name === item.name)
  if (!existing) {
    itineraryItems.value.push({
      id: item.uid,
      name: item.name,
      icon: item.icon,
      type: item.type,
      duration: 2,
      tags: item.tags,
      distance: item.distance,
      raw: item.raw,
    })
  }
  // 同步到现有行程系统
  setDiscoverItemAsEnd(item)
  journeySetupSpots.value = itineraryItems.value.map(i => ({ name: i.name, duration: i.duration }))

  // 显示 Toast
  journeyToast.value = '🎉 加入成功啦，去行程看看吧！'
  setTimeout(() => { journeyToast.value = '' }, 2000)
}

async function startItineraryJourney() {
  const items = itineraryItems.value
  if (items.length < 2) {
    journeyToast.value = '⚠️ 请至少添加 2 个地点再开始旅程'
    setTimeout(() => { journeyToast.value = '' }, 2000)
    return
  }

  // 构建多点（起点 + 所有行程点）
  const allPoints: { lat: number; lng: number }[] = [
    { lat: userLocation.value.lat, lng: userLocation.value.lng },
  ]
  items.forEach(item => {
    if (item.raw && item.raw.lat != null && item.raw.lng != null) {
      allPoints.push({ lat: item.raw.lat, lng: item.raw.lng })
    }
  })

  if (allPoints.length < 2) return

  journeyToast.value = '🚀 正在规划旅程路线（最近邻+2-opt优化）...'
  setTimeout(() => { journeyToast.value = '' }, 300)

  // 调用后端多点路线 API（同多位一体推荐算法）
  try {
    const pointsParam = allPoints.map(p => `${p.lng},${p.lat}`).join(';')
    const res = await fetch(`/api/multiRoute?points=${encodeURIComponent(pointsParam)}&transportMode=${transportMode.value}`)
    const data = await res.json()

    if (data.success && data.fullPath && baseMapRef.value) {
      baseMapRef.value.clearRoute()
      const allCoords: [number, number][] = data.fullPath.map((pt: number[]) => [pt[0], pt[1]] as [number, number])
      baseMapRef.value.drawRoute(allCoords, data.segmentCongestion || data.travelTimes?.congestionFactor)
      baseMapRef.value.fitBounds(allCoords)
      hasRoute.value = true

      if (data.travelTimes) travelTimes.value = data.travelTimes

      // 同步到地图途经点列表
      syncWaypointsToItineraryItems()

      const modeLabel = transportOptions.find(o => o.value === transportMode.value)?.label || transportMode.value
      let timeStr = ''
      if (data.timeEstimate) {
        const mins = data.timeEstimate.durationMinutes
        timeStr = mins < 60
          ? `，预计 ${Math.round(mins)} 分钟`
          : `，预计 ${Math.floor(mins / 60)}小时${Math.round(mins % 60)}分钟`
      }
      statusMessage.value = `${modeLabel}路线规划完成！总距离 ${data.distance?.toFixed(2) || '?'} km${timeStr}`

      // 切换到地图视图展示路线
      activeMainTab.value = 'map'
      panelView.value = 'map'
      panelOpen.value = true

      journeyToast.value = '✅ 旅程已开启，祝旅途愉快！'
      setTimeout(() => { journeyToast.value = '' }, 2000)
    } else {
      journeyToast.value = '❌ 路线规划失败，请稍后重试'
      setTimeout(() => { journeyToast.value = '' }, 2000)
    }
  } catch (error) {
    console.error(error)
    journeyToast.value = '❌ 路线规划失败，请检查服务'
    setTimeout(() => { journeyToast.value = '' }, 2000)
  }
}

function openDiscoverBooking(item: DiscoverItem | null) {
  if (!item) return
  if (item.type !== 'service') return
  openBookModal(item.raw)
}

async function refreshDiscoverPage() {
  discoverLoading.value = true
  discoverDataError.value = ''
  try {
    await Promise.all([
      fetchRecommendations('hotness'),
      fetchFoodRecommendations(),
      fetchTravelServices()
    ])
    await refreshVisibleDiscoverInteractions()
  } catch (error: any) {
    discoverDataError.value = error?.message || '发现页数据加载失败'
  } finally {
    discoverLoading.value = false
  }
}

async function switchMainTab(tab: MainTab) {
  activeMainTab.value = tab
  if (tab === 'map' || tab === 'trip') {
    panelView.value = tab === 'trip' ? 'trip' : 'map'
    panelOpen.value = true
    if (tab === 'trip') {
      await ensureStyleOptions()
      if (!selectedStyle.value && availableStyles.value.length > 0) {
        selectedStyle.value = availableStyles.value[0]
      }
      if (currentUser.value) {
        await fetchUserPreferences()
      }
    }
    return
  }

  panelOpen.value = false

  if (tab === 'discover') {
    if (
      recommendedPois.value.length === 0 &&
      foodRecommendations.value.length === 0 &&
      travelServices.value.length === 0
    ) {
      await refreshDiscoverPage()
    }
    return
  }

  if (tab === 'profile') {
    await Promise.all([

      fetchUserPreferences()
    ])
  }
}

function goToCampusNav(_campusId: string) {
  showCampusNavModal.value = false
  router.push({ name: 'CampusNav' })
}

function goToScenicNav(_scenicId: string) {
  showCampusNavModal.value = false
  router.push({ name: 'ScenicNav' })
}

const currentStageIndex = computed(() => {
  if (!journeyStartTime.value || journeyStages.value.length === 0) return 0
  const elapsed = (Date.now() - journeyStartTime.value.getTime()) / (1000 * 60 * 60)
  for (let i = journeyStages.value.length - 1; i >= 0; i--) {
    if (elapsed >= journeyStages.value[i].startOffset) return i
  }
  return 0
})

const availableDates = (() => {
  const dates = []
  const now = new Date()
  for (let i = 0; i < 7; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() + i)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const weekDays = ['日', '一', '二', '三', '四', '五', '六']
    dates.push({
      value: `${d.getFullYear()}-${mm}-${dd}`,
      label: i === 0 ? '今天' : i === 1 ? '明天' : `周${weekDays[d.getDay()]} ${mm}/${dd}`
    })
  }
  return dates
})()

onMounted(() => {
  const userStr = localStorage.getItem('user')
  if (userStr) {
    currentUser.value = JSON.parse(userStr)
  }
  const tab = route.query.tab
  if (tab === 'trip' || tab === 'discover' || tab === 'profile') {
    switchMainTab(tab)
  }

  fetchUserPreferences()
  fetchNotifications()
  startWeatherRefresh()
  // 获取用户真实位置
  getUserLocation(false)

  setTimeout(() => {
    if (baseMapRef.value && !userMarker) {
      userMarker = baseMapRef.value.addMarker([userLocation.value.lng, userLocation.value.lat], {
        color: '#8B4513',
        data: { type: 'user' }
      })
    }
  }, 500)

  
})

onUnmounted(() => {
  stopWeatherRefresh()
  if (countdownTimer) clearInterval(countdownTimer)
  if (journeyTimer) clearInterval(journeyTimer)
  if (notifPollTimer) clearInterval(notifPollTimer)
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
})

function updateJourneyClock() {
  const now = new Date()
  currentTimeStr.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
}

function openJourneySetup() {
  // 优先使用行程面板中的多地点列表
  if (itineraryItems.value.length > 0) {
    journeySetupSpots.value = itineraryItems.value.map(i => ({
      name: i.name,
      duration: i.duration
    }))
  } else if (smartItinerary.value && smartItinerary.value.events.length > 0) {
    const spots: { name: string; duration: number }[] = []
    smartItinerary.value.events.forEach((e: any) => {
      const dur = e.endHour - e.startHour
      spots.push({ name: e.name, duration: Math.max(dur, 1) })
    })
    journeySetupSpots.value = spots
  } else {
    const spots: { name: string; duration: number }[] = []
    waypoints.value.forEach(wp => {
      spots.push({ name: wp.name || '途经点', duration: 1 })
    })
    if (currentEnd.value) {
      spots.push({ name: currentEnd.value.name, duration: 2 })
    }
    journeySetupSpots.value = spots
  }
  showJourneySetup.value = true
}

function startJourney() {
  showJourneySetup.value = false

  const stages: JourneyStage[] = []
  let offset = 0
  const now = new Date()

  const fmtTime = (ms: number) => {
    const d = new Date(now.getTime() + ms)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  stages.push({
    name: '起点出发',
    type: 'visit',
    duration: 0,
    startOffset: 0,
    timeLabel: fmtTime(0)
  })

  for (let i = 0; i < journeySetupSpots.value.length; i++) {
    const spot = journeySetupSpots.value[i]
    // 根据交通方式估算通行时间（小时）
    const idealSpeed = transportOptions.find(o => o.value === transportMode.value)?.speed || 60
    // 假设景点间平均距离 15km，拥挤系数驾车0.7/骑车1.0/步行1.0
    const avgDist = 15
    const congestionMul = transportMode.value === 'driving' ? 0.7 : 1.0
    const travelHours = Math.max(0.5, Math.round((avgDist / (idealSpeed * congestionMul)) * 2) / 2) // 四舍五入到0.5小时
    const travelStartMs = offset * 3600000
    const travelEndMs = (offset + travelHours) * 3600000
    stages.push({
      name: `→ 前往${spot.name}`,
      type: 'travel',
      duration: travelHours,
      startOffset: offset,
      timeLabel: `${fmtTime(travelStartMs)} - ${fmtTime(travelEndMs)}`
    })
    offset += travelHours

    const visitDur = spot.duration
    const visitStartMs = offset * 3600000
    const visitEndMs = (offset + visitDur) * 3600000
    stages.push({
      name: spot.name,
      type: 'visit',
      duration: visitDur,
      startOffset: offset,
      timeLabel: `${fmtTime(visitStartMs)} - ${fmtTime(visitEndMs)}`
    })
    offset += visitDur
  }

  const activeBookings = myBookings.value.filter((b: any) => !b.is_expired)
  if (activeBookings.length > 0) {
    const journeyStartMs = now.getTime()
    const journeyEndMs = journeyStartMs + offset * 3600000
    const conflictingBookings: any[] = []

    for (const booking of activeBookings) {
      const bTime = new Date(booking.booked_time).getTime()
      const bEnd = bTime + 2 * 3600000
      if (bTime < journeyEndMs && bEnd > journeyStartMs) {
        conflictingBookings.push(booking)
      }
    }

    if (conflictingBookings.length > 0) {
      const insertedStages = insertBookingStages(stages, conflictingBookings, now, offset)
      journeyStages.value = insertedStages.stages
      offset = insertedStages.totalOffset

      const names = conflictingBookings.map((b: any) => b.service_name).join('、')
      bookingAlertMsg.value = `检测到您在旅程期间有以下旅拍服务预约：${names}。已自动将旅拍服务插入旅程时间线，优先保证旅拍和景点时间完整。`
      showBookingAlert.value = true
    } else {
      journeyStages.value = stages
    }
  } else {
    journeyStages.value = stages
  }

  journeyStartTime.value = new Date()
  journeyActive.value = true
  journeySidebarPos.value = { x: 420, y: 20 }
  updateJourneyClock()
  journeyTimer = setInterval(updateJourneyClock, 1000)
  // 启动时检查天气
  fetchWeather()
}

function insertBookingStages(
  existingStages: JourneyStage[],
  bookings: any[],
  baseTime: Date,
  currentOffset: number
): { stages: JourneyStage[]; totalOffset: number } {
  const fmtTime = (ms: number) => {
    const d = new Date(baseTime.getTime() + ms)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const sortedBookings = [...bookings].sort((a, b) => {
    return new Date(a.booked_time).getTime() - new Date(b.booked_time).getTime()
  })

  const journeyStartMs = baseTime.getTime()
  const bookingSlots: { startHour: number; endHour: number; name: string; booking: any }[] = []

  for (const booking of sortedBookings) {
    const bTime = new Date(booking.booked_time).getTime()
    const bEnd = bTime + 2 * 3600000
    const startHour = (bTime - journeyStartMs) / 3600000
    const endHour = (bEnd - journeyStartMs) / 3600000
    bookingSlots.push({
      startHour: Math.max(0, startHour),
      endHour,
      name: booking.service_name,
      booking
    })
  }

  const result: JourneyStage[] = []
  let cursor = 0

  for (const slot of bookingSlots) {
    if (slot.startHour > cursor) {
      const gap = slot.startHour - cursor
      if (gap >= 0.5) {
        const startMs = cursor * 3600000
        const endMs = slot.startHour * 3600000
        result.push({
          name: '空闲',
          type: 'custom',
          duration: gap,
          startOffset: cursor,
          timeLabel: `${fmtTime(startMs)} - ${fmtTime(endMs)}`,
          customType: '空闲'
        })
      }
    }

    if (slot.startHour > cursor + 0.01) {
      // booking starts after cursor - there was a gap handled above
    }

    const bStartMs = slot.startHour * 3600000
    const bEndMs = slot.endHour * 3600000
    result.push({
      name: `📸 ${slot.name}`,
      type: 'custom',
      duration: slot.endHour - slot.startHour,
      startOffset: slot.startHour,
      timeLabel: `${fmtTime(bStartMs)} - ${fmtTime(bEndMs)}`,
      customType: '旅拍服务'
    })

    cursor = slot.endHour
  }

  if (cursor < currentOffset) {
    const gap = currentOffset - cursor
    if (gap >= 0.5) {
      const startMs = cursor * 3600000
      const endMs = currentOffset * 3600000
      result.push({
        name: '空闲',
        type: 'custom',
        duration: gap,
        startOffset: cursor,
        timeLabel: `${fmtTime(startMs)} - ${fmtTime(endMs)}`,
        customType: '空闲'
      })
    }
  }

  const merged = [...existingStages, ...result].sort((a, b) => a.startOffset - b.startOffset)

  let finalOffset = 0
  for (const stage of merged) {
    stage.startOffset = finalOffset
    const dur = stage.duration
    const startMs = finalOffset * 3600000
    const endMs = (finalOffset + dur) * 3600000
    stage.timeLabel = `${fmtTime(startMs)} - ${fmtTime(endMs)}`
    finalOffset += dur
  }

  return { stages: merged, totalOffset: finalOffset }
}

function exitJourney() {
  journeyActive.value = false
  journeyStages.value = []
  journeyStartTime.value = null
  showJourneyEdit.value = false
  if (journeyTimer) {
    clearInterval(journeyTimer)
    journeyTimer = null
  }
}

function openJourneyEdit() {
  editStages.value = journeyStages.value.map(s => ({ ...s }))
  editCurrentIdx.value = currentStageIndex.value
  showJourneyEdit.value = true
}

function editStageDur(idx: number, delta: number) {
  const stage = editStages.value[idx]
  if (!stage) return
  stage.duration = Math.max(0.5, Math.min(8, stage.duration + delta))
}

function addCustomStage(idx: number, position: 'before' | 'after') {
  const insertIdx = position === 'before' ? idx : idx + 1
  const newStage: JourneyStage = {
    name: '自定义阶段',
    type: 'custom',
    duration: 1,
    startOffset: 0,
    timeLabel: '',
    customType: '自定义'
  }
  editStages.value.splice(insertIdx, 0, newStage)
  if (editCurrentIdx.value >= insertIdx) {
    editCurrentIdx.value++
  }
}

function removeCustomStage(idx: number) {
  editStages.value.splice(idx, 1)
  if (editCurrentIdx.value >= editStages.value.length) {
    editCurrentIdx.value = Math.max(0, editStages.value.length - 1)
  }
  if (editCurrentIdx.value > idx) {
    editCurrentIdx.value--
  } else if (editCurrentIdx.value === idx) {
    editCurrentIdx.value = Math.min(editCurrentIdx.value, editStages.value.length - 1)
  }
}

function openInsertPoi(idx: number) {
  insertPoiTargetIdx.value = idx
  insertPoiKeyword.value = ''
  insertPoiResults.value = []
  insertPoiDone.value = false
  showInsertPoiModal.value = true
}

function closeInsertPoiModal() {
  showInsertPoiModal.value = false
  insertPoiKeyword.value = ''
  insertPoiResults.value = []
  insertPoiDone.value = false
}

async function searchInsertPois() {
  if (!insertPoiKeyword.value.trim()) return
  insertPoiLoading.value = true
  insertPoiDone.value = false
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(insertPoiKeyword.value.trim())}&category=poi`)
    const json = await res.json()
    insertPoiResults.value = (json.data?.pois || json.pois || []).slice(0, 20)
    insertPoiDone.value = true
  } catch (error) {
    console.error(error)
    insertPoiResults.value = []
    insertPoiDone.value = true
  } finally {
    insertPoiLoading.value = false
  }
}

function confirmInsertPoi(poi: any) {
  const idx = insertPoiTargetIdx.value
  if (idx < 0) return

  const idealSpeed = transportOptions.find(o => o.value === transportMode.value)?.speed || 60
  const avgDist = 15
  const congestionMul = transportMode.value === 'driving' ? 0.7 : 1.0
  const travelHours = Math.max(0.5, Math.round((avgDist / (idealSpeed * congestionMul)) * 2) / 2)

  const travelStage: JourneyStage = {
    name: `→ 前往${poi.name}`,
    type: 'travel',
    duration: travelHours,
    startOffset: 0,
    timeLabel: '',
    poiInfo: { name: poi.name, lat: poi.lat, lng: poi.lng }
  }

  const visitStage: JourneyStage = {
    name: poi.name,
    type: 'custom',
    duration: 1,
    startOffset: 0,
    timeLabel: '',
    customType: '景点游览',
    poiInfo: { name: poi.name, lat: poi.lat, lng: poi.lng }
  }

  editStages.value.splice(idx + 1, 0, travelStage, visitStage)

  if (editCurrentIdx.value > idx) {
    editCurrentIdx.value += 2
  }

  closeInsertPoiModal()

  waypoints.value.push({ lat: poi.lat, lng: poi.lng, name: poi.name, type: 'poi' })
  syncWaypointsToItineraryItems()
  if (baseMapRef.value) {
    const marker = baseMapRef.value.addMarker([poi.lng, poi.lat], {
      color: '#6B4226',
      data: { type: 'waypoint-poi', name: poi.name }
    })
    waypointMarkers.push(marker)
  }

  if (currentEnd.value) {
    replanMultiRoute()
  }
}

function saveJourneyEdit() {
  const stages = editStages.value
  let offset = 0
  const now = new Date()

  const fmtTime = (ms: number) => {
    const d = new Date(now.getTime() + ms)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  for (let i = 0; i < stages.length; i++) {
    stages[i].startOffset = offset
    const dur = stages[i].duration
    const startMs = offset * 3600000
    const endMs = (offset + dur) * 3600000
    stages[i].timeLabel = `${fmtTime(startMs)} - ${fmtTime(endMs)}`
    offset += dur
  }

  journeyStages.value = stages.map(s => ({ ...s }))

  const newIdx = editCurrentIdx.value
  const targetOffset = journeyStages.value[newIdx]?.startOffset ?? 0
  const targetDuration = journeyStages.value[newIdx]?.duration ?? 0
  const midOffset = targetOffset + targetDuration / 2
  journeyStartTime.value = new Date(Date.now() - midOffset * 3600000)

  showJourneyEdit.value = false
  statusMessage.value = '旅程进度已更新。'
}

function openPoiPopup(poi: any, event?: MouseEvent) {
  poiPopupData.value = {
    name: poi.name || '景点',
    description: buildPoiDescription(poi),
    lat: poi.lat,
    lng: poi.lng,
    style: poi.style
  }
  if (event) {
    poiPopupPos.value = { x: event.clientX, y: event.clientY }
  } else {
    poiPopupPos.value = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  }
  showPoiPopup.value = true
}

function closePoiPopup() {
  showPoiPopup.value = false
  poiPopupData.value = null
}

// === POI 详情弹窗 ===
async function fetchPhotoGuidance(poi: any) {
  if (!poi || !poi.name) return
  loadingGuidance.value = true
  photoGuidanceText.value = ''
  photoGuidancePoses.value = []
  photoGuidancePosePool.value = []
  showPoseModal.value = false
  guidanceContext.value = { clothing: '', makeup: '' }
  
  try {
    const token = localStorage.getItem('token') || ''
    
    // 自动从预约中提取今天的“服装”和“妆造”
    const today = new Date().toISOString().split('T')[0]
    const todayBookings = myBookings.value.filter(b => b.booked_time.startsWith(today))
    
    const clothingSvc = todayBookings.find(b => b.type === 'clothing')?.service_name || ''
    const makeupSvc = todayBookings.find(b => b.type === 'makeup')?.service_name || ''
    guidanceContext.value = { clothing: clothingSvc, makeup: makeupSvc }
    
    // 获取天气描述
    const weatherDesc = weatherData.value ? 
      `${weatherData.value.current.emoji} ${weatherCodeText(weatherData.value.current.code)}` : ''

    const res = await fetch('/api/ai/photo-guidance', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ 
        spotName: poi.name, 
        spotStyle: poi.style,
        clothing: clothingSvc,
        makeup: makeupSvc,
        weather: weatherDesc
      })
    })
    const data = await res.json()
    if (data.success) {
      photoGuidanceText.value = data.data
      photoGuidancePoses.value = Array.isArray(data.pose_images) ? data.pose_images : []
      photoGuidancePosePool.value = Array.isArray(data.pose_pool) ? data.pose_pool : photoGuidancePoses.value
    } else {
      photoGuidanceText.value = '暂时无法获取拍照指导：' + (data.error || '服务器繁忙')
      photoGuidancePoses.value = []
      photoGuidancePosePool.value = []
    }
  } catch (error) {
    console.error('[拍照指导错误]:', error)
    photoGuidanceText.value = '网络请求失败，请稍后重试'
    photoGuidancePoses.value = []
    photoGuidancePosePool.value = []
  } finally {
    loadingGuidance.value = false
  }
}

async function openPoiDetail(poi: any) {
  poiDetailData.value = { ...poi, description: buildPoiDescription(poi) }
  showPoiDetail.value = true
  poiDetailPos.value = { x: window.innerWidth / 2 - 190, y: (window.innerHeight - 500) / 2 }

  if (poiDetailData.value.name) {
    try {
      const res = await fetch(`/api/searchPois?keyword=${encodeURIComponent(poiDetailData.value.name)}`)
      const data = await res.json()
      const matchedPoi = (data.data || []).find((item: any) => item.name === poiDetailData.value.name) || data.data?.[0]
      if (matchedPoi?.description) {
        poiDetailData.value = { ...matchedPoi, ...poiDetailData.value, description: buildPoiDescription(matchedPoi) }
      }
    } catch (error) {
      console.warn('补全景点介绍失败', error)
    }
  }

  // 无论是否开始旅程，自动获取拍照姿势指导
  fetchPhotoGuidance(poiDetailData.value)
}

function closePoiDetail() {
  showPoiDetail.value = false
  poiDetailData.value = {}
  photoGuidanceText.value = '' // 清除之前的指导
  photoGuidancePoses.value = []
  photoGuidancePosePool.value = []
  showPoseModal.value = false
  guidanceContext.value = { clothing: '', makeup: '' }
}

function setPoiDetailAsStart() {
  if (!poiDetailData.value.lat) return
  const { lat, lng } = poiDetailData.value
  if (userMarker) {
    if (prevStartMarker) prevStartMarker.remove()
    prevStartMarker = userMarker
    const prevEl = prevStartMarker.getElement()
    if (prevEl) {
      prevEl.style.backgroundColor = '#D4A574'
      prevEl.style.width = '20px'
      prevEl.style.height = '20px'
      prevEl.style.opacity = '0.7'
    }
  }
  userLocation.value = { lat, lng }
  if (baseMapRef.value) {
    userMarker = baseMapRef.value.addMarker([lng, lat], {
      color: '#8B4513',
      data: { type: 'user' }
    })
  }
  statusMessage.value = `起点已更改为 ${poiDetailData.value.name} (${lat.toFixed(4)}, ${lng.toFixed(4)})。`
  closePoiDetail()
}

function setPoiDetailAsEnd() {
  if (!poiDetailData.value.lat) return
  const poi = poiDetailData.value
  selectPoiAsEnd(poi)
  closePoiDetail()
}

function setPoiDetailAndRecommendFood() {
  if (!poiDetailData.value.lat) return
  recommendNearbyFoods({ ...poiDetailData.value })
}

function setPoiAsStart() {
  if (!poiPopupData.value) return
  const { lat, lng } = poiPopupData.value
  if (userMarker) {
    if (prevStartMarker) prevStartMarker.remove()
    prevStartMarker = userMarker
    const prevEl = prevStartMarker.getElement()
    if (prevEl) {
      prevEl.style.backgroundColor = '#D4A574'
      prevEl.style.width = '20px'
      prevEl.style.height = '20px'
      prevEl.style.opacity = '0.7'
    }
  }
  userLocation.value = { lat, lng }
  if (baseMapRef.value) {
    userMarker = baseMapRef.value.addMarker([lng, lat], {
      color: '#8B4513',
      data: { type: 'user' }
    })
  }
  statusMessage.value = `起点已更改为 ${poiPopupData.value.name} (${lat.toFixed(4)}, ${lng.toFixed(4)})。`
  closePoiPopup()
}

function setPoiAsEnd() {
  if (!poiPopupData.value) return
  const poi = {
    name: poiPopupData.value.name,
    lat: poiPopupData.value.lat,
    lng: poiPopupData.value.lng
  }
  currentEnd.value = poi
  waypoints.value = []
  waypointMarkers.forEach(m => m.remove())
  waypointMarkers.length = 0
  closePoiPopup()
  statusMessage.value = `正在规划到 <b>${poi.name}</b> 的路线...`
  planRoute(
    { lng: userLocation.value.lng, lat: userLocation.value.lat, name: '起点' },
    poi
  )
}

function onJourneyDragStart(e: MouseEvent) {
  isDragging = true
  const el = (e.currentTarget as HTMLElement).parentElement
  if (!el) return
  dragOffset.x = e.clientX - el.offsetLeft
  dragOffset.y = e.clientY - el.offsetTop
  document.addEventListener('mousemove', onJourneyDrag)
  document.addEventListener('mouseup', onJourneyDragEnd)
}

function onJourneyDrag(e: MouseEvent) {
  if (!isDragging) return
  journeySidebarPos.value = {
    x: e.clientX - dragOffset.x,
    y: e.clientY - dragOffset.y
  }
}

function onJourneyDragEnd() {
  isDragging = false
  document.removeEventListener('mousemove', onJourneyDrag)
  document.removeEventListener('mouseup', onJourneyDragEnd)
}

function handleMapClick({ lng, lat }: { lng: number; lat: number }) {
  if (addWaypointMode.value) {
    waypoints.value.push({ lat, lng, name: '', type: 'waypoint' })
    syncWaypointsToItineraryItems()
    addWaypointMode.value = false
    if (baseMapRef.value) {
      const marker = baseMapRef.value.addMarker([lng, lat], {
        color: '#6B4226',
        data: { type: 'waypoint' }
      })
      waypointMarkers.push(marker)
    }
    statusMessage.value = `已添加途经点${waypoints.value.length}，可继续添加或重新规划路线。`
    replanMultiRoute()
    return
  }

  if (userMarker) {
    if (prevStartMarker) prevStartMarker.remove()
    prevStartMarker = userMarker
    const prevEl = prevStartMarker.getElement()
    if (prevEl) {
      prevEl.style.backgroundColor = '#D4A574'
      prevEl.style.width = '20px'
      prevEl.style.height = '20px'
      prevEl.style.opacity = '0.7'
    }
  }
  userLocation.value = { lat, lng }
  if (baseMapRef.value) {
    userMarker = baseMapRef.value.addMarker([lng, lat], {
      color: '#8B4513',
      data: { type: 'user' }
    })
  }
  statusMessage.value = `起点已更新 (${lat.toFixed(4)}, ${lng.toFixed(4)})。`
}

async function fetchRecommendations(type: 'hotness' | 'distance') {
  hideStylePanelForOtherRecommendation()
  openRecommendationDrawerIfMap('nearby')
  lastRecommendSort.value = type
  statusMessage.value = '正在获取推荐...'
  try {
    const anchor = getRecommendationAnchor()
    const res = await fetch(`/api/recommend?lat=${anchor.lat}&lng=${anchor.lng}&sortType=${type}`)
    const data = await res.json()
    if (!res.ok || data.success === false) {
      throw new Error(data.error || '获取推荐失败')
    }
    const pois = data.data || []

    poiMarkers.forEach(m => m.remove())
    poiMarkers.length = 0
    recommendedPois.value = pois
    styleResults.value = []
    personalResults.value = []
    personalPreferences.value = []
    personalMessage.value = ''

    waypoints.value = []
    waypointMarkers.forEach(m => m.remove())
    waypointMarkers.length = 0
    hasRoute.value = false
    currentEnd.value = null

    if (prevStartMarker) {
      prevStartMarker.remove()
      prevStartMarker = null
    }

    if (baseMapRef.value) {
      baseMapRef.value.clearMarkers()
      baseMapRef.value.clearRoute()
      userMarker = baseMapRef.value.addMarker([userLocation.value.lng, userLocation.value.lat], {
        color: '#8B4513',
        data: { type: 'user' }
      })
    }

    pois.forEach((poi: any) => {
      if (!baseMapRef.value) return
      const marker = baseMapRef.value.addMarker([poi.lng, poi.lat], {
        color: '#A0522D',
        data: poi,
        onClick: (_m: any, data: any) => { handleMarkerClick(data) }
      })
      poiMarkers.push(marker)
    })

    if (pois.length > 0) {
      const coords: [number, number][] = [
        [userLocation.value.lng, userLocation.value.lat],
        ...pois.map((p: any) => [p.lng, p.lat])
      ]
      baseMapRef.value?.fitBounds(coords)
    }

    await loadDiscoverInteractions(pois.slice(0, 12).map((poi: any) => discoverUid('spot', poi)))
    statusMessage.value = `已推荐 ${pois.length} 个景点。点击景点设为终点。`
    openRecommendationDrawerIfMap('nearby')
  } catch (error) {
    console.error(error)
    const message = error instanceof Error ? error.message : '获取推荐失败，请检查后端服务。'
    if (activeMainTab.value === 'discover') discoverDataError.value = message
    statusMessage.value = message
  }
}

async function openStyleRecommend() {
  showStylePanel.value = true
  styleResults.value = []
  openRecommendationDrawerIfMap('style')
  await ensureStyleOptions()
}

async function fetchStyleRecommendations() {
  if (!selectedStyle.value) return
  styleLoading.value = true
  try {
    const res = await fetch(`/api/styleRecommend?style=${encodeURIComponent(selectedStyle.value)}&lat=${userLocation.value.lat}&lng=${userLocation.value.lng}&count=${styleCount.value}`)
    const data = await res.json()
    const results = data.data || []
    styleResults.value = results
    personalResults.value = []
    personalPreferences.value = []
    personalMessage.value = ''

    poiMarkers.forEach(m => m.remove())
    poiMarkers.length = 0
    recommendedPois.value = []

    waypoints.value = []
    waypointMarkers.forEach(m => m.remove())
    waypointMarkers.length = 0
    hasRoute.value = false
    currentEnd.value = null

    if (prevStartMarker) {
      prevStartMarker.remove()
      prevStartMarker = null
    }

    if (baseMapRef.value) {
      baseMapRef.value.clearMarkers()
      baseMapRef.value.clearRoute()
      userMarker = baseMapRef.value.addMarker([userLocation.value.lng, userLocation.value.lat], {
        color: '#8B4513',
        data: { type: 'user' }
      })
    }

    results.forEach((poi: any) => {
      if (!baseMapRef.value) return
      const marker = baseMapRef.value.addMarker([poi.lng, poi.lat], {
        color: '#A0522D',
        data: poi,
        onClick: (_m: any, data: any) => { handleMarkerClick(data) }
      })
      poiMarkers.push(marker)
    })

    if (results.length > 0) {
      const coords: [number, number][] = [
        [userLocation.value.lng, userLocation.value.lat],
        ...results.map((p: any) => [p.lng, p.lat])
      ]
      baseMapRef.value?.fitBounds(coords)
    }

    statusMessage.value = `已推荐 ${results.length} 个「${selectedStyle.value}」风格景点。`
    openRecommendationDrawerIfMap('style')
  } catch (error) {
    console.error(error)
    statusMessage.value = '风格推荐失败，请检查后端服务。'
  } finally {
    styleLoading.value = false
  }
}

async function fetchPersonalRecommend() {
  hideStylePanelForOtherRecommendation()
  openRecommendationDrawerIfMap('personal')
  if (!currentUser.value) {
    statusMessage.value = '请先登录后再使用个性化推荐'
    personalMessage.value = '请先登录后再使用个性化推荐。'
    openRecommendationDrawerIfMap('personal')
    return
  }
  styleLoading.value = true
  personalResults.value = []
  personalPreferences.value = []
  personalMessage.value = ''

  try {
    const token = localStorage.getItem('token')
    if (!token) {
      statusMessage.value = '请先登录后再使用个性化推荐'
      personalMessage.value = '请先登录后再使用个性化推荐。'
      openRecommendationDrawerIfMap('personal')
      styleLoading.value = false
      return
    }
    const res = await fetch(`/api/contentRecommend?lat=${userLocation.value.lat}&lng=${userLocation.value.lng}&count=${styleCount.value}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const data = await res.json()
    const results = data.data || []
    personalResults.value = results
    personalMessage.value = data.personalMessage || data.message || ''
    await fetchUserPreferences()

    // 清除其他推荐
    styleResults.value = []
    poiMarkers.forEach(m => m.remove())
    poiMarkers.length = 0
    recommendedPois.value = []
    waypoints.value = []
    waypointMarkers.forEach(m => m.remove())
    waypointMarkers.length = 0
    hasRoute.value = false
    currentEnd.value = null

    if (prevStartMarker) {
      prevStartMarker.remove()
      prevStartMarker = null
    }

    if (baseMapRef.value) {
      baseMapRef.value.clearMarkers()
      baseMapRef.value.clearRoute()
      userMarker = baseMapRef.value.addMarker([userLocation.value.lng, userLocation.value.lat], {
        color: '#8B4513',
        data: { type: 'user' }
      })
    }

    results.forEach((poi: any) => {
      if (!baseMapRef.value) return
      const marker = baseMapRef.value.addMarker([poi.lng, poi.lat], {
        color: '#FF6347',
        data: poi,
        onClick: (_m: any, data: any) => { handleMarkerClick(data) }
      })
      poiMarkers.push(marker)
    })

    if (results.length > 0) {
      const coords: [number, number][] = [
        [userLocation.value.lng, userLocation.value.lat],
        ...results.map((p: any) => [p.lng, p.lat])
      ]
      baseMapRef.value?.fitBounds(coords)
    }

    statusMessage.value = data.message || `已推荐 ${results.length} 个景点`
    openRecommendationDrawerIfMap('personal')
  } catch (error) {
    console.error(error)
    statusMessage.value = '个性化推荐失败，请检查后端服务。'
  } finally {
    styleLoading.value = false
  }
}

async function applyPersonalRoute() {
  if (personalResults.value.length < 2) {
    statusMessage.value = '至少需要2个景点才能规划路线。'
    return
  }

  waypoints.value = []
  syncWaypointsToItineraryItems()
  waypointMarkers.forEach(m => m.remove())
  waypointMarkers.length = 0

  const allPoints = [
    { lat: userLocation.value.lat, lng: userLocation.value.lng, name: '起点' },
    ...personalResults.value.map((p: any) => ({ lat: p.lat, lng: p.lng, name: p.name }))
  ]

  const pointsStr = allPoints.map(p => `${p.lng},${p.lat}`).join(';')
  statusMessage.value = '正在规划个性化路线...'

  try {
    const res = await fetch(`/api/multiRoute?points=${encodeURIComponent(pointsStr)}&transportMode=${transportMode.value}`)
    const data = await res.json()

    if (!data.success) {
      statusMessage.value = '路线规划失败。'
      return
    }

    hasRoute.value = true
    currentEnd.value = personalResults.value[personalResults.value.length - 1]

    if (baseMapRef.value) {
      baseMapRef.value.clearRoute()
      baseMapRef.value.drawRoute(data.path, data.distance)
    }

    statusMessage.value = `个性化路线规划完成，总距离 ${data.distance?.toFixed(1)}km`
  } catch (error) {
    console.error(error)
    statusMessage.value = '路线规划失败。'
  }
}

async function fetchSmartItinerary() {
  if (!selectedStyle.value) return
  styleLoading.value = true
  smartItinerary.value = null

  try {
    const styleRes = await fetch(`/api/styleRecommend?style=${encodeURIComponent(selectedStyle.value)}&lat=${userLocation.value.lat}&lng=${userLocation.value.lng}&count=${styleCount.value}`)
    const styleData = await styleRes.json()
    const results = styleData.data || []
    styleResults.value = results

    if (results.length === 0) {
      statusMessage.value = '未找到风格景点，无法生成行程。'
      styleLoading.value = false
      return
    }

    poiMarkers.forEach(m => m.remove())
    poiMarkers.length = 0
    recommendedPois.value = []
    waypoints.value = []
    waypointMarkers.forEach(m => m.remove())
    waypointMarkers.length = 0
    hasRoute.value = false
    currentEnd.value = null
    if (prevStartMarker) { prevStartMarker.remove(); prevStartMarker = null }

    if (baseMapRef.value) {
      baseMapRef.value.clearMarkers()
      baseMapRef.value.clearRoute()
      userMarker = baseMapRef.value.addMarker([userLocation.value.lng, userLocation.value.lat], {
        color: '#8B4513',
        data: { type: 'user' }
      })
    }

    results.forEach((poi: any) => {
      if (!baseMapRef.value) return
      const marker = baseMapRef.value.addMarker([poi.lng, poi.lat], {
        color: '#A0522D',
        data: poi,
        onClick: (_m: any, data: any) => { handleMarkerClick(data) }
      })
      poiMarkers.push(marker)
    })

    if (results.length > 0) {
      const coords: [number, number][] = [
        [userLocation.value.lng, userLocation.value.lat],
        ...results.map((p: any) => [p.lng, p.lat])
      ]
      baseMapRef.value?.fitBounds(coords)
    }

    const spots = results.map((p: any) => ({ lat: p.lat, lng: p.lng, name: p.name, style: p.style || selectedStyle.value }))
    const smartRes = await fetch('/api/smartItinerary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spots, startHour: smartStartHour.value })
    })
    const smartData = await smartRes.json()

    if (smartData.success) {
      smartItinerary.value = smartData.data
      const mealCount = smartData.data.mealRecommendations?.length || 0
      const hasPhoto = !!smartData.data.travelPhotoService

      const routePoints = [
        { lat: userLocation.value.lat, lng: userLocation.value.lng, name: '起点' },
        ...smartData.data.events.map((e: any) => ({
          lat: e.data?.lat || 0,
          lng: e.data?.lng || 0,
          name: e.name,
          type: e.type,
          duration: e.endHour - e.startHour
        }))
      ].filter((p: any) => p.lat && p.lng)

      if (routePoints.length >= 2) {
        try {
          const pointsStr = routePoints.map((p: any) => `${p.lng},${p.lat}`).join(';')
          const routeRes = await fetch(`/api/multiRoute?points=${encodeURIComponent(pointsStr)}&transportMode=${transportMode.value}`)
          const routeData = await routeRes.json()

          if (routeData.success) {
            hasRoute.value = true
            currentEnd.value = routePoints[routePoints.length - 1]
            waypoints.value = routePoints.slice(1, -1).map((p: any) => ({ lat: p.lat, lng: p.lng, name: p.name, type: p.type }))
            syncWaypointsToItineraryItems()

            if (baseMapRef.value) {
              baseMapRef.value.clearRoute()
              if (routeData.fullPath && routeData.fullPath.length > 0) {
                baseMapRef.value.drawRoute(routeData.fullPath, routeData.segmentCongestion)
              }
            }

            statusMessage.value = `🧭 多位一体行程已生成！${results.length}个景点 · ${mealCount}餐推荐${hasPhoto ? ' · 含旅拍' : ''} · 约${smartData.data.totalHours}h · 路线已规划`
          }
        } catch (routeErr) {
          console.error('路线规划失败', routeErr)
        }
      } else {
        statusMessage.value = `🧭 多位一体行程已生成！${results.length}个景点 · ${mealCount}餐推荐${hasPhoto ? ' · 含旅拍' : ''} · 约${smartData.data.totalHours}h`
      }

      if (smartData.data.warning) {
        alert(smartData.data.warning)
      }
    } else {
      statusMessage.value = `已推荐 ${results.length} 个景点，但行程生成失败。`
    }
  } catch (error) {
    console.error(error)
    statusMessage.value = '多位一体推荐失败，请检查后端服务。'
  } finally {
    styleLoading.value = false
  }
}

function removeSmartEvent(idx: number) {
  if (!smartItinerary.value) return
  const evt = smartItinerary.value.events[idx]
  if (!evt) return
  const duration = evt.endHour - evt.startHour
  smartItinerary.value.events.splice(idx, 1)
  smartItinerary.value.totalHours -= duration

  if (evt.type === 'meal') {
    const mrIdx = smartItinerary.value.mealRecommendations.findIndex((m: any) => m.mealKey === evt.data.mealKey)
    if (mrIdx >= 0) smartItinerary.value.mealRecommendations.splice(mrIdx, 1)
  }
  if (evt.type === 'photo') {
    smartItinerary.value.travelPhotoService = null
  }

  replanSmartRoute()
}

async function replanSmartRoute() {
  if (!smartItinerary.value || smartItinerary.value.events.length === 0) {
    hasRoute.value = false
    waypoints.value = []
    currentEnd.value = null
    if (baseMapRef.value) baseMapRef.value.clearRoute()
    return
  }
  const routePoints = [
    { lat: userLocation.value.lat, lng: userLocation.value.lng, name: '起点' },
    ...smartItinerary.value.events.map((e: any) => ({
      lat: e.data?.lat || 0,
      lng: e.data?.lng || 0,
      name: e.name,
      type: e.type
    }))
  ].filter((p: any) => p.lat && p.lng)

  if (routePoints.length < 2) return
  try {
    const pointsStr = routePoints.map((p: any) => `${p.lng},${p.lat}`).join(';')
    const routeRes = await fetch(`/api/multiRoute?points=${encodeURIComponent(pointsStr)}&transportMode=${transportMode.value}`)
    const routeData = await routeRes.json()

    if (routeData.success && baseMapRef.value) {
      hasRoute.value = true
      currentEnd.value = routePoints[routePoints.length - 1]
      waypoints.value = routePoints.slice(1, -1).map((p: any) => ({ lat: p.lat, lng: p.lng, name: p.name, type: p.type }))
      baseMapRef.value.clearRoute()
      if (routeData.fullPath && routeData.fullPath.length > 0) {
        baseMapRef.value.drawRoute(routeData.fullPath, routeData.segmentCongestion)
      }
    }
  } catch (err) {
    console.error('重新规划路线失败', err)
  }
}

function eventLabel(evt: any): string {
  const prefix: Record<string, string> = { spot: '📍', meal: '🍽️', photo: '📸' }
  return `${prefix[evt.type] || ''} ${evt.name}`
}

async function rerunSmartItinerary() {
  if (!smartItinerary.value) return
  const spots = smartItinerary.value.events
    .filter((e: any) => e.type === 'spot')
    .map((e: any) => e.data)
  if (spots.length === 0) return
  statusMessage.value = '正在重新搜索旅拍服务...'
  try {
    const res = await fetch('/api/smartItinerary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spots, startHour: smartItinerary.value.startHour })
    })
    const data = await res.json()
    if (data.success) {
      smartItinerary.value = data.data
      replanSmartRoute()
      statusMessage.value = '🔄 行程已更新，路线已重新规划。'
    }
  } catch (error) {
    console.error(error)
    statusMessage.value = '重新搜索旅拍失败。'
  }
}

function applyStyleRoute(poi: any, _idx: number) {
  currentEnd.value = poi
  waypoints.value = []
  syncWaypointsToItineraryItems()
  waypointMarkers.forEach(m => m.remove())
  waypointMarkers.length = 0
  statusMessage.value = `正在规划到 <b>${poi.name}</b> 的路线...`
  planRoute(
    { lng: userLocation.value.lng, lat: userLocation.value.lat, name: '起点' },
    poi
  )
}

async function applyFullStyleRoute() {
  if (styleResults.value.length < 2) {
    statusMessage.value = '至少需要2个景点才能规划路线。'
    return
  }

  waypoints.value = []
  waypointMarkers.forEach(m => m.remove())
  waypointMarkers.length = 0

  const allPoints = [
    { lat: userLocation.value.lat, lng: userLocation.value.lng, name: '起点' },
    ...styleResults.value.map((p: any) => ({ lat: p.lat, lng: p.lng, name: p.name }))
  ]

  const pointsStr = allPoints.map(p => `${p.lng},${p.lat}`).join(';')

  statusMessage.value = '正在规划风格路线...'

  try {
    const res = await fetch(`/api/multiRoute?points=${encodeURIComponent(pointsStr)}&transportMode=${transportMode.value}`)
    const data = await res.json()

    if (!data.success) {
      statusMessage.value = '路线规划失败。'
      return
    }

    hasRoute.value = true
    currentEnd.value = styleResults.value[styleResults.value.length - 1]
    if (styleResults.value.length > 2) {
      waypoints.value = styleResults.value.slice(0, -1).map((p: any) => ({ lat: p.lat, lng: p.lng, name: p.name }))
    } else {
      waypoints.value = []
    }
    syncWaypointsToItineraryItems()

    if (baseMapRef.value) {
      baseMapRef.value.clearRoute()
      if (data.fullPath && data.fullPath.length > 0) {
        baseMapRef.value.drawRoute(data.fullPath, data.segmentCongestion)
      }
    }

    const order: number[] = data.order || []
    const orderedNames = order.map((i: number) => allPoints[i]?.name || '').filter((n: string) => n && n !== '起点')

    statusMessage.value = `🎨 风格路线已规划！游览顺序：${orderedNames.join(' → ')}`
  } catch (error) {
    console.error(error)
    statusMessage.value = '路线规划失败，请检查后端服务。'
  }
}

function selectPoiAsEnd(poi: any) {
  currentEnd.value = poi
  waypoints.value = []
  syncWaypointsToItineraryItems()
  waypointMarkers.forEach(m => m.remove())
  waypointMarkers.length = 0
  statusMessage.value = `正在规划到 <b>${poi.name}</b> 的路线...`
  planRoute(
    { lng: userLocation.value.lng, lat: userLocation.value.lat, name: '起点' },
    poi
  )
}

async function fetchTravelServices() {
  hideStylePanelForOtherRecommendation()
  openRecommendationDrawerIfMap('service')
  statusMessage.value = '正在搜索附近旅拍服务...'
  try {
    const token = localStorage.getItem('token')
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`

    const anchor = getRecommendationAnchor()
    const res = await fetch(`/api/services?lat=${anchor.lat}&lng=${anchor.lng}`, { headers })
    const data = await res.json()
    if (!res.ok || data.success === false) {
      throw new Error(data.error || '获取旅拍服务失败')
    }
    const services = data.data || []

    serviceMarkers.forEach(m => m.remove())
    serviceMarkers.length = 0
    travelServices.value = services

    if (baseMapRef.value) {
      services.forEach((service: any) => {
        if (!baseMapRef.value) return
        const marker = baseMapRef.value.addMarker([service.lng, service.lat], {
          color: '#FFF8DC',
          data: service,
          style: 'service'
        })
        serviceMarkers.push(marker)
      })

      if (services.length > 0) {
        const coords: [number, number][] = [
          [userLocation.value.lng, userLocation.value.lat],
          ...services.map((s: any) => [s.lng, s.lat])
        ]
        baseMapRef.value.fitBounds(coords)
      }
    }

    await loadDiscoverInteractions(services.map((service: any) => discoverUid('service', service)))
    statusMessage.value = `找到 ${services.length} 个旅拍服务。`
    openRecommendationDrawerIfMap('service')
  } catch (error) {
    console.error(error)
    const message = error instanceof Error ? error.message : '获取旅拍服务失败，请检查后端服务。'
    if (activeMainTab.value === 'discover') discoverDataError.value = message
    statusMessage.value = message
  }
}

function getServiceIcon(type: string): string {
  const icons: Record<string, string> = {
    photographer: '📷',
    makeup: '💄',
    drone: '🚁',
    clothing: '👗'
  }
  return icons[type] || '📍'
}

function getServiceTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    makeup: '💄 妆娘',
    photographer: '📸 摄影师',
    drone: '🚁 无人机',
    clothing: '👘 服装租赁'
  }
  return labels[type] || type
}

async function fetchFoodRecommendations() {
  hideStylePanelForOtherRecommendation()
  foodRecommendationMode.value = 'general'
  foodRecommendationAnchorName.value = ''
  nearbyFoodAnchor.value = null
  nearbyFoodAllResults.value = []
  openRecommendationDrawerIfMap('food')
  statusMessage.value = '正在获取美食推荐...'
  try {
    const sort = foodSortType.value
    const cuisine = foodCuisineFilter.value
    const anchor = getRecommendationAnchor()
    let url = `/api/foods?lat=${anchor.lat}&lng=${anchor.lng}&sortType=${sort}`
    if (cuisine && cuisine !== '全部') {
      url += `&cuisine=${encodeURIComponent(cuisine)}`
    }
    const res = await fetch(url)
    const data = await res.json()
    if (!res.ok || data.success === false) {
      throw new Error(data.error || '获取美食推荐失败')
    }
    const foods = data.data || []

    foodMarkers.forEach(m => m.remove())
    foodMarkers.length = 0
    foodRecommendations.value = foods
    nearbyFoods.value = []

    if (baseMapRef.value) {
      foods.forEach((food: any) => {
        if (!baseMapRef.value) return
        const marker = baseMapRef.value.addMarker([food.lng, food.lat], {
          color: '#E85D3A',
          data: { type: 'food', ...food }
        })
        foodMarkers.push(marker)
      })

      if (foods.length > 0) {
        const coords: [number, number][] = [
          [userLocation.value.lng, userLocation.value.lat],
          ...foods.map((f: any) => [f.lng, f.lat])
        ]
        baseMapRef.value.fitBounds(coords)
      }
    }

    // 加载菜系列表（仅首次）
    if (cuisineList.value.length === 0) {
      try {
        const cRes = await fetch('/api/cuisines')
        const cData = await cRes.json()
        if (cData.success) cuisineList.value = cData.data || []
      } catch {}
    }

    await loadDiscoverInteractions(foods.map((food: any) => discoverUid('food', food)))
    const sortLabel = foodSortOptions.find(s => s.value === sort)?.label || '综合'
    statusMessage.value = `🍽️ 已推荐 ${foods.length} 家美食，按${sortLabel}排序${cuisine !== '全部' ? '，菜系：' + cuisine : ''}。`
    openRecommendationDrawerIfMap('food')
  } catch (error) {
    console.error(error)
    const message = error instanceof Error ? error.message : '获取美食推荐失败，请检查后端服务。'
    if (activeMainTab.value === 'discover') discoverDataError.value = message
    statusMessage.value = message
  }
}

function sortFoodRecommendationsForDrawer(foods: any[]) {
  const cuisine = foodCuisineFilter.value
  const filtered = (cuisine && cuisine !== '全部')
    ? foods.filter((food: any) => food.cuisine === cuisine)
    : [...foods]

  const numeric = (value: unknown, fallback = 0) => {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }

  if (foodSortType.value === 'distance') {
    return filtered.sort((a: any, b: any) => numeric(a.distance, 999) - numeric(b.distance, 999))
  }
  if (foodSortType.value === 'hotness') {
    return filtered.sort((a: any, b: any) => numeric(b.hotness) - numeric(a.hotness))
  }
  if (foodSortType.value === 'rating') {
    return filtered.sort((a: any, b: any) => numeric(b.rating) - numeric(a.rating))
  }
  return filtered.sort((a: any, b: any) => {
    const scoreA = numeric(a.distance, 999) * 0.8 - numeric(a.rating) * 0.1 - numeric(a.hotness) / 1000
    const scoreB = numeric(b.distance, 999) * 0.8 - numeric(b.rating) * 0.1 - numeric(b.hotness) / 1000
    return scoreA - scoreB
  })
}

function renderFoodRecommendationMarkers(foods: any[], anchor?: any) {
  foodMarkers.forEach(m => m.remove())
  foodMarkers.length = 0

  if (!baseMapRef.value) return

  foods.forEach((food: any) => {
    if (!baseMapRef.value || !food?.lat || !food?.lng) return
    const marker = baseMapRef.value.addMarker([food.lng, food.lat], {
      color: '#E85D3A',
      data: { type: 'food', ...food }
    })
    foodMarkers.push(marker)
  })

  if (foods.length > 0) {
    const anchorCoord: [number, number] = anchor?.lat && anchor?.lng
      ? [anchor.lng, anchor.lat]
      : [userLocation.value.lng, userLocation.value.lat]
    const coords: [number, number][] = [
      anchorCoord,
      ...foods.map((f: any) => [f.lng, f.lat] as [number, number])
    ]
    baseMapRef.value.fitBounds(coords)
  }
}

async function ensureCuisineListLoaded() {
  if (cuisineList.value.length > 0) return
  try {
    const cRes = await fetch('/api/cuisines')
    const cData = await cRes.json()
    if (cData.success) cuisineList.value = cData.data || []
  } catch {}
}

async function applyNearbyFoodRecommendations() {
  const foods = sortFoodRecommendationsForDrawer(nearbyFoodAllResults.value)
  foodRecommendations.value = foods
  nearbyFoods.value = []
  renderFoodRecommendationMarkers(foods, nearbyFoodAnchor.value)
  await loadDiscoverInteractions(foods.map((food: any) => discoverUid('food', food)))
}

function changeFoodSort(sort: string) {
  foodSortType.value = sort
  if (foodRecommendationMode.value === 'nearby') {
    applyNearbyFoodRecommendations()
    return
  }
  fetchFoodRecommendations()
}

function changeFoodCuisine() {
  if (foodRecommendationMode.value === 'nearby') {
    applyNearbyFoodRecommendations()
    return
  }
  fetchFoodRecommendations()
}

function flyToFood(food: any) {
  const map = baseMapRef.value?.getMap?.()
  if (map) {
    map.flyTo({ center: [food.lng, food.lat], zoom: 16, duration: 1200 })
  }
  // 移除上一个高亮标记
  if (foodHighlightMarker) {
    foodHighlightMarker.remove()
    foodHighlightMarker = null
  }
  // 添加醒目的高亮标记
  if (baseMapRef.value) {
    const marker = baseMapRef.value.addMarker([food.lng, food.lat], {
      color: '#E85D3A',
      data: { type: 'food', ...food }
    })
    if (marker) {
      const el = marker.getElement()
      el.style.width = '36px'
      el.style.height = '36px'
      el.style.backgroundColor = '#E85D3A'
      el.style.border = '3px solid white'
      el.style.boxShadow = '0 0 0 4px rgba(232, 93, 58, 0.35), 0 4px 12px rgba(232, 93, 58, 0.5)'
      el.style.animation = 'foodPulse 1.5s ease-in-out infinite'
      el.innerHTML = '<span style="font-size:16px;display:flex;align-items:center;justify-content:center;width:100%;height:100%;">🍽️</span>'
      foodHighlightMarker = marker
    }
  }
  statusMessage.value = `🍽️ <b>${food.name}</b> (${food.cuisine}) ⭐${food.rating}<br/>📍 ${food.address || '暂无地址'} · ${food.distance}km`
}

function setFoodAsEnd(food: any) {
  currentEnd.value = { ...food, name: `🍽️ ${food.name}` }
  waypoints.value = []
  waypointMarkers.forEach(m => m.remove())
  waypointMarkers.length = 0
  statusMessage.value = `正在规划到 <b>${food.name}</b> 的路线...`
  planRoute(
    { lng: userLocation.value.lng, lat: userLocation.value.lat, name: '起点' },
    { ...food, name: food.name }
  )
}

function setServiceAsEnd(service: any) {
  currentEnd.value = { ...service, name: `📸 ${service.name}` }
  waypoints.value = []
  waypointMarkers.forEach(m => m.remove())
  waypointMarkers.length = 0
  statusMessage.value = `正在规划到 <b>${service.name}</b> 的路线...`
  planRoute(
    { lng: userLocation.value.lng, lat: userLocation.value.lat, name: '起点' },
    { lat: service.lat, lng: service.lng, name: service.name }
  )
}

async function recommendNearbyFoods(anchorData?: any) {
  const popup = anchorData || poiPopupData.value
  if (!popup?.lat || !popup?.lng) return
  const { lat, lng, style } = popup
  closePoiPopup()
  closePoiDetail()

  foodRecommendationMode.value = 'nearby'
  foodRecommendationAnchorName.value = popup.name || '当前景点'
  nearbyFoodAnchor.value = { ...popup }
  nearbyFoodAllResults.value = []
  foodRecommendations.value = []
  nearbyFoods.value = []
  foodSortType.value = 'distance'
  foodCuisineFilter.value = '全部'
  openRecommendationDrawer('food')
  statusMessage.value = '正在搜索附近美食...'

  try {
    const styleParam = style ? `&style=${encodeURIComponent(style)}` : ''
    const res = await fetch(`/api/foods/nearby?lat=${lat}&lng=${lng}&radius=3${styleParam}`)
    const data = await res.json()
    if (!res.ok || data.success === false) {
      throw new Error(data.error || '查询附近美食失败')
    }
    const foods = data.data || []

    nearbyFoodAllResults.value = foods
    await ensureCuisineListLoaded()
    await applyNearbyFoodRecommendations()

    statusMessage.value = `📍 在 <b>${popup.name}</b> 附近找到 ${foodRecommendations.value.length} 家美食。`
  } catch (error) {
    console.error(error)
    nearbyFoodAllResults.value = []
    foodRecommendations.value = []
    const message = error instanceof Error ? error.message : '查询附近美食失败。'
    statusMessage.value = message
  }
}

const foodMarkers: any[] = []
let foodHighlightMarker: any = null

async function planRoute(start: any, end: any) {
  try {
    const mode = transportMode.value
    statusMessage.value = '正在规划路线...'

    // 第一阶段：先请求路径（不含拥挤度），立即画蓝线
    const pathRes = await fetch(`/api/fastRoute?startLng=${start.lng}&startLat=${start.lat}&endLng=${end.lng}&endLat=${end.lat}`)
    const pathData = await pathRes.json()

    if (!pathData.success || !pathData.path || pathData.path.length < 1) {
      statusMessage.value = '未找到可达路线。'
      return
    }

    const coordinates: [number, number][] = pathData.path.map((point: number[]) => [point[0], point[1]])

    // 立即画蓝线
    if (baseMapRef.value) {
      baseMapRef.value.drawRoute(coordinates) // 无拥挤度参数 = 蓝色单线
      const allCoords: [number, number][] = [
        [start.lng, start.lat],
        ...coordinates,
        [end.lng, end.lat]
      ]
      baseMapRef.value.fitBounds(allCoords)
    }
    hasRoute.value = true
    statusMessage.value = '路线已规划，正在计算拥挤度...'

    // 第二阶段：异步计算拥挤度和时间，完成后重新渲染分段颜色
    try {
      const fullRes = await fetch(`/api/route?startLng=${start.lng}&startLat=${start.lat}&endLng=${end.lng}&endLat=${end.lat}&transportMode=${mode}`)
      const routeData = await fullRes.json()

      // 用带拥挤度的数据重绘
      if (routeData.segmentCongestion && baseMapRef.value) {
        baseMapRef.value.drawRoute(coordinates, routeData.segmentCongestion)
      }

      // 更新时间信息
      if (routeData.travelTimes) {
        travelTimes.value = routeData.travelTimes
      }
      const modeLabel = transportOptions.find(o => o.value === mode)?.label || mode
      let timeStr = ''
      if (routeData.timeEstimate) {
        const mins = routeData.timeEstimate.durationMinutes
        if (mins < 60) {
          timeStr = `，预计 ${Math.round(mins)} 分钟`
        } else {
          const h = Math.floor(mins / 60)
          const m = Math.round(mins % 60)
          timeStr = `，预计 ${h}小时${m > 0 ? m + '分钟' : ''}`
        }
      }
      statusMessage.value = `${modeLabel}路线规划完成！距离 ${routeData.distance?.toFixed(2) || '?'} km${timeStr}。`
    } catch (e) {
      // 拥挤度计算失败不影响已画的蓝线
      console.warn('拥挤度计算失败，使用默认蓝色路线', e)
      statusMessage.value = '路线已规划（拥挤度数据暂不可用）。'
    }
  } catch (error) {
    console.error(error)
    statusMessage.value = '路线规划失败，请检查 C 引擎服务。'
  }
}

function openBookModal(service: any) {
  if (!currentUser.value) {
    router.push('/login')
    return
  }
  selectedService.value = service
  selectedDate.value = ''
  selectedSlot.value = ''
  daySlots.value = []
  bookErrorMsg.value = ''
  showBookModal.value = true
}

function closeBookModal() {
  showBookModal.value = false
  selectedService.value = null
  selectedDate.value = ''
  selectedSlot.value = ''
  daySlots.value = []
  bookErrorMsg.value = ''
}

async function selectDate(date: string) {
  selectedDate.value = date
  selectedSlot.value = ''
  bookErrorMsg.value = ''
  slotsLoading.value = true

  try {
    const res = await fetch(`/api/services/${selectedService.value.id}/slots?date=${date}`)
    const data = await res.json()
    if (data.success) {
      daySlots.value = data.data.slots || []
    } else {
      daySlots.value = []
    }
  } catch (error) {
    console.error('获取时间段失败', error)
    daySlots.value = []
  } finally {
    slotsLoading.value = false
  }
}

async function submitBooking() {
  if (!selectedDate.value || !selectedSlot.value) {
    bookErrorMsg.value = '请选择日期和时间段'
    return
  }

  const token = localStorage.getItem('token')
  if (!token) { router.push('/login'); return }

  bookingSubmit.value = true
  bookErrorMsg.value = ''

  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        service_id: selectedService.value.id,
        date: selectedDate.value,
        slot_id: selectedSlot.value
      })
    })

    const data = await res.json()

    if (!data.success) {
      if (data.code === 'SLOT_BOOKED' || data.code === 'TYPE_CONFLICT') {
        closeBookModal()
        conflictMsg.value = data.error
        showConflictModal.value = true
      } else {
        bookErrorMsg.value = data.error || '预约失败'
      }
      return
    }

    closeBookModal()
    await Promise.all([fetchTravelServices(), fetchMyBookings()])
    const slotLabel = data.booking?.slot_label || ''
    statusMessage.value = `预约成功！${selectedService.value?.name} - ${selectedDate.value} ${slotLabel}`
  } catch (error) {
    console.error(error)
    bookErrorMsg.value = '网络错误，请稍后重试'
  } finally {
    bookingSubmit.value = false
  }
}

function openPoiSearchModal() {
  poiSearchKeyword.value = ''
  poiSearchResults.value = []
  poiSearchDone.value = false
  showPoiSearchModal.value = true
}

function closePoiSearchModal() {
  showPoiSearchModal.value = false
  poiSearchKeyword.value = ''
  poiSearchResults.value = []
  poiSearchDone.value = false
}

async function searchPois() {
  if (!poiSearchKeyword.value.trim()) return
  poiSearchLoading.value = true
  poiSearchDone.value = false
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(poiSearchKeyword.value.trim())}&category=poi`)
    const json = await res.json()
    poiSearchResults.value = (json.data?.pois || json.pois || []).slice(0, 20)
    poiSearchDone.value = true
  } catch (error) {
    console.error(error)
    poiSearchResults.value = []
    poiSearchDone.value = true
  } finally {
    poiSearchLoading.value = false
  }
}

function selectPoiAsWaypoint(poi: any) {
  waypoints.value.push({ lat: poi.lat, lng: poi.lng, name: poi.name, type: 'poi' })
  if (baseMapRef.value) {
    const marker = baseMapRef.value.addMarker([poi.lng, poi.lat], {
      color: '#6B4226',
      data: { type: 'waypoint-poi', name: poi.name }
    })
    waypointMarkers.push(marker)
  }
  closePoiSearchModal()
  statusMessage.value = `已添加途经景点"${poi.name}"，可继续添加或重新规划路线。`
  replanMultiRoute()
}

function removeWaypoint(idx: number) {
  waypoints.value.splice(idx, 1)
  syncWaypointsToItineraryItems()
  if (waypointMarkers[idx]) {
    waypointMarkers[idx].remove()
    waypointMarkers.splice(idx, 1)
  }
  if (waypoints.value.length > 0) {
    replanMultiRoute()
  } else {
    if (currentEnd.value) {
      planRoute(
        { lng: userLocation.value.lng, lat: userLocation.value.lat, name: '起点' },
        currentEnd.value
      )
    }
  }
}

async function replanMultiRoute() {
  if (!currentEnd.value) return

  const allPoints = [
    { lat: userLocation.value.lat, lng: userLocation.value.lng },
    ...waypoints.value.map(wp => ({ lat: wp.lat, lng: wp.lng })),
    { lat: currentEnd.value.lat, lng: currentEnd.value.lng }
  ]

  if (allPoints.length < 2) return

  if (allPoints.length === 2) {
    planRoute(
      { lng: allPoints[0].lng, lat: allPoints[0].lat, name: '起点' },
      { lng: allPoints[1].lng, lat: allPoints[1].lat, name: currentEnd.value.name }
    )
    return
  }

  statusMessage.value = '正在规划多点路线（最近邻+2-opt优化）...'
  try {
    const pointsParam = allPoints.map(p => `${p.lng},${p.lat}`).join(';')
    const res = await fetch(`/api/multiRoute?points=${encodeURIComponent(pointsParam)}&transportMode=${transportMode.value}`)
    const data = await res.json()

    if (data.success && data.fullPath && baseMapRef.value) {
      baseMapRef.value.clearRoute()

      const allCoords: [number, number][] = data.fullPath.map((pt: number[]) => [pt[0], pt[1]] as [number, number])

      baseMapRef.value.drawRoute(allCoords, data.segmentCongestion || data.travelTimes?.congestionFactor)
      baseMapRef.value.fitBounds(allCoords)

      hasRoute.value = true
      // 保存三种交通方式时间
      if (data.travelTimes) {
        travelTimes.value = data.travelTimes
      }
      const modeLabel = transportOptions.find(o => o.value === transportMode.value)?.label || transportMode.value
      let timeStr = ''
      if (data.timeEstimate) {
        const mins = data.timeEstimate.durationMinutes
        if (mins < 60) {
          timeStr = `，预计 ${Math.round(mins)} 分钟`
        } else {
          const h = Math.floor(mins / 60)
          const m = Math.round(mins % 60)
          timeStr = `，预计 ${h}小时${m > 0 ? m + '分钟' : ''}`
        }
      }
      statusMessage.value = `${modeLabel}路线规划完成！总距离 ${data.distance?.toFixed(2) || '?'} km${timeStr}，${waypoints.value.length} 个途经点。`
    } else {
      statusMessage.value = '多点路线规划失败。'
    }
  } catch (error) {
    console.error(error)
    statusMessage.value = '多点路线规划失败，请检查 C 引擎服务。'
  }
}

async function fetchMyBookings() {
  const token = localStorage.getItem('token')
  if (!token) return

  try {
    const res = await fetch('/api/bookings/my', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const data = await res.json()
    if (data.success) myBookings.value = data.data || []
  } catch (error) {
    console.error('获取预约列表失败', error)
  }
}

async function cancelBooking(id: number) {
  if (!confirm('确定要取消这个预约吗？')) return

  const token = localStorage.getItem('token')
  if (!token) return

  try {
    const res = await fetch(`/api/bookings/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const data = await res.json()
    if (data.success) {
      myBookings.value = myBookings.value.filter(b => b.id !== id)
      await fetchTravelServices()
    }
  } catch (error) {
    console.error('取消预约失败', error)
  }
}

function getSlotLabel(bookedTime: string): string {
  const d = new Date(bookedTime)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const slotMap: Record<string, string> = {
    '09:00': '09:00-11:00',
    '11:00': '11:00-13:00',
    '14:00': '14:00-16:00',
    '16:00': '16:00-18:00'
  }
  return slotMap[`${hh}:${mm}`] || `${hh}:${mm}`
}

function formatBookingDisplay(booking: any): string {
  const d = new Date(booking.booked_time)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const slotLabel = getSlotLabel(booking.booked_time)
  return `${mm}-${dd} ${slotLabel}`
}

function getCountdown(timeStr: string): string {
  const target = new Date(timeStr).getTime()
  const now = Date.now()
  const diff = target - now

  if (diff <= 0) return ''

  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    return `${days}天后`
  }
  return `${hours}时${minutes}分后`
}

function goToDiary() {
  router.push('/diary')
}

function openAIDiaryFromJourney() {
  let trajectory = ""
  if (journeyStages.value.length > 0) {
    const visitStages = journeyStages.value.filter(s => s.type === 'visit' || s.type === 'custom')
    const currentIdx = currentStageIndex.value
    const visitedNames = journeyStages.value.slice(0, currentIdx + 1)
      .filter(s => s.type === 'visit' || s.type === 'custom')
      .map(s => s.name)
    const futureNames = visitStages.filter(s => journeyStages.value.indexOf(s) > currentIdx).map(s => s.name)
    trajectory = `今日旅程规划：从起点出发，`
    if (visitedNames.length > 0) {
      trajectory += `已游览了${visitedNames.join('、')}，`
    }
    if (futureNames.length > 0) {
      trajectory += `计划前往${futureNames.join('、')}。`
    } else {
      trajectory += `所有景点已游览完毕。`
    }
    const totalDur = journeyStages.value.reduce((acc, s) => acc + s.duration, 0)
    trajectory += `全程预计${totalDur}小时。`
  } else {
    trajectory = `从坐标 (${userLocation.value.lat.toFixed(4)}, ${userLocation.value.lng.toFixed(4)}) 开始了今天的城市探索。`
  }
  sessionStorage.setItem('ai_diary_trajectory', trajectory)
  router.push('/diary')
}

async function handleLogout() {
  const token = localStorage.getItem('token')
  if (token) {
    await fetch('/api/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    })
  }
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  router.push('/login')
}
</script>

<style scoped>
.navigation-container {
  width: 100%;
  height: 100vh;
  position: relative;
}

.start-journey-btn {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 200;
  padding: 12px 36px;
  background: linear-gradient(135deg, #8B4513, #A0522D);
  color: #FFF8DC;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 3px;
  border: 2px solid #D4A574;
  border-radius: 8px;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(139, 69, 19, 0.4);
  transition: all 0.3s;
}
.start-journey-btn:hover {
  background: linear-gradient(135deg, #A0522D, #8B4513);
  box-shadow: 0 6px 24px rgba(139, 69, 19, 0.6);
  transform: translateX(-50%) translateY(-2px);
}

.sidebar {
  position: absolute;
  top: 20px; left: 20px;
  width: 420px;
  background: rgba(255, 248, 220, 0.94);
  padding: 18px;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(139, 69, 19, 0.15);
  z-index: 100;
  backdrop-filter: blur(12px);
  border: 1px solid #D4A574;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  color: #5D3A1A;
}
.sidebar::-webkit-scrollbar { width: 4px; }
.sidebar::-webkit-scrollbar-thumb { background: rgba(139, 69, 19, 0.25); border-radius: 2px; }

.sidebar h2 {
  margin: 0 0 14px 0;
  font-size: 17px;
  color: #5D3A1A;
  letter-spacing: 2px;
  font-weight: 700;
}

.user-bar {
  display: flex; justify-content: space-between; align-items: center;
  padding-bottom: 12px; margin-bottom: 12px;
  border-bottom: 1px solid #D4A574;
}
.user-name { font-size: 14px; color: #8B4513; font-weight: 500; }
.logout-btn {
  padding: 4px 14px; background: rgba(139, 69, 19, 0.08);
  border: 1px solid rgba(139, 69, 19, 0.3); border-radius: 6px;
  color: #8B4513; font-size: 12px; cursor: pointer; transition: all 0.3s ease;
}
.logout-btn:hover { background: rgba(139, 69, 19, 0.18); }

.transport-mode-selector {
  margin-bottom: 12px; padding: 8px 10px;
  background: rgba(139, 69, 19, 0.05); border-radius: 8px;
  border: 1px solid rgba(139, 69, 19, 0.12);
}
.transport-label {
  font-size: 11px; font-weight: 600; color: #8B4513;
  margin-bottom: 6px; display: block;
}
.transport-options { display: flex; gap: 6px; }
.transport-btn {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 6px 4px; border: 2px solid rgba(139, 69, 19, 0.15); border-radius: 8px;
  background: rgba(255,255,255,0.7); cursor: pointer; transition: all 0.2s;
  font-size: 11px; color: #5D3A1A;
}
.transport-btn:hover { background: rgba(139, 69, 19, 0.08); }
.transport-btn.active {
  border-color: #8B4513; background: rgba(139, 69, 19, 0.12);
  box-shadow: 0 0 0 1px rgba(139, 69, 19, 0.2);
}
.transport-icon { font-size: 18px; }
.transport-name { font-weight: 600; font-size: 12px; }
.transport-speed { font-size: 10px; color: rgba(93, 58, 26, 0.5); }

.travel-times-panel {
  margin-top: 8px; padding: 6px 0 0;
  border-top: 1px solid rgba(139, 69, 19, 0.1);
}
.time-row {
  display: flex; align-items: center; gap: 6px;
  padding: 3px 6px; border-radius: 4px; cursor: pointer;
  transition: background 0.15s; font-size: 12px; color: #5D3A1A;
}
.time-row:hover { background: rgba(139, 69, 19, 0.06); }
.time-row.active { background: rgba(139, 69, 19, 0.12); font-weight: 600; }
.time-icon { font-size: 14px; width: 18px; text-align: center; }
.time-label { width: 28px; }
.time-value { margin-left: auto; font-family: monospace; font-size: 12px; color: #8B4513; }

.location-info {
  display: flex; align-items: center; gap: 8px; margin-bottom: 14px;
  padding: 8px 12px; background: rgba(139, 69, 19, 0.06); border-radius: 6px;
  border: 1px solid rgba(139, 69, 19, 0.15);
}
.location-info .label {
  font-size: 11px; font-weight: 600; color: #8B4513;
  background: rgba(139, 69, 19, 0.12); padding: 2px 6px; border-radius: 4px;
}
.location-info .coords { font-size: 12px; color: rgba(93, 58, 26, 0.6); font-family: monospace; }

.btn-group { display: flex; gap: 8px; margin-bottom: 14px; }
.btn-group button {
  flex: 1; padding: 9px 6px; border: none; border-radius: 6px;
  background: linear-gradient(135deg, #8B4513, #A0522D); color: #FFF8DC;
  font-size: 12px; cursor: pointer; transition: all 0.2s;
}
.btn-group button:hover { transform: translateY(-1px); box-shadow: 0 3px 12px rgba(139, 69, 19, 0.35); }
.btn-group button.active {
  box-shadow: 0 0 0 2px rgba(255, 248, 220, 0.9), 0 5px 16px rgba(139, 69, 19, 0.35);
  transform: translateY(-1px);
}
.service-btn { background: linear-gradient(135deg, #6B4226, #8B4513) !important; }
.style-btn { background: linear-gradient(135deg, #B8860B, #DAA520) !important; }
.personal-btn { background: linear-gradient(135deg, #E8590C, #FF8C42) !important; }
.food-btn { background: linear-gradient(135deg, #E85D3A, #FF6B4A) !important; }

.recommend-drawer {
  position: absolute;
  top: 12px;
  left: 456px;
  width: 376px;
  max-height: calc(100dvh - 24px);
  z-index: 99;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(212, 165, 116, 0.72);
  border-radius: 12px;
  background: rgba(255, 253, 246, 0.96);
  color: #5d3a1a;
  box-shadow: 0 14px 42px rgba(74, 47, 27, 0.2);
  backdrop-filter: blur(14px);
}

.recommend-drawer-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 16px 12px;
  border-bottom: 1px solid rgba(139, 69, 19, 0.12);
}

.recommend-drawer-kicker {
  display: inline-flex;
  margin-bottom: 5px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(139, 69, 19, 0.08);
  color: #8b4513;
  font-size: 11px;
  font-weight: 800;
}

.recommend-drawer-head h3 {
  margin: 0;
  font-size: 18px;
  color: #5d3a1a;
}

.recommend-drawer-head p {
  margin: 4px 0 0;
  color: rgba(93, 58, 26, 0.62);
  font-size: 12px;
  line-height: 1.45;
}

.recommend-drawer-close {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: rgba(139, 69, 19, 0.08);
  color: #8b4513;
  cursor: pointer;
}

.recommend-drawer-close:hover {
  background: rgba(139, 69, 19, 0.16);
}

.recommend-drawer-body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 12px 12px 18px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.recommend-empty {
  padding: 18px;
  border: 1px dashed rgba(139, 69, 19, 0.22);
  border-radius: 10px;
  background: rgba(139, 69, 19, 0.04);
  color: rgba(93, 58, 26, 0.62);
  font-size: 13px;
  line-height: 1.6;
}

.recommend-poi-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  margin-bottom: 8px;
  border: 1px solid rgba(139, 69, 19, 0.12);
  border-radius: 9px;
  background: rgba(139, 69, 19, 0.04);
  cursor: pointer;
  transition: all 0.2s ease;
}

.recommend-poi-card:hover {
  border-color: rgba(139, 69, 19, 0.28);
  background: rgba(139, 69, 19, 0.08);
  transform: translateX(2px);
}

.recommend-poi-card > div {
  min-width: 0;
}

.recommend-poi-card strong {
  display: block;
  overflow: hidden;
  color: #5d3a1a;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recommend-poi-card span {
  color: rgba(93, 58, 26, 0.58);
  font-size: 11px;
}

.recommend-dot {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(139, 69, 19, 0.08);
}

.recommend-mini-btn,
.recommend-route-btn {
  border: 1px solid rgba(139, 69, 19, 0.22);
  border-radius: 7px;
  background: rgba(255, 248, 220, 0.82);
  color: #8b4513;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.recommend-mini-btn {
  padding: 5px 9px;
  white-space: nowrap;
}

.recommend-route-btn {
  width: 100%;
  margin-top: 4px;
  padding: 10px;
}

.recommend-mini-btn:hover,
.recommend-route-btn:hover {
  border-color: #8b4513;
  background: rgba(139, 69, 19, 0.1);
}

.drawer-food-filter {
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(139, 69, 19, 0.1);
}

.recommend-food-card,
.recommend-service-card {
  margin-bottom: 8px;
}

.recommend-drawer-enter-active {
  transition: all 0.28s ease-out;
}

.recommend-drawer-leave-active {
  transition: all 0.22s ease-in;
}

.recommend-drawer-enter-from,
.recommend-drawer-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}

@media (max-width: 980px) {
  .recommend-drawer {
    left: 20px;
    right: 20px;
    top: auto;
    bottom: 20px;
    width: auto;
    max-height: 42vh;
    z-index: 160;
  }
}

.style-panel {
  margin-bottom: 12px;
  padding: 12px;
  background: rgba(139, 69, 19, 0.06);
  border: 1px solid rgba(139, 69, 19, 0.18);
  border-radius: 10px;
}
.style-panel-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 10px;
}
.style-panel-title { font-size: 13px; font-weight: 700; color: #5D3A1A; }
.style-panel-close {
  background: none; border: none; color: rgba(93, 58, 26, 0.4);
  font-size: 14px; cursor: pointer; padding: 2px 6px;
}
.style-panel-close:hover { color: #8B4513; }
.style-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.style-tag {
  padding: 5px 12px; border: 1px solid rgba(139, 69, 19, 0.25);
  border-radius: 16px; background: rgba(255, 248, 220, 0.6);
  color: #5D3A1A; font-size: 12px; cursor: pointer; transition: all 0.2s;
}
.style-tag:hover { border-color: #8B4513; background: rgba(139, 69, 19, 0.1); }
.style-tag-active {
  background: linear-gradient(135deg, #8B4513, #A0522D) !important;
  color: #FFF8DC !important; border-color: #8B4513 !important;
}
.style-count-row {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 10px;
}
.style-count-label { font-size: 12px; color: rgba(93, 58, 26, 0.7); }
.style-count-ctrl { display: flex; align-items: center; gap: 8px; }
.style-count-btn {
  width: 26px; height: 26px; border: 1px solid rgba(139, 69, 19, 0.25);
  border-radius: 50%; background: rgba(255, 248, 220, 0.6);
  color: #5D3A1A; font-size: 14px; cursor: pointer; display: flex;
  align-items: center; justify-content: center;
}
.style-count-btn:hover { background: rgba(139, 69, 19, 0.12); }
.style-count-val { font-size: 14px; font-weight: 700; color: #5D3A1A; min-width: 20px; text-align: center; }
.style-go-btn {
  width: 100%; padding: 9px; border: none; border-radius: 8px;
  background: linear-gradient(135deg, #B8860B, #DAA520);
  color: #FFF8DC; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.style-go-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 3px 12px rgba(184, 134, 11, 0.35); }
.style-go-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.style-result-list { border-left: 3px solid #DAA520; }
.style-result-item { display: flex; align-items: center; gap: 6px; }
.personal-result-list { border-left: 3px solid #FF8C42; }
.personal-result-item { display: flex; align-items: center; gap: 6px; }
.personal-message {
  font-size: 11px; color: #E8590C; margin-bottom: 6px;
  padding: 4px 8px; background: rgba(232, 89, 12, 0.06); border-radius: 4px;
}
.personal-pref-tags {
  display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px;
}
.personal-pref-tag {
  font-size: 10px; padding: 2px 8px; border-radius: 10px;
  background: rgba(255, 140, 66, 0.12); color: #E8590C; border: 1px solid rgba(232, 89, 12, 0.2);
}
.personal-pref-tag small { opacity: 0.6; }
.poi-style-tag {
  font-size: 9px; padding: 1px 5px; border-radius: 8px;
  background: rgba(184, 134, 11, 0.1); color: #B8860B; border: 1px solid rgba(184, 134, 11, 0.2);
}
.style-route-idx {
  width: 20px; height: 20px; border-radius: 50%;
  background: linear-gradient(135deg, #B8860B, #DAA520);
  color: #FFF8DC; font-size: 10px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.style-dist { font-size: 10px; color: rgba(93, 58, 26, 0.4); }
.style-route-btn {
  width: 100%; padding: 8px; margin-top: 6px;
  background: rgba(184, 134, 11, 0.08);
  border: 1px solid rgba(184, 134, 11, 0.3);
  border-radius: 6px; color: #B8860B;
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.style-route-btn:hover { background: rgba(184, 134, 11, 0.15); }

.smart-itinerary-panel {
  margin-bottom: 14px; padding: 12px;
  background: rgba(184, 134, 11, 0.04);
  border: 1px solid rgba(184, 134, 11, 0.2);
  border-radius: 10px;
}
.smart-itinerary-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 8px;
}
.smart-itinerary-title { font-size: 13px; font-weight: 700; color: #5D3A1A; }

.smart-warning {
  padding: 8px 10px; margin-bottom: 8px;
  background: rgba(232, 93, 58, 0.08); border: 1px solid rgba(232, 93, 58, 0.25);
  border-radius: 6px; color: #E85D3A; font-size: 12px; font-weight: 500;
}

.smart-timeline { margin-bottom: 10px; }
.smart-timeline-row {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 0; font-size: 12px; color: rgba(93, 58, 26, 0.7);
  border-bottom: 1px solid rgba(139, 69, 19, 0.05);
}
.smart-evt-meal { background: rgba(232, 93, 58, 0.03); border-radius: 4px; padding: 4px 6px; }
.smart-evt-photo { background: rgba(139, 69, 19, 0.03); border-radius: 4px; padding: 4px 6px; }
.smart-evt-spot { font-weight: 500; }
.smart-tl-time { min-width: 90px; font-size: 11px; color: rgba(93, 58, 26, 0.5); font-family: monospace; }
.smart-tl-dot { font-size: 8px; }
.dot-spot { color: #DAA520; }
.dot-meal { color: #E85D3A; }
.dot-photo { color: #8B4513; }
.smart-tl-name { color: #5D3A1A; flex: 1; }

.smart-section-title {
  font-size: 12px; font-weight: 600; color: #5D3A1A;
  margin: 8px 0 6px; padding-bottom: 4px;
  border-bottom: 1px solid rgba(139, 69, 19, 0.1);
}

.smart-cancel-btn {
  padding: 2px 10px; border: 1px solid rgba(93, 58, 26, 0.15);
  border-radius: 4px; background: none; color: rgba(93, 58, 26, 0.4);
  font-size: 11px; cursor: pointer;
}
.smart-cancel-btn:hover { color: #E85D3A; border-color: #E85D3A; }
.smart-set-end-btn {
  padding: 2px 10px; border: 1px solid rgba(232, 93, 58, 0.3);
  border-radius: 4px; background: rgba(232, 93, 58, 0.06); color: #E85D3A;
  font-size: 11px; cursor: pointer;
}
.smart-set-end-btn:hover { background: rgba(232, 93, 58, 0.15); }

.smart-summary {
  font-size: 12px; color: #5D3A1A; font-weight: 600;
  padding: 6px 0; text-align: center;
  border-top: 1px solid rgba(139, 69, 19, 0.1);
  margin-top: 6px;
}

.food-style-tag {
  font-size: 10px; padding: 1px 5px; border-radius: 3px;
  background: rgba(184, 134, 11, 0.1); color: #B8860B; font-weight: 500;
}

.poi-list { margin-bottom: 14px; }
.poi-list-title { font-size: 12px; font-weight: 600; color: rgba(93, 58, 26, 0.7); margin-bottom: 6px; }
.poi-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 7px 10px; margin-bottom: 4px;
  background: rgba(139, 69, 19, 0.04); border-radius: 6px;
  border: 1px solid rgba(139, 69, 19, 0.1); cursor: pointer; transition: all 0.2s;
}
.poi-item:hover { background: rgba(139, 69, 19, 0.1); border-color: rgba(139, 69, 19, 0.3); }
.poi-name { font-size: 13px; color: #5D3A1A; font-weight: 500; }
.poi-hotness { font-size: 11px; color: #A0522D; font-weight: 600; }

.service-list { margin-bottom: 14px; }
.service-list-title { font-size: 12px; font-weight: 600; color: #8B4513; margin-bottom: 6px; }

.food-list { margin-bottom: 14px; }
.food-list-title {
  font-size: 12px; font-weight: 600; color: #E85D3A; margin-bottom: 6px;
  display: flex; align-items: center; justify-content: space-between;
}
.food-filter-bar {
  display: flex; align-items: center; justify-content: space-between;
  gap: 6px; margin-bottom: 8px; flex-wrap: wrap;
}
.food-sort-btns { display: flex; gap: 3px; }
.food-sort-btn {
  padding: 2px 8px; border: 1px solid rgba(232,93,58,0.2); border-radius: 4px;
  background: rgba(232,93,58,0.04); color: #8B5E3C; font-size: 11px;
  cursor: pointer; transition: all 0.15s;
}
.food-sort-btn:hover { background: rgba(232,93,58,0.12); }
.food-sort-btn.active {
  background: #E85D3A; color: #fff; border-color: #E85D3A; font-weight: 600;
}
.food-cuisine-select {
  padding: 2px 6px; border: 1px solid rgba(232,93,58,0.2); border-radius: 4px;
  background: #fff; color: #5D3A1A; font-size: 11px; cursor: pointer;
  max-width: 90px;
}
.food-list-close {
  background: none; border: none; font-size: 14px; cursor: pointer;
  color: rgba(93, 58, 26, 0.4); padding: 0 4px;
}
.nearby-food-list { border: 1px solid rgba(232, 93, 58, 0.2); border-radius: 8px; padding: 10px; background: rgba(232, 93, 58, 0.03); }

.food-item {
  padding: 8px 10px; margin-bottom: 5px;
  background: rgba(232, 93, 58, 0.04); border-radius: 7px;
  border-left: 3px solid #E85D3A; cursor: pointer; transition: all 0.2s;
}
.food-item:hover { background: rgba(232, 93, 58, 0.1); transform: translateX(2px); }

.food-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px; }
.food-name { font-size: 13px; color: #5D3A1A; font-weight: 500; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.food-rating { font-size: 11px; color: #E85D3A; font-weight: 700; white-space: nowrap; margin-left: 6px; }
.food-meta { display: flex; gap: 8px; font-size: 11px; color: rgba(93, 58, 26, 0.55); }
.food-cuisine { background: rgba(232, 93, 58, 0.08); padding: 1px 6px; border-radius: 4px; }
.food-dist { color: rgba(93, 58, 26, 0.45); }
.food-price { color: #D4A574; font-weight: 600; letter-spacing: 1px; }
.food-addr { font-size: 10px; color: rgba(93, 58, 26, 0.35); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.food-set-end-btn {
  margin-top: 5px; padding: 3px 10px; border: 1px solid rgba(232, 93, 58, 0.3);
  border-radius: 5px; background: rgba(232, 93, 58, 0.08); color: #E85D3A;
  font-size: 11px; cursor: pointer; transition: all 0.2s;
}
.food-set-end-btn:hover { background: rgba(232, 93, 58, 0.18); border-color: #E85D3A; }
.food-actions { display: flex; gap: 6px; align-items: center; margin-top: 5px; }
.food-dp-link {
  font-size: 11px; color: #3b82f6; text-decoration: none; cursor: pointer;
  padding: 3px 8px; border-radius: 4px; transition: all 0.2s;
  white-space: nowrap; border: 1px solid rgba(59, 130, 246, 0.2);
  background: rgba(59, 130, 246, 0.05);
}
.food-dp-link:hover { background: rgba(59, 130, 246, 0.12); border-color: #3b82f6; color: #2563eb; }
.smart-dp-link {
  font-size: 10px; color: #3b82f6; text-decoration: none; cursor: pointer;
  margin-left: 4px; padding: 1px 5px; border-radius: 3px;
  border: 1px solid rgba(59, 130, 246, 0.25); background: rgba(59, 130, 246, 0.06);
}
.smart-dp-link:hover { background: rgba(59, 130, 246, 0.15); }

.service-item {
  padding: 10px 12px; margin-bottom: 6px;
  background: rgba(139, 69, 19, 0.04); border-radius: 8px;
  border-left: 3px solid #8B4513; transition: all 0.25s;
}
.service-item:hover { background: rgba(139, 69, 19, 0.08); }
.service-item.service-photographer { border-left-color: #8B4513; }
.service-item.service-makeup { border-left-color: #A0522D; }
.service-item.service-drone { border-left-color: #6B4226; }
.service-item.service-clothing { border-left-color: #D4A574; }

.service-header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.service-icon { font-size: 15px; }
.service-name { flex: 1; font-size: 13px; color: #5D3A1A; font-weight: 500; }
.service-hotness { font-size: 10px; color: rgba(93, 58, 26, 0.45); font-weight: 600; }

.service-actions { text-align: right; }
.book-status {
  padding: 4px 14px; border: none; border-radius: 6px;
  font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.book-status.available {
  background: linear-gradient(135deg, #8B4513, #A0522D); color: #FFF8DC;
}
.book-status.available:hover { transform: scale(1.05); box-shadow: 0 2px 10px rgba(139, 69, 19, 0.35); }
.book-status.set-end {
  background: linear-gradient(135deg, #E85D3A, #FF6B4A); color: #fff;
}
.book-status.set-end:hover { transform: scale(1.05); box-shadow: 0 2px 10px rgba(232, 93, 58, 0.35); }
.book-status.booked {
  background: rgba(139, 69, 19, 0.06); color: rgba(93, 58, 26, 0.35);
  cursor: not-allowed; border: 1px solid rgba(139, 69, 19, 0.1);
}

.sidebar-spacer {
  flex: 1;
  min-height: 10px;
}

.my-services-panel {
  margin-top: 10px;
  padding: 12px;
  background: rgba(139, 69, 19, 0.05);
  border: 1px solid rgba(139, 69, 19, 0.2);
  border-radius: 10px;
}
.my-services-title {
  font-size: 13px;
  font-weight: 700;
  color: #8B4513;
  margin-bottom: 10px;
  letter-spacing: 1px;
}
.my-service-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px;
  margin-bottom: 6px;
  background: rgba(255, 248, 220, 0.6);
  border: 1px solid rgba(139, 69, 19, 0.12);
  border-radius: 8px;
  transition: all 0.2s;
}
.my-service-card.expired { opacity: 0.45; }
.my-service-card:last-child { margin-bottom: 0; }
.my-service-info { display: flex; align-items: center; gap: 8px; flex: 1; }
.my-service-icon { font-size: 18px; }
.my-service-detail { display: flex; flex-direction: column; gap: 2px; }
.my-service-name { font-size: 13px; color: #5D3A1A; font-weight: 600; }
.my-service-time { font-size: 11px; color: rgba(93, 58, 26, 0.5); }
.my-service-cancel {
  padding: 5px 12px;
  border: 1px solid rgba(180, 60, 60, 0.25);
  border-radius: 6px;
  background: rgba(180, 60, 60, 0.06);
  color: #b43c3c;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.my-service-cancel:hover {
  background: rgba(180, 60, 60, 0.12);
  border-color: rgba(180, 60, 60, 0.4);
}

.my-bookings-panel {
  position: sticky;
  bottom: 0;
  margin-top: 10px;
  background: rgba(255, 248, 220, 0.98);
  border: 1px solid #D4A574;
  border-radius: 8px; overflow: hidden;
  transition: all 0.25s;
  z-index: 10;
}
.my-bookings-panel.collapsed .panel-body { display: none; }

.panel-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 12px; cursor: pointer;
  font-size: 13px; font-weight: 600; color: #8B4513;
  background: rgba(139, 69, 19, 0.06);
  transition: background 0.2s;
}
.panel-header:hover { background: rgba(139, 69, 19, 0.1); }
.toggle-arrow { font-size: 10px; color: rgba(93, 58, 26, 0.4); }

.panel-body { padding: 8px; max-height: 200px; overflow-y: auto; }
.panel-body::-webkit-scrollbar { width: 3px; }
.panel-body::-webkit-scrollbar-thumb { background: rgba(139, 69, 19, 0.2); border-radius: 2px; }

.panel-empty {
  text-align: center; padding: 16px 8px;
  color: rgba(93, 58, 26, 0.3); font-size: 12px;
}

.booking-card {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 10px; margin-bottom: 5px;
  background: rgba(139, 69, 19, 0.04); border-radius: 6px;
  border: 1px solid rgba(139, 69, 19, 0.1); transition: all 0.2s;
}
.booking-card.expired { opacity: 0.5; border-color: transparent; background: rgba(139, 69, 19, 0.02); }

.booking-info { display: flex; align-items: center; gap: 8px; flex: 1; }
.booking-icon { font-size: 16px; }
.booking-detail { display: flex; flex-direction: column; gap: 2px; }
.booking-name { font-size: 12px; color: #5D3A1A; font-weight: 500; }
.booking-time { font-size: 10px; color: rgba(93, 58, 26, 0.45); }
.countdown { font-size: 10px; color: #8B4513; font-weight: 600; }
.expired-tag { font-size: 10px; color: #A0522D; }

.cancel-booking-btn {
  padding: 3px 10px; border: none; border-radius: 4px;
  background: rgba(139, 69, 19, 0.08); color: #8B4513;
  font-size: 10px; cursor: pointer; transition: all 0.2s;
}
.cancel-booking-btn:hover { background: rgba(139, 69, 19, 0.2); }

.status-panel {
  font-size: 12px; color: rgba(93, 58, 26, 0.65);
  background: rgba(139, 69, 19, 0.04); padding: 10px;
  border-radius: 6px; border: 1px solid rgba(139, 69, 19, 0.1);
  line-height: 1.5;
}

.nav-footer {
  display: flex; flex-direction: column; gap: 10px;
  padding-top: 20px; border-top: 1px solid rgba(139, 69, 19, 0.2);
}

.ai-diary-shortcut {
  padding: 12px;
  background: rgba(139, 69, 19, 0.08);
  border: 1px solid rgba(139, 69, 19, 0.3);
  border-radius: 10px; color: #8B4513;
  font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s;
  display: flex; align-items: center; justify-content: center; gap: 8px;
}
.ai-diary-shortcut:hover:not(:disabled) {
  background: rgba(139, 69, 19, 0.15); border-color: rgba(139, 69, 19, 0.5);
  transform: translateY(-2px); box-shadow: 0 4px 12px rgba(139, 69, 19, 0.2);
}
.ai-diary-shortcut:disabled {
  opacity: 0.4; cursor: not-allowed; transform: none; box-shadow: none;
}

.diary-btn {
  width: 100%; padding: 12px;
  background: linear-gradient(135deg, #8B4513, #A0522D);
  border: none; border-radius: 10px; color: #FFF8DC;
  font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s;
  display: flex; align-items: center; justify-content: center; gap: 10px;
}
.diary-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(139, 69, 19, 0.4); }
.diary-icon { font-size: 16px; }

.campus-nav-btn {
  width: 100%; padding: 12px;
  background: linear-gradient(135deg, #1A5276, #2980B9);
  border: none; border-radius: 10px; color: #fff;
  font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s;
  display: flex; align-items: center; justify-content: center; gap: 10px;
}
.campus-nav-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(26, 82, 118, 0.4); }
.campus-icon { font-size: 16px; }

/* 景区内导航弹窗 */
.campus-nav-modal {
  background: #FFFDF5;
  border: 1px solid #D4A574;
  border-radius: 14px;
  width: 420px;
  max-height: 70vh;
  overflow-y: auto;
  box-shadow: 0 12px 40px rgba(93, 58, 26, 0.25);
  animation: rainAlertIn 0.25s ease-out;
}
.campus-nav-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 20px 14px; border-bottom: 1px solid rgba(139, 69, 19, 0.1);
}
.campus-nav-header h3 { margin: 0; font-size: 16px; color: #5D3A1A; }
.campus-nav-body { padding: 16px 20px; }
.campus-nav-desc {
  font-size: 13px; color: #8B4513; margin: 0 0 14px;
  line-height: 1.5;
}
.campus-list { display: flex; flex-direction: column; gap: 8px; }
.campus-item {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 16px;
  background: rgba(41, 128, 185, 0.04);
  border: 1px solid rgba(41, 128, 185, 0.2);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  color: #5D3A1A;
}
.campus-item:hover {
  background: rgba(41, 128, 185, 0.1);
  border-color: rgba(41, 128, 185, 0.35);
  transform: translateX(4px);
}
.campus-item-icon { font-size: 28px; flex-shrink: 0; }
.campus-item-info { flex: 1; display: flex; flex-direction: column; gap: 3px; }
.campus-item-name { font-size: 15px; font-weight: 600; color: #1A5276; }
.campus-item-detail { font-size: 11px; color: #8B4513; opacity: 0.55; }
.campus-item-arrow { font-size: 18px; color: #2980B9; flex-shrink: 0; }

.journey-sidebar.compact {
  width: 180px;
  padding: 12px;
  max-height: 180px;
}
.journey-sidebar.compact .journey-header {
  padding-bottom: 8px;
  margin-bottom: 0;
  border-bottom: none;
}
.journey-sidebar.compact .journey-clock {
  font-size: 18px;
}
.journey-sidebar.compact .journey-drag-handle {
  padding: 3px 0;
  margin-bottom: 4px;
  font-size: 10px;
}
.journey-sidebar.compact .journey-header h3 {
  font-size: 13px;
  margin-bottom: 2px;
}
.journey-sidebar.compact .journey-compact-actions {
  margin-top: 6px;
  text-align: center;
}
.journey-sidebar.compact .journey-current-stage {
  text-align: center;
  margin-top: 6px;
  font-size: 12px;
  color: #8B4513;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.journey-sidebar.compact .journey-current-stage .jcs-dot {
  display: inline-block;
  color: #D4A574;
  animation: pulse 2s infinite;
  margin-right: 4px;
}
.journey-sidebar.compact .journey-current-stage .jcs-name {
  font-weight: 600;
}
.journey-toggle-btn {
  background: rgba(139, 69, 19, 0.1);
  border: 1px solid rgba(139, 69, 19, 0.2);
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 11px;
  color: #5D3A1A;
  cursor: pointer;
  transition: all 0.2s;
}
.journey-toggle-btn:hover {
  background: rgba(139, 69, 19, 0.2);
}

.journey-sidebar {
  position: absolute;
  width: 280px;
  background: rgba(255, 248, 220, 0.96);
  border: 1px solid #D4A574;
  border-radius: 12px;
  padding: 18px;
  z-index: 100;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(139, 69, 19, 0.15);
  display: flex;
  flex-direction: column;
  color: #5D3A1A;
  user-select: none;
}
.journey-sidebar::-webkit-scrollbar { width: 4px; }
.journey-sidebar::-webkit-scrollbar-thumb { background: rgba(139, 69, 19, 0.2); border-radius: 2px; }

.journey-drag-handle {
  text-align: center;
  padding: 6px 0;
  margin-bottom: 8px;
  font-size: 11px;
  color: rgba(93, 58, 26, 0.4);
  cursor: grab;
  border-bottom: 1px dashed rgba(139, 69, 19, 0.15);
  letter-spacing: 1px;
}
.journey-drag-handle:active { cursor: grabbing; }

.journey-header {
  text-align: center;
  padding-bottom: 14px;
  border-bottom: 1px solid #D4A574;
  margin-bottom: 14px;
}
.journey-header h3 {
  margin: 0 0 6px 0;
  font-size: 16px;
  color: #5D3A1A;
  letter-spacing: 2px;
}
.journey-clock {
  font-size: 24px;
  font-weight: 700;
  color: #8B4513;
  font-family: 'Georgia', serif;
  letter-spacing: 2px;
}

.journey-timeline {
  flex: 1;
  overflow-y: auto;
}

.journey-stage {
  display: flex;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px dashed rgba(139, 69, 19, 0.15);
  transition: all 0.3s;
}
.journey-stage:last-child { border-bottom: none; }

.stage-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  flex-shrink: 0;
  margin-top: 2px;
}
.stage-past .stage-dot {
  background: #8B4513;
  color: #FFF8DC;
}
.stage-current .stage-dot {
  background: #D4A574;
  color: #5D3A1A;
  box-shadow: 0 0 8px rgba(212, 165, 116, 0.5);
  animation: pulse 2s infinite;
}
.stage-future .stage-dot {
  background: rgba(139, 69, 19, 0.1);
  color: rgba(93, 58, 26, 0.4);
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 8px rgba(212, 165, 116, 0.5); }
  50% { box-shadow: 0 0 16px rgba(212, 165, 116, 0.8); }
}

.stage-info { flex: 1; }
.stage-name {
  font-size: 13px;
  font-weight: 600;
  color: #5D3A1A;
  margin-bottom: 2px;
}
.stage-current .stage-name { color: #8B4513; }
.stage-time {
  font-size: 11px;
  color: rgba(93, 58, 26, 0.5);
  font-family: monospace;
}
.stage-duration {
  font-size: 11px;
  color: #A0522D;
  margin-top: 2px;
}

.exit-journey-btn {
  margin-top: 16px;
  padding: 10px;
  background: rgba(139, 69, 19, 0.08);
  border: 1px solid rgba(139, 69, 19, 0.3);
  border-radius: 8px;
  color: #8B4513;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  letter-spacing: 2px;
}
.exit-journey-btn:hover {
  background: rgba(139, 69, 19, 0.15);
  border-color: rgba(139, 69, 19, 0.5);
}

.update-progress-btn {
  margin-top: 10px;
  padding: 9px;
  background: rgba(139, 69, 19, 0.06);
  border: 1px solid rgba(139, 69, 19, 0.25);
  border-radius: 8px;
  color: #8B4513;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  letter-spacing: 1px;
}
.update-progress-btn:hover {
  background: rgba(139, 69, 19, 0.12);
  border-color: rgba(139, 69, 19, 0.4);
}

.flowchart-btn {
  margin-top: 6px;
  padding: 9px;
  background: rgba(184, 134, 11, 0.06);
  border: 1px solid rgba(184, 134, 11, 0.25);
  border-radius: 8px;
  color: #B8860B;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  letter-spacing: 1px;
}
.flowchart-btn:hover {
  background: rgba(184, 134, 11, 0.12);
  border-color: rgba(184, 134, 11, 0.4);
}

.ai-diary-journey-btn {
  margin-top: 6px;
  padding: 9px;
  background: linear-gradient(135deg, rgba(139, 69, 19, 0.08), rgba(184, 134, 11, 0.08));
  border: 1px solid rgba(184, 134, 11, 0.25);
  border-radius: 8px;
  color: #8B4513;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  letter-spacing: 1px;
}
.ai-diary-journey-btn:hover {
  background: linear-gradient(135deg, rgba(139, 69, 19, 0.15), rgba(184, 134, 11, 0.15));
  border-color: rgba(184, 134, 11, 0.4);
}

/* 流程图弹窗 */
.flowchart-modal {
  background: #FFFDF5;
  border: 1px solid #D4A574;
  border-radius: 14px;
  width: 360px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 12px 40px rgba(93, 58, 26, 0.25);
  animation: rainAlertIn 0.25s ease-out;
}
.flowchart-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(139, 69, 19, 0.1);
}
.flowchart-header h3 { margin: 0; font-size: 15px; color: #5D3A1A; }
.flowchart-body {
  padding: 18px 24px;
  display: flex; flex-direction: column; align-items: center;
}
.fc-node {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 16px; border-radius: 10px;
  font-size: 13px; color: #5D3A1A;
  border: 1px solid rgba(139, 69, 19, 0.2);
  background: rgba(255, 248, 220, 0.6);
  width: 100%; box-sizing: border-box;
  transition: all 0.2s;
}
.fc-node-start {
  background: linear-gradient(135deg, #8B4513, #A0522D);
  color: #FFF8DC; border-color: #8B4513;
  justify-content: center; font-weight: 600;
}
.fc-node-end {
  background: linear-gradient(135deg, #B8860B, #DAA520);
  color: #FFF8DC; border-color: #B8860B;
  justify-content: center; font-weight: 600;
}
.fc-node-visit { border-left: 3px solid #8B4513; }
.fc-node-travel { border-left: 3px solid #D4A574; background: rgba(255, 248, 220, 0.3); }
.fc-node-custom { border-left: 3px solid #DAA520; }
.fc-node-current {
  border-color: #8B4513; background: rgba(139, 69, 19, 0.1);
  box-shadow: 0 0 0 2px rgba(139, 69, 19, 0.15);
}
.fc-node-past { opacity: 0.6; }
.fc-icon { font-size: 15px; }
.fc-label { flex: 1; font-weight: 500; }
.fc-dur { font-size: 11px; color: #8B4513; font-weight: 600; }
.fc-arrow {
  text-align: center; color: #D4A574; font-size: 16px;
  line-height: 1; padding: 2px 0;
}

.edit-header {
  padding-bottom: 10px;
  border-bottom: 1px solid #D4A574;
  margin-bottom: 10px;
}
.edit-header h4 {
  margin: 0 0 4px 0;
  font-size: 14px;
  color: #5D3A1A;
}
.edit-hint {
  font-size: 11px;
  color: rgba(93, 58, 26, 0.5);
}

.edit-current-stage {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 10px;
  background: rgba(139, 69, 19, 0.06);
  border-radius: 6px;
  border: 1px solid rgba(139, 69, 19, 0.15);
}
.edit-current-stage label {
  font-size: 12px;
  color: #5D3A1A;
  font-weight: 600;
  white-space: nowrap;
}
.edit-select {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid rgba(139, 69, 19, 0.25);
  border-radius: 4px;
  background: rgba(255, 248, 220, 0.9);
  color: #5D3A1A;
  font-size: 12px;
  outline: none;
}

.edit-stages-list {
  flex: 1;
  overflow-y: auto;
  max-height: 300px;
}
.edit-stages-list::-webkit-scrollbar { width: 3px; }
.edit-stages-list::-webkit-scrollbar-thumb { background: rgba(139, 69, 19, 0.2); border-radius: 2px; }

.edit-stage-item {
  padding: 8px 0;
  border-bottom: 1px dashed rgba(139, 69, 19, 0.1);
}
.edit-stage-item:last-child { border-bottom: none; }

.edit-stage-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.edit-stage-name {
  font-size: 12px;
  font-weight: 600;
  color: #5D3A1A;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.edit-name-input {
  flex: 1;
  padding: 3px 8px;
  border: 1px solid rgba(139, 69, 19, 0.3);
  border-radius: 4px;
  background: rgba(255, 248, 220, 0.8);
  color: #5D3A1A;
  font-size: 12px;
  font-weight: 600;
  outline: none;
}
.edit-name-input:focus { border-color: #8B4513; }
.edit-poi-info {
  font-size: 11px;
  color: #8B4513;
  margin-bottom: 4px;
  padding-left: 2px;
}
.edit-poi-btn {
  color: #8B4513 !important;
  border-color: rgba(139, 69, 19, 0.3) !important;
}
.edit-stage-dur {
  display: flex;
  align-items: center;
  gap: 4px;
}
.dur-sm-btn {
  width: 22px; height: 22px;
  border: 1px solid rgba(139, 69, 19, 0.25);
  border-radius: 4px;
  background: rgba(139, 69, 19, 0.06);
  color: #8B4513;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dur-sm-btn:hover { background: rgba(139, 69, 19, 0.15); }
.dur-sm-val {
  font-size: 12px;
  font-weight: 600;
  color: #5D3A1A;
  min-width: 28px;
  text-align: center;
}
.edit-stage-fixed {
  font-size: 11px;
  color: rgba(93, 58, 26, 0.4);
}

.edit-stage-actions {
  display: flex;
  gap: 6px;
}
.edit-add-btn {
  padding: 2px 8px;
  border: 1px solid rgba(139, 69, 19, 0.2);
  border-radius: 4px;
  background: transparent;
  color: rgba(93, 58, 26, 0.5);
  font-size: 10px;
  cursor: pointer;
  transition: all 0.2s;
}
.edit-add-btn:hover { color: #8B4513; border-color: rgba(139, 69, 19, 0.4); }
.edit-del-btn {
  padding: 2px 8px;
  border: 1px solid rgba(180, 60, 60, 0.2);
  border-radius: 4px;
  background: transparent;
  color: rgba(180, 60, 60, 0.6);
  font-size: 10px;
  cursor: pointer;
  transition: all 0.2s;
}
.edit-del-btn:hover { color: #b43c3c; border-color: rgba(180, 60, 60, 0.4); }

.edit-footer {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(139, 69, 19, 0.15);
}
.edit-save-btn {
  flex: 1;
  padding: 8px;
  background: linear-gradient(135deg, #8B4513, #A0522D);
  border: none;
  border-radius: 6px;
  color: #FFF8DC;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.edit-save-btn:hover { box-shadow: 0 3px 10px rgba(139, 69, 19, 0.3); }
.edit-cancel-btn {
  flex: 1;
  padding: 8px;
  background: rgba(139, 69, 19, 0.06);
  border: 1px solid rgba(139, 69, 19, 0.25);
  border-radius: 6px;
  color: #8B4513;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.edit-cancel-btn:hover { background: rgba(139, 69, 19, 0.12); }

.poi-popup {
  position: fixed;
  z-index: 10000;
  min-width: 200px;
  max-width: 280px;
  background: rgba(255, 248, 220, 0.98);
  border: 2px solid #D4A574;
  border-radius: 10px;
  padding: 12px 16px 16px;
  box-shadow: 0 8px 32px rgba(139, 69, 19, 0.25);
  color: #5D3A1A;
  animation: fadeIn 0.15s ease;
}

.poi-popup-drag-handle {
  text-align: center; cursor: grab; user-select: none;
  margin-bottom: 4px; margin-top: -6px; color: #bbb;
  font-size: 16px; letter-spacing: 3px;
  transition: color 0.2s;
}
.poi-popup-drag-handle:active { cursor: grabbing; }
.poi-popup-drag-handle:hover { color: #8B4513; }

.poi-popup-close {
  position: absolute;
  top: 8px; right: 8px;
  width: 22px; height: 22px;
  border: 1px solid rgba(139, 69, 19, 0.2);
  border-radius: 4px;
  background: rgba(139, 69, 19, 0.06);
  color: #8B4513;
  font-size: 12px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
}
.poi-popup-close:hover { background: rgba(139, 69, 19, 0.15); }

.poi-popup-name {
  font-size: 16px;
  font-weight: 700;
  color: #5D3A1A;
  margin-bottom: 8px;
  padding-right: 24px;
  letter-spacing: 1px;
}

.poi-popup-desc {
  font-size: 13px;
  color: rgba(93, 58, 26, 0.65);
  line-height: 1.6;
  margin-bottom: 12px;
}

.poi-popup-btn {
  flex: 1;
  padding: 8px;
  background: linear-gradient(135deg, #8B4513, #A0522D);
  border: 1px solid #D4A574;
  border-radius: 6px;
  color: #FFF8DC;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  letter-spacing: 1px;
}
.poi-popup-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 3px 10px rgba(139, 69, 19, 0.3);
}
.poi-popup-btn-end {
  background: linear-gradient(135deg, #6B4226, #8B4513);
}
.poi-popup-food {
  background: linear-gradient(135deg, #E85D3A, #FF6B4A);
  color: #fff;
}
.poi-popup-actions {
  display: flex;
  gap: 8px;
}

/* POI 悬停提示 */
.poi-tooltip {
  position: fixed; z-index: 10001;
  max-width: 240px;
  background: rgba(255, 248, 220, 0.97);
  border: 1px solid #D4A574;
  border-radius: 8px;
  padding: 10px 12px;
  box-shadow: 0 4px 16px rgba(139, 69, 19, 0.2);
  pointer-events: none;
  animation: fadeIn 0.12s ease;
}
.poi-tooltip-name {
  font-size: 12px; font-weight: 600; color: #5D3A1A; margin-bottom: 4px;
}
.poi-tooltip-desc {
  font-size: 11px; color: rgba(93, 58, 26, 0.7); line-height: 1.4;
  font-style: italic;
}
.poi-desc-tag {
  font-size: 12px; cursor: pointer; margin-left: auto;
  opacity: 0.7; transition: opacity 0.2s;
}
.poi-desc-tag:hover { opacity: 1; }

/* 景点详情弹窗 */
.poi-detail-overlay {
  position: fixed; inset: 0; z-index: 11000;
  background: rgba(93, 58, 26, 0.45); backdrop-filter: blur(3px);
}
.poi-detail-card {
  background: linear-gradient(145deg, #FFF8DC, #FFFDF5);
  border: 2px solid #D4A574;
  border-radius: 16px;
  padding: 28px 32px 20px;
  max-width: 380px; width: 380px;
  box-shadow: 0 16px 48px rgba(139, 69, 19, 0.3);
  pointer-events: auto;
}
.poi-detail-drag-handle {
  text-align: center; cursor: grab; user-select: none;
  margin-bottom: 4px; margin-top: -12px; color: #aaa;
  font-size: 18px; letter-spacing: 4px;
  transition: color 0.2s;
}
.poi-detail-drag-handle:active { cursor: grabbing; }
.poi-detail-drag-handle:hover { color: #8B4513; }
.drag-dots { pointer-events: none; }
@keyframes cardSlideIn {
  from { transform: translateY(20px) scale(0.95); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
}
.poi-detail-close {
  position: absolute; top: 10px; right: 12px;
  background: none; border: none;
  font-size: 18px; cursor: pointer; color: rgba(93, 58, 26, 0.5);
  transition: color 0.2s;
}
.poi-detail-close:hover { color: #E85D3A; }
.poi-detail-icon { font-size: 48px; text-align: center; margin-bottom: 8px; }
.poi-detail-name {
  font-size: 20px; font-weight: 700; color: #5D3A1A;
  text-align: center; margin-bottom: 4px;
}
.poi-detail-style {
  font-size: 12px; color: #8B4513; text-align: center; margin-bottom: 4px;
  background: rgba(139, 69, 19, 0.08); display: inline-block;
  padding: 2px 10px; border-radius: 10px; margin: 0 auto 4px;
  display: block; width: fit-content;
}
.poi-detail-hottness {
  font-size: 13px; color: #E85D3A; text-align: center; margin-bottom: 12px;
}
.poi-detail-desc {
  font-size: 14px; color: rgba(93, 58, 26, 0.8); line-height: 1.7;
  text-align: center; margin-bottom: 16px;
  padding: 12px; background: rgba(212, 165, 116, 0.1);
  border-radius: 8px;
  font-style: italic;
}

/* AI 拍照指导样式 */
.poi-detail-guidance-section {
  margin: 12px 0 16px;
  padding: 12px;
  background: rgba(139, 69, 19, 0.04);
  border: 1px solid rgba(139, 69, 19, 0.15);
  border-radius: 10px;
  text-align: left;
}
.guidance-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.guidance-icon { font-size: 16px; }
.guidance-title {
  font-size: 14px;
  font-weight: 700;
  color: #8B4513;
  flex: 1;
}
.guidance-refresh-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: #8B4513;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.guidance-refresh-btn:hover:not(:disabled) {
  background: rgba(139, 69, 19, 0.1);
  transform: rotate(30deg);
}
.guidance-refresh-btn:disabled {
  opacity: 0.5;
  cursor: wait;
}
.guidance-loading {
  font-size: 12px;
  color: rgba(93, 58, 26, 0.6);
  text-align: center;
  padding: 10px 0;
}
.loading-dots {
  display: inline-block;
  font-weight: bold;
}
.loading-dots span {
  animation: loadingDots 1.4s infinite;
  opacity: 0;
}
.loading-dots span:nth-child(2) { animation-delay: 0.2s; }
.loading-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes loadingDots {
  0% { opacity: 0; }
  50% { opacity: 1; }
  100% { opacity: 0; }
}
.guidance-content {
  font-size: 13px;
  color: #5D3A1A;
  line-height: 1.6;
  background: #fff;
  padding: 10px;
  border-radius: 6px;
  border-left: 3px solid #D4A574;
}
.guidance-content p { margin: 0; }
.guidance-context-tag {
  font-size: 11px;
  color: #8B4513;
  background: rgba(139, 69, 19, 0.08);
  padding: 4px 8px;
  border-radius: 4px;
  margin-bottom: 8px;
  display: inline-block;
  font-weight: 600;
}
.pose-view-tag {
  margin: 0 0 12px;
  display: flex;
  width: 100%;
  justify-content: center;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #fff;
  background: linear-gradient(135deg, #8B4513, #A0522D);
  border: none;
  padding: 10px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 700;
  box-shadow: 0 4px 12px rgba(139, 69, 19, 0.2);
  transition: all 0.2s;
}
.pose-view-tag:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(139, 69, 19, 0.3);
  background: linear-gradient(135deg, #A0522D, #8B4513);
}
.guidance-empty {
  font-size: 12px;
  color: rgba(93, 58, 26, 0.5);
  text-align: center;
  padding: 8px 0;
  font-style: italic;
}

.pose-modal-card {
  background: #FFFDF5;
  border: 2px solid #D4A574;
  border-radius: 20px;
  padding: 28px 36px 34px;
  max-width: min(1120px, calc(100vw - 48px));
  width: 94%;
  max-height: 92dvh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  position: relative;
  animation: cardSlideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.pose-modal-card-compact {
  max-width: min(1040px, calc(100vw - 48px));
}
.pose-modal-close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 32px;
  height: 32px;
  background: rgba(139, 69, 19, 0.1);
  border: none;
  border-radius: 50%;
  font-size: 16px;
  cursor: pointer;
  color: #8B4513;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  z-index: 10;
}
.pose-modal-close:hover {
  background: #E85D3A;
  color: #fff;
  transform: rotate(90deg);
}
.pose-modal-title {
  font-size: 22px;
  font-weight: 800;
  color: #5D3A1A;
  margin-bottom: 20px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.pose-modal-title::before, .pose-modal-title::after {
  content: "";
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, transparent, #D4A574, transparent);
}
.pose-reroll-btn {
  display: block;
  margin: -8px auto 18px;
  padding: 8px 16px;
  border: 1px solid rgba(139, 69, 19, 0.18);
  border-radius: 999px;
  background: #FFF7E8;
  color: #8B4513;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}
.pose-reroll-btn:hover {
  background: #8B4513;
  color: #fff;
  transform: translateY(-1px);
}
.pose-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 28px;
}
.pose-card {
  background: #fff;
  border: 1px solid rgba(139, 69, 19, 0.1);
  border-radius: 16px;
  padding: 12px;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
}
.pose-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 24px rgba(139, 69, 19, 0.15);
  border-color: #D4A574;
}
.pose-img {
  width: 100%;
  height: clamp(260px, 34vh, 360px);
  object-fit: contain;
  border-radius: 12px;
  background: #fdfaf5;
  border: 1px solid rgba(139, 69, 19, 0.05);
}
.pose-keyword {
  margin-top: 12px;
  font-size: 15px;
  font-weight: 800;
  color: #8B4513;
  text-align: center;
}
.pose-desc {
  margin-top: 6px;
  font-size: 13px;
  color: rgba(93, 58, 26, 0.7);
  line-height: 1.5;
  text-align: center;
  flex: 1;
}
.pose-tip {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(212, 165, 116, 0.12);
  color: #6B4423;
  font-size: 12px;
  line-height: 1.45;
}

@media (max-width: 560px) {
  .pose-modal-card,
  .pose-modal-card-compact {
    width: calc(100vw - 24px);
    max-width: calc(100vw - 24px);
    padding: 22px 16px 24px;
  }

  .pose-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }

  .pose-img {
    height: 240px;
  }
}

.poi-detail-links {
  text-align: center; margin-bottom: 16px;
}
.poi-detail-baidu-btn {
  display: inline-block; font-size: 13px;
  color: #2563eb; text-decoration: none;
  padding: 6px 16px; border: 1px solid rgba(37, 99, 235, 0.3);
  border-radius: 8px; background: rgba(37, 99, 235, 0.05);
  transition: all 0.2s; cursor: pointer;
}
.poi-detail-baidu-btn:hover { background: rgba(37, 99, 235, 0.12); border-color: #2563eb; }
.poi-detail-actions {
  display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;
}
.poi-detail-btn {
  padding: 8px 16px; border: 1px solid rgba(139, 69, 19, 0.3);
  border-radius: 8px; background: rgba(139, 69, 19, 0.08);
  color: #5D3A1A; font-size: 12px; font-weight: 500;
  cursor: pointer; transition: all 0.2s; white-space: nowrap;
}
.poi-detail-btn:hover { background: rgba(139, 69, 19, 0.16); }
.poi-detail-btn-end { background: linear-gradient(135deg, #8B4513, #A0522D); color: #FFF8DC; border: none; }
.poi-detail-btn-end:hover { transform: translateY(-1px); box-shadow: 0 3px 10px rgba(139, 69, 19, 0.3); }
.poi-detail-food-btn { background: linear-gradient(135deg, #E85D3A, #FF6B4A); color: #fff; border: none; }
.poi-detail-food-btn:hover { transform: translateY(-1px); box-shadow: 0 3px 10px rgba(232, 93, 58, 0.3); }

.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(93, 58, 26, 0.5); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; z-index: 9999;
  animation: fadeIn 0.2s ease;
}

.booking-modal-overlay {
  z-index: 15000;
  padding: 28px 16px;
  align-items: flex-start;
}

.booking-modal-overlay .modal-card {
  width: min(700px, calc(100vw - 32px));
  max-height: calc(100dvh - 56px);
  overflow-y: auto;
}

.pose-modal-overlay {
  z-index: 12000;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(6px);
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.modal-card {
  width: 420px; max-width: 90vw;
  background: rgba(245, 230, 200, 0.98);
  border: 1px solid #D4A574;
  border-radius: 14px; padding: 24px;
  box-shadow: 0 16px 48px rgba(139, 69, 19, 0.3);
  animation: slideUp 0.25s ease;
  color: #5D3A1A;
}

.journey-setup-card {
  max-height: 60vh; display: flex; flex-direction: column;
}
.journey-setup-body {
  overflow-y: auto; flex: 1; min-height: 0;
}
@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

.modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.modal-header h3 { font-size: 17px; color: #5D3A1A; margin: 0; letter-spacing: 1px; }
.close-btn {
  width: 28px; height: 28px; border: none; border-radius: 50%;
  background: rgba(139, 69, 19, 0.08); color: #8B4513;
  cursor: pointer; font-size: 14px;
  display: flex; align-items: center; justify-content: center; transition: all 0.2s;
}
.close-btn:hover { background: rgba(139, 69, 19, 0.2); }

.modal-body { display: flex; flex-direction: column; gap: 14px; }

.setup-hint {
  font-size: 13px;
  color: rgba(93, 58, 26, 0.6);
  margin: 0 0 8px 0;
  line-height: 1.5;
}

.setup-spot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: rgba(139, 69, 19, 0.04);
  border: 1px solid rgba(139, 69, 19, 0.12);
  border-radius: 8px;
}
.setup-spot-name {
  font-size: 14px;
  font-weight: 600;
  color: #5D3A1A;
}
.setup-duration {
  display: flex;
  align-items: center;
  gap: 10px;
}
.dur-btn {
  width: 28px; height: 28px;
  border: 1px solid rgba(139, 69, 19, 0.3);
  border-radius: 6px;
  background: rgba(139, 69, 19, 0.06);
  color: #8B4513;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.dur-btn:hover { background: rgba(139, 69, 19, 0.15); }
.dur-value {
  font-size: 15px;
  font-weight: 600;
  color: #5D3A1A;
  min-width: 36px;
  text-align: center;
}

.selected-service {
  display: flex; align-items: center; gap: 10px; padding: 12px;
  background: rgba(139, 69, 19, 0.06); border-radius: 8px;
  margin-bottom: 4px; font-size: 14px; color: #5D3A1A;
}
.service-icon-lg { font-size: 22px; }

.form-group { display: flex; flex-direction: column; gap: 8px; margin-bottom: 4px; }
.form-group label { font-size: 13px; color: rgba(93, 58, 26, 0.6); font-weight: 500; }

.date-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.date-chip {
  padding: 8px 12px; border: 1px solid rgba(139, 69, 19, 0.2); border-radius: 8px;
  background: rgba(139, 69, 19, 0.04); color: rgba(93, 58, 26, 0.7);
  font-size: 12px; cursor: pointer; transition: all 0.2s;
}
.date-chip:hover { border-color: rgba(139, 69, 19, 0.4); background: rgba(139, 69, 19, 0.08); }
.date-chip.active {
  border-color: #8B4513; background: rgba(139, 69, 19, 0.12);
  color: #8B4513; font-weight: 600;
}

.slot-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.slot-btn {
  padding: 14px 10px; border: 1px solid rgba(139, 69, 19, 0.15); border-radius: 8px;
  background: rgba(139, 69, 19, 0.04); cursor: pointer;
  transition: all 0.2s; display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.slot-btn.available:hover { border-color: rgba(139, 69, 19, 0.4); background: rgba(139, 69, 19, 0.08); }
.slot-btn.available.selected {
  border-color: #8B4513; background: rgba(139, 69, 19, 0.12);
  box-shadow: 0 0 12px rgba(139, 69, 19, 0.15);
}
.slot-btn.booked {
  border-color: transparent; background: rgba(139, 69, 19, 0.02);
  cursor: not-allowed; opacity: 0.45;
}
.slot-label { font-size: 13px; color: #5D3A1A; font-weight: 500; }
.slot-status { font-size: 10px; color: rgba(93, 58, 26, 0.35); }
.slot-btn.available .slot-status { color: #8B4513; }
.slot-btn.booked .slot-status { color: #A0522D; }
.slot-btn.selected .slot-status { color: #8B4513; font-weight: 600; }

.slots-loading {
  text-align: center; padding: 20px;
  color: rgba(93, 58, 26, 0.4); font-size: 13px;
}

.error-msg {
  padding: 10px 14px; background: rgba(139, 69, 19, 0.08);
  border: 1px solid rgba(139, 69, 19, 0.25); border-radius: 8px;
  color: #8B4513; font-size: 12px; text-align: center; margin-bottom: 4px;
}

.submit-book-btn {
  width: 100%; padding: 13px;
  background: linear-gradient(135deg, #8B4513, #A0522D);
  border: none; border-radius: 8px; color: #FFF8DC;
  font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s; letter-spacing: 1px;
}
.submit-book-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(139, 69, 19, 0.35); }
.submit-book-btn:disabled { opacity: 0.55; cursor: not-allowed; }

.conflict-modal-card {
  width: 360px; max-width: 90vw; text-align: center;
  background: rgba(245, 230, 200, 0.98);
  border: 1px solid #D4A574;
  border-radius: 14px; padding: 28px 24px;
  box-shadow: 0 16px 48px rgba(139, 69, 19, 0.3);
  animation: shake 0.4s ease;
  color: #5D3A1A;
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-8px); }
  40%, 80% { transform: translateX(8px); }
}
.conflict-icon { font-size: 36px; margin-bottom: 12px; }
.conflict-modal-card h3 { font-size: 17px; color: #8B4513; margin: 0 0 10px 0; }
.conflict-modal-card p { font-size: 13px; color: rgba(93, 58, 26, 0.7); line-height: 1.6; margin: 0 0 18px 0; }
.conflict-ok-btn {
  padding: 10px 32px; background: linear-gradient(135deg, #8B4513, #A0522D);
  border: none; border-radius: 8px; color: #FFF8DC;
  font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.conflict-ok-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(139, 69, 19, 0.4); }

.booking-alert-card {
  width: 400px; max-width: 90vw; text-align: center;
  background: rgba(255, 248, 220, 0.98);
  border: 2px solid #D4A574;
  border-radius: 14px; padding: 28px 24px;
  box-shadow: 0 16px 48px rgba(139, 69, 19, 0.3);
  animation: slideUp 0.25s ease;
  color: #5D3A1A;
  position: relative;
}
.booking-alert-close {
  position: absolute; top: 10px; right: 10px;
  width: 26px; height: 26px; border: none; border-radius: 50%;
  background: rgba(139, 69, 19, 0.08); color: #8B4513;
  cursor: pointer; font-size: 13px;
  display: flex; align-items: center; justify-content: center; transition: all 0.2s;
}
.booking-alert-close:hover { background: rgba(139, 69, 19, 0.2); }
.booking-alert-icon { font-size: 36px; margin-bottom: 12px; }
.booking-alert-card h3 { font-size: 17px; color: #8B4513; margin: 0 0 10px 0; }
.booking-alert-card p { font-size: 13px; color: rgba(93, 58, 26, 0.7); line-height: 1.6; margin: 0 0 18px 0; }

.waypoint-section {
  margin-top: 12px; padding: 12px;
  background: rgba(139, 69, 19, 0.04);
  border: 1px solid rgba(139, 69, 19, 0.2);
  border-radius: 8px;
}
.waypoint-title {
  font-size: 13px; font-weight: 600; color: #8B4513; margin-bottom: 8px;
}
.waypoint-btns {
  display: flex; gap: 8px; margin-bottom: 8px;
}
.wp-btn {
  flex: 1; padding: 8px 6px;
  background: rgba(139, 69, 19, 0.06);
  border: 1px solid rgba(139, 69, 19, 0.25);
  border-radius: 6px; color: #8B4513;
  font-size: 12px; cursor: pointer; transition: all 0.2s;
}
.wp-btn:hover { background: rgba(139, 69, 19, 0.12); border-color: rgba(139, 69, 19, 0.4); }
.waypoint-hint {
  font-size: 12px; color: rgba(93, 58, 26, 0.6);
  padding: 8px; background: rgba(139, 69, 19, 0.06);
  border-radius: 6px; display: flex; align-items: center; justify-content: space-between;
}
.wp-cancel {
  padding: 3px 10px; border: 1px solid rgba(139, 69, 19, 0.2);
  border-radius: 4px; background: transparent; color: rgba(93, 58, 26, 0.5);
  font-size: 11px; cursor: pointer;
}
.wp-cancel:hover { border-color: rgba(139, 69, 19, 0.4); color: rgba(93, 58, 26, 0.8); }
.waypoint-list { margin-top: 8px; }
.waypoint-item {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px;
  background: rgba(139, 69, 19, 0.03); border-radius: 4px; margin-bottom: 4px;
}
.wp-label {
  font-size: 11px; color: #8B4513; font-weight: 600; white-space: nowrap;
}
.wp-name {
  flex: 1; font-size: 12px; color: rgba(93, 58, 26, 0.7);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.wp-del {
  width: 20px; height: 20px; border: none; border-radius: 50%;
  background: rgba(139, 69, 19, 0.06); color: #8B4513;
  font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.wp-del:hover { background: rgba(139, 69, 19, 0.15); }
.replan-btn {
  width: 100%; padding: 8px; margin-top: 6px;
  background: rgba(139, 69, 19, 0.08);
  border: 1px solid rgba(139, 69, 19, 0.3);
  border-radius: 6px; color: #8B4513;
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.replan-btn:hover { background: rgba(139, 69, 19, 0.15); }

.poi-search-input {
  flex: 1; padding: 10px 12px;
  background: rgba(139, 69, 19, 0.06); border: 1px solid rgba(139, 69, 19, 0.2);
  border-radius: 8px; color: #5D3A1A; font-size: 14px; outline: none;
}
.poi-search-input::placeholder { color: rgba(93, 58, 26, 0.3); }
.poi-search-input:focus { border-color: rgba(139, 69, 19, 0.5); }
.search-poi-btn {
  padding: 10px 16px;
  background: linear-gradient(135deg, #8B4513, #A0522D);
  border: none; border-radius: 8px; color: #FFF8DC;
  font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.search-poi-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(139, 69, 19, 0.3); }
.search-poi-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.poi-search-results { margin-top: 12px; max-height: 240px; overflow-y: auto; }
.poi-search-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; margin-bottom: 4px;
  background: rgba(139, 69, 19, 0.04); border: 1px solid rgba(139, 69, 19, 0.12);
  border-radius: 8px; cursor: pointer; transition: all 0.2s;
}
.poi-search-item:hover { background: rgba(139, 69, 19, 0.1); border-color: rgba(139, 69, 19, 0.3); }
.poi-search-name { font-size: 14px; color: #5D3A1A; }
.poi-search-hot { font-size: 11px; color: rgba(93, 58, 26, 0.4); }
.poi-search-empty { text-align: center; padding: 20px; color: rgba(93, 58, 26, 0.4); font-size: 13px; }

/* === 统一搜索栏样式 === */
.search-bar-container {
  position: relative;
  margin: 0 0 12px 0;
  z-index: 1001;
}
.search-bar {
  display: flex;
  align-items: center;
  background: rgba(139, 69, 19, 0.06);
  border: 1px solid rgba(139, 69, 19, 0.18);
  border-radius: 10px;
  padding: 0 4px 0 12px;
  transition: all 0.2s;
}
.search-bar-focus {
  border-color: rgba(139, 69, 19, 0.5);
  background: rgba(139, 69, 19, 0.08);
  box-shadow: 0 2px 8px rgba(139, 69, 19, 0.12);
}
.search-icon {
  font-size: 14px;
  margin-right: 6px;
  opacity: 0.5;
}
.search-input {
  flex: 1;
  padding: 10px 4px;
  background: transparent;
  border: none;
  outline: none;
  color: #5D3A1A;
  font-size: 14px;
}
.search-input::placeholder {
  color: rgba(93, 58, 26, 0.3);
}
.search-clear {
  cursor: pointer;
  padding: 4px 8px;
  font-size: 12px;
  color: rgba(93, 58, 26, 0.35);
  transition: color 0.2s;
}
.search-clear:hover {
  color: rgba(93, 58, 26, 0.7);
}
.search-loading-spin {
  padding: 4px 8px;
  font-size: 14px;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.search-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 400px;
  overflow-y: auto;
  background: #FFFDF5;
  border: 1px solid rgba(139, 69, 19, 0.15);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(93, 58, 26, 0.15);
}
.search-group {
  padding: 6px 0;
}
.search-group + .search-group {
  border-top: 1px solid rgba(139, 69, 19, 0.08);
}
.search-group-title {
  font-size: 11px;
  font-weight: 700;
  color: rgba(93, 58, 26, 0.4);
  padding: 6px 14px 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.search-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  cursor: pointer;
  transition: background 0.15s;
}
.search-item:hover {
  background: rgba(139, 69, 19, 0.06);
}
.search-item-name {
  font-size: 13px;
  color: #5D3A1A;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.search-item-tag {
  font-size: 10px;
  padding: 1px 6px;
  background: rgba(139, 69, 19, 0.08);
  border-radius: 4px;
  color: rgba(93, 58, 26, 0.55);
  white-space: nowrap;
}
.search-item-cuisine {
  font-size: 11px;
  color: rgba(93, 58, 26, 0.5);
  white-space: nowrap;
}
.search-item-addr {
  font-size: 11px;
  color: rgba(93, 58, 26, 0.35);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.search-item-hot {
  margin-left: auto;
  font-size: 10px;
  color: rgba(93, 58, 26, 0.35);
  white-space: nowrap;
}
.search-empty {
  padding: 14px;
  text-align: center;
  font-size: 12px;
  color: rgba(93, 58, 26, 0.35);
  background: #FFFDF5;
  border: 1px solid rgba(139, 69, 19, 0.15);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(93, 58, 26, 0.15);
}

/* === 天气 - 全局浮动组件 === */
.weather-badge {
  cursor: pointer;
  margin-left: auto;
  font-size: 11px;
  color: #8B4513;
  background: rgba(255,255,255,0.5);
  border: 1px solid rgba(139, 69, 19, 0.2);
  border-radius: 10px;
  padding: 1px 8px;
  white-space: nowrap;
  transition: all 0.2s;
}
.weather-badge:hover {
  background: rgba(255,255,255,0.8);
  border-color: rgba(139, 69, 19, 0.4);
}

/* 天气详情弹窗（固定定位） */
.weather-popup-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0,0,0,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
}
.weather-popup-card {
  background: #FFFDF5;
  border: 1px solid #D4A574;
  border-radius: 14px;
  width: 340px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 12px 40px rgba(93, 58, 26, 0.25);
  position: relative;
  animation: rainAlertIn 0.25s ease-out;
}
.weather-popup-close {
  position: absolute; top: 10px; right: 12px;
  font-size: 14px; color: #8B4513; cursor: pointer;
  border: none; background: none; padding: 2px 6px; border-radius: 4px;
}
.weather-popup-close:hover { background: rgba(139, 69, 19, 0.1); }
.weather-popup-header {
  display: flex; align-items: center; gap: 8px;
  padding: 18px 20px 12px; border-bottom: 1px solid rgba(139, 69, 19, 0.1);
}
.weather-popup-emoji { font-size: 32px; }
.weather-popup-temp { font-size: 24px; font-weight: 700; color: #5D3A1A; }
.weather-popup-desc { font-size: 13px; color: #8B4513; margin-left: auto; }
.weather-popup-body { padding: 14px 20px; }
.weather-popup-row {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 0; font-size: 12px; color: #5D3A1A;
}
.weather-popup-alert {
  margin: 10px 0; padding: 10px 14px;
  border-radius: 8px; font-size: 13px; font-weight: 500;
  background: rgba(212, 83, 58, 0.08); color: #C0392B;
  border: 1px solid rgba(212, 83, 58, 0.15);
}
.weather-popup-safe {
  background: rgba(39, 174, 96, 0.08); color: #27AE60;
  border-color: rgba(39, 174, 96, 0.15);
}
.weather-popup-forecast-title {
  font-size: 12px; font-weight: 600; color: #8B4513;
  margin: 12px 0 6px; padding-top: 10px;
  border-top: 1px solid rgba(139, 69, 19, 0.1);
}
.weather-popup-hourly { display: flex; flex-direction: column; gap: 2px; }
.weather-popup-hourly-item {
  display: flex; align-items: center; gap: 6px;
  padding: 3px 6px; border-radius: 4px; font-size: 11px; color: #5D3A1A;
}
.weather-popup-hourly-item:hover { background: rgba(139, 69, 19, 0.04); }
.wp-time { width: 40px; color: #8B4513; font-weight: 500; }
.wp-emoji { font-size: 13px; }
.wp-temp { width: 28px; font-weight: 500; }
.wp-rain { color: #D4533A; font-size: 10px; font-weight: 500; }

/* 天气弹窗 - 右侧滑入 */
.weather-popup-right {
  position: fixed;
  top: 60px;
  right: 20px;
  z-index: 10000;
  background: #FFFDF5;
  border: 1px solid #D4A574;
  border-radius: 14px;
  width: 320px;
  max-height: 70vh;
  overflow-y: auto;
  box-shadow: -8px 8px 32px rgba(93, 58, 26, 0.2);
}
.weather-slide-enter-active { transition: all 0.3s ease-out; }
.weather-slide-leave-active { transition: all 0.25s ease-in; }
.weather-slide-enter-from {
  opacity: 0; transform: translateX(40px);
}
.weather-slide-leave-to {
  opacity: 0; transform: translateX(40px);
}

/* 降雨提醒弹窗 */
.rain-alert-overlay {
  position: fixed;
  inset: 0;
  z-index: 11000;
  background: rgba(0,0,0,0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 降雨提醒弹窗 */
.rain-alert-overlay {
  position: fixed;
  inset: 0;
  z-index: 11000;
  background: rgba(0,0,0,0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}
.rain-alert-card {
  background: #FFFDF5;
  border: 1px solid #C4A882;
  border-radius: 16px;
  padding: 30px 36px;
  text-align: center;
  max-width: 340px;
  box-shadow: 0 12px 40px rgba(93, 58, 26, 0.25);
  animation: rainAlertIn 0.3s ease-out;
}
@keyframes rainAlertIn {
  from { transform: scale(0.85); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
@keyframes foodPulse {
  0% { transform: scale(1); box-shadow: 0 0 0 4px rgba(232, 93, 58, 0.35), 0 4px 12px rgba(232, 93, 58, 0.5); }
  50% { transform: scale(1.15); box-shadow: 0 0 0 8px rgba(232, 93, 58, 0.15), 0 4px 16px rgba(232, 93, 58, 0.6); }
  100% { transform: scale(1); box-shadow: 0 0 0 4px rgba(232, 93, 58, 0.35), 0 4px 12px rgba(232, 93, 58, 0.5); }
}
.rain-alert-icon { font-size: 56px; margin-bottom: 12px; }
.rain-alert-title {
  font-size: 18px; font-weight: 600; color: #5D3A1A;
  margin-bottom: 8px;
}
.rain-alert-desc {
  font-size: 14px; color: rgba(93, 58, 26, 0.7);
  line-height: 1.6; margin-bottom: 20px;
}
.rain-alert-btn {
  padding: 10px 32px;
  background: linear-gradient(135deg, #8B4513, #A0522D);
  color: #FFFDF5;
  border: none; border-radius: 10px;
  font-size: 14px; font-weight: 500;
  cursor: pointer; transition: all 0.2s;
}
.rain-alert-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(139, 69, 19, 0.3);
}

/* === Reference desktop shell refresh === */
.navigation-container {
  --bg-page: #f7f2eb;
  --bg-card: #ffffff;
  --bg-overlay: rgba(255, 252, 247, 0.94);
  --text: #2b1f14;
  --text-secondary: #765f47;
  --text-muted: #9d876e;
  --accent: #c07858;
  --accent-dark: #965a41;
  --accent-light: rgba(192, 120, 88, 0.12);
  --gold: #d4a574;
  --green: #4d9666;
  --blue: #2f6f9f;
  --border: #d6c8b8;
  --border-light: #eadfd3;
  --shadow-sm: 0 1px 3px rgba(43, 31, 20, 0.08);
  --shadow-md: 0 6px 18px rgba(43, 31, 20, 0.10);
  --shadow-lg: 0 12px 36px rgba(43, 31, 20, 0.14);
  --topbar-h: 54px;
  --panel-w: 400px;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-page);
  color: var(--text);
  font-family: Inter, "宋体", SimSun, serif;
  -webkit-font-smoothing: antialiased;
}

.navigation-container button,
.navigation-container input,
.navigation-container select,
.navigation-container textarea {
  font-family: inherit;
}

.topbar {
  position: fixed;
  inset: 0 0 auto 0;
  height: var(--topbar-h);
  z-index: 500;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 20px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-light);
  box-shadow: 0 1px 0 rgba(43, 31, 20, 0.02);
}

.topbar-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  white-space: nowrap;
}

.brand-mark {
  font-size: 18px;
}

.brand-name {
  font-family: "宋体", SimSun, serif;
  font-size: 16px;
  font-weight: 800;
}

.topbar-brand small {
  color: var(--text-muted);
  font-size: 10px;
  letter-spacing: 2px;
}

.topbar-search {
  flex: 1;
  max-width: 480px;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-page);
  color: var(--text-muted);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.topbar-search:hover {
  border-color: var(--gold);
  background: #fbf7f1;
}

.sb-icon {
  font-size: 14px;
}

.sb-placeholder {
  flex: 1;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.sb-hint {
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--border-light);
  background: #fff;
  font-size: 10px;
  color: var(--text-muted);
}

.topbar-nav {
  display: flex;
  align-items: center;
  gap: 22px;
  margin-left: auto;
}

.tbn {
  position: relative;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.tbn:hover {
  background: var(--bg-page);
  color: var(--text);
}

.tbn.active {
  background: var(--accent-light);
  color: var(--accent-dark);
}

.topbar-notification-dot {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 8px;
  height: 8px;
  border: 2px solid #fffdf9;
  border-radius: 50%;
  background: #d93025;
  box-shadow: 0 0 0 2px rgba(217, 48, 37, 0.16);
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.tbr-btn,
.tbr-logout {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 7px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.tbr-btn:hover,
.tbr-logout:hover {
  border-color: var(--gold);
  color: var(--accent-dark);
  background: #fffaf4;
}

.tbr-user {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 3px 8px 3px 3px;
  border: 1px solid var(--border-light);
  border-radius: 999px;
  background: #fff;
}

.tbr-avatar {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #ead2ae;
  color: var(--text);
  font-size: 13px;
  font-weight: 800;
}

.tbr-name {
  max-width: 88px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.tbr-logout {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
}

.app-body {
  position: relative;
  height: calc(100vh - var(--topbar-h));
  margin-top: var(--topbar-h);
  overflow: hidden;
}

.map-area {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background: #e5d7c6;
}

.navigation-container :deep(.maplibregl-ctrl-top-right) {
  top: 14px;
  right: 64px;
}

.map-location {
  position: absolute;
  top: 18px;
  left: 20px;
  z-index: 45;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(440px, calc(100vw - 40px));
  padding: 8px 14px;
  border: 1px solid rgba(234, 223, 211, 0.78);
  border-radius: 9px;
  background: var(--bg-overlay);
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(12px);
  transition: left 0.25s ease;
}

.map-location.panel-offset {
  left: calc(var(--panel-w) + 20px);
}

.loc-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--green);
  animation: locPulse 2s infinite;
}

@keyframes locPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.42; }
}

.loc-copy {
  min-width: 0;
}

.loc-main {
  overflow: hidden;
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loc-sub {
  margin-top: 1px;
  color: var(--text-muted);
  font-size: 10px;
}

.loc-weather {
  padding-left: 10px;
  border: 0;
  border-left: 1px solid var(--border-light);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.map-tools {
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 45;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.map-tool {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 7px;
  background: var(--bg-overlay);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  backdrop-filter: blur(12px);
}

.map-tool:hover {
  transform: scale(1.05);
  box-shadow: var(--shadow-md);
}

.route-bar {
  position: absolute;
  left: 50%;
  bottom: 80px;
  z-index: 44;
  display: flex;
  align-items: center;
  gap: 18px;
  max-width: calc(100vw - 40px);
  padding: 9px 20px;
  border: 1px solid rgba(234, 223, 211, 0.82);
  border-radius: 10px;
  background: var(--bg-overlay);
  box-shadow: var(--shadow-lg);
  transform: translateX(-50%);
  transition: transform 0.25s ease;
  backdrop-filter: blur(12px);
}

.route-bar.panel-offset {
  transform: translateX(calc(-50% + 200px));
}

.rs-item {
  min-width: 56px;
  text-align: center;
}

.rs-n {
  max-width: 160px;
  overflow: hidden;
  color: var(--text);
  font-size: 16px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rs-n small {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
}

.rs-l {
  margin-top: 1px;
  color: var(--text-muted);
  font-size: 10px;
}

.rs-d {
  width: 1px;
  height: 22px;
  background: var(--border-light);
}

.route-end {
  min-width: 110px;
}

.route-end .rs-n {
  font-size: 13px;
}

.map-bottom {
  position: absolute;
  left: 50%;
  bottom: 22px;
  z-index: 44;
  display: flex;
  align-items: center;
  gap: 3px;
  max-width: calc(100vw - 40px);
  overflow-x: auto;
  padding: 5px;
  border: 1px solid rgba(234, 223, 211, 0.78);
  border-radius: 11px;
  background: var(--bg-overlay);
  box-shadow: var(--shadow-lg);
  transform: translateX(-50%);
  transition: transform 0.25s ease;
  backdrop-filter: blur(12px);
}

.map-bottom.panel-offset {
  transform: translateX(calc(-50% + 200px));
  max-width: calc(100vw - var(--panel-w) - 56px);
}

.mapb-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 7px 12px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.mapb-btn:hover {
  background: var(--bg-card);
  color: var(--text);
}

.mapb-btn.active {
  background: var(--accent);
  color: #fff;
}

.mapb-d {
  width: 1px;
  align-self: stretch;
  margin: 4px 0;
  background: var(--border-light);
}

.jf-fab {
  position: absolute;
  right: 20px;
  bottom: 88px;
  z-index: 46;
  width: 46px;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  box-shadow: var(--shadow-lg);
  cursor: pointer;
  transition: transform 0.2s, background 0.2s;
}

.jf-fab:hover {
  transform: scale(1.08);
  background: var(--accent-dark);
}

.panel-backdrop {
  position: absolute;
  inset: 0;
  z-index: 58;
  display: none;
  background: rgba(43, 31, 20, 0.22);
}

.sidebar {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 70;
  width: var(--panel-w);
  max-width: min(var(--panel-w), 100vw);
  max-height: none;
  height: 100%;
  padding: 0 16px 16px;
  overflow-y: auto;
  border: 0;
  border-right: 1px solid var(--border-light);
  border-radius: 0;
  background: var(--bg-card);
  box-shadow: 4px 0 24px rgba(43, 31, 20, 0.08);
  color: var(--text);
  transform: translateX(-104%);
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  backdrop-filter: none;
}

.sidebar.open {
  transform: translateX(0);
}

.sidebar::-webkit-scrollbar {
  width: 4px;
}

.sidebar::-webkit-scrollbar-thumb {
  border-radius: 4px;
  background: var(--border);
}

.panel-hd {
  position: sticky;
  top: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 -16px 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-card);
}

.panel-hd h2,
.sidebar h2 {
  margin: 0;
  color: var(--text);
  font-family: "宋体", SimSun, serif;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0;
}

.ph-close {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.ph-close:hover {
  background: var(--bg-page);
  color: var(--text);
}

.sidebar .user-bar {
  display: none;
}

.sidebar > h2 {
  margin: 0 0 12px;
  font-size: 14px;
}

.search-bar-container {
  z-index: 20;
  margin-bottom: 12px;
}

.search-bar {
  height: 38px;
  padding: 0 10px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-page);
}

.search-bar-focus {
  border-color: var(--gold);
  background: #fbf7f1;
  box-shadow: none;
}

.search-input {
  color: var(--text);
  font-size: 13px;
}

.search-input::placeholder {
  color: var(--text-muted);
}

.search-dropdown,
.search-empty {
  border-color: var(--border-light);
  border-radius: 8px;
  background: #fff;
  box-shadow: var(--shadow-md);
}

.transport-mode-selector,
.style-panel,
.smart-itinerary-panel,
.waypoint-section,
.my-services-panel,
.my-bookings-panel,
.status-panel {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: #fffaf4;
}

.transport-label,
.poi-list-title,
.service-list-title,
.food-list-title,
.my-services-title,
.waypoint-title {
  color: var(--text-secondary);
  letter-spacing: 0;
}

.transport-options {
  gap: 6px;
}

.transport-btn {
  border: 1px solid var(--border);
  border-radius: 7px;
  background: #fff;
  color: var(--text-secondary);
}

.transport-btn.active {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
  box-shadow: none;
}

.transport-btn.active .transport-speed {
  color: rgba(255, 255, 255, 0.72);
}

.travel-times-panel {
  border-top-color: var(--border-light);
}

.time-row {
  color: var(--text-secondary);
}

.time-row.active {
  background: var(--accent-light);
  color: var(--accent-dark);
}

.location-info {
  border-color: var(--border-light);
  border-radius: 8px;
  background: #fffaf4;
}

.location-info .label {
  background: var(--accent-light);
  color: var(--accent-dark);
}

.btn-group {
  flex-wrap: wrap;
  gap: 6px;
}

.btn-group button {
  flex: 1 1 calc(50% - 6px);
  min-width: 120px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: #fff !important;
  color: var(--text-secondary);
  box-shadow: none;
}

.btn-group button:hover {
  border-color: var(--gold);
  background: #fffaf4 !important;
  color: var(--accent-dark);
  transform: none;
  box-shadow: none;
}

.btn-group .style-btn {
  border-color: rgba(192, 120, 88, 0.45);
  color: var(--accent-dark);
}

.btn-group .personal-btn {
  border-color: rgba(47, 111, 159, 0.35);
  color: var(--blue);
}

.btn-group .food-btn {
  border-color: rgba(192, 120, 88, 0.38);
  color: #b85d46;
}

.btn-group .service-btn {
  border-color: rgba(77, 150, 102, 0.38);
  color: #3f7b55;
}

.style-tag,
.food-sort-btn,
.date-chip,
.wp-btn,
.replan-btn,
.style-route-btn,
.style-secondary-btn {
  border-radius: 7px;
}

.style-secondary-btn {
  width: 100%;
  margin-top: 6px;
  padding: 8px;
  border: 1px solid var(--border);
  background: #fff;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.style-secondary-btn:hover:not(:disabled) {
  border-color: var(--gold);
  color: var(--accent-dark);
  background: #fffaf4;
}

.style-secondary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.style-tag-active,
.style-go-btn,
.submit-book-btn,
.book-status.available,
.poi-detail-btn-end,
.replan-btn:hover,
.style-route-btn:hover {
  background: var(--accent) !important;
  color: #fff !important;
  border-color: var(--accent) !important;
  box-shadow: none;
}

.poi-item,
.food-item,
.service-item,
.booking-card,
.my-service-card,
.setup-spot,
.slot-btn,
.poi-search-item {
  border: 1px solid var(--border-light);
  border-left: 3px solid var(--accent);
  border-radius: 8px;
  background: #fff;
  color: var(--text);
  box-shadow: none;
}

.poi-item:hover,
.food-item:hover,
.service-item:hover,
.booking-card:hover,
.poi-search-item:hover {
  border-color: var(--gold);
  background: #fffaf4;
  transform: none;
}

.poi-name,
.food-name,
.service-name,
.booking-name,
.my-service-name,
.setup-spot-name {
  color: var(--text);
}

.poi-hotness,
.food-rating,
.service-hotness,
.countdown {
  color: var(--accent-dark);
}

.food-actions,
.service-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: wrap;
}

.food-set-end-btn,
.book-status,
.food-dp-link,
.smart-dp-link,
.cancel-booking-btn,
.my-service-cancel,
.poi-detail-btn {
  border-radius: 7px;
}

.book-status.set-end,
.food-set-end-btn,
.poi-detail-food-btn {
  background: rgba(77, 150, 102, 0.12) !important;
  border: 1px solid rgba(77, 150, 102, 0.35);
  color: #3f7b55;
}

.status-panel {
  color: var(--text-secondary);
  line-height: 1.55;
}

.nav-footer {
  border-top-color: var(--border-light);
}

.ai-diary-shortcut,
.diary-btn,
.campus-nav-btn {
  border-radius: 8px;
  box-shadow: none;
}

.diary-btn {
  background: var(--accent);
}

.campus-nav-btn {
  background: var(--blue);
}

.start-journey-btn {
  top: 18px;
  z-index: 48;
  border: 1px solid var(--gold);
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  letter-spacing: 1px;
  box-shadow: var(--shadow-lg);
}

.journey-sidebar,
.modal-card,
.campus-nav-modal,
.flowchart-modal,
.poi-detail-card,
.pose-modal-card,
.booking-alert-card,
.conflict-modal-card,
.weather-popup-right,
.rain-alert-card {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: #fffdf9;
  color: var(--text);
  box-shadow: var(--shadow-lg);
}

.modal-overlay,
.poi-detail-overlay {
  background: rgba(43, 31, 20, 0.34);
  backdrop-filter: blur(4px);
}

.modal-header h3,
.campus-nav-header h3,
.flowchart-header h3,
.journey-header h3,
.poi-detail-name,
.pose-modal-title {
  color: var(--text);
  letter-spacing: 0;
}

.close-btn,
.poi-detail-close,
.pose-modal-close,
.booking-alert-close {
  border-radius: 7px;
  background: var(--bg-page);
  color: var(--text-muted);
}

.weather-popup-right {
  top: calc(var(--topbar-h) + 14px);
  right: 18px;
}

@media (max-width: 1180px) {
  .topbar-search {
    max-width: 360px;
  }

  .tbn {
    padding-inline: 9px;
  }
}

@media (max-width: 980px) {
  .topbar {
    gap: 10px;
    padding: 0 12px;
  }

  .topbar-nav {
    display: none;
  }

  .topbar-search {
    max-width: none;
  }

  .map-location.panel-offset,
  .map-location {
    left: 12px;
    right: 58px;
    max-width: none;
  }

  .route-bar.panel-offset,
  .route-bar,
  .map-bottom.panel-offset,
  .map-bottom {
    transform: translateX(-50%);
    max-width: calc(100vw - 24px);
  }

  .panel-backdrop.show {
    display: block;
  }
}

@media (max-width: 720px) {
  .topbar-brand small,
  .sb-hint,
  .tbr-name,
  .tbr-logout {
    display: none;
  }

  .topbar-search {
    min-width: 0;
  }

  .sidebar {
    width: min(420px, 100vw);
  }

  .route-bar {
    left: 12px;
    right: 12px;
    bottom: 78px;
    justify-content: space-between;
    gap: 8px;
    transform: none;
  }

  .route-bar.panel-offset {
    transform: none;
  }

  .rs-d {
    display: none;
  }

  .route-end {
    display: none;
  }

  .map-bottom {
    left: 12px;
    right: 12px;
    transform: none;
  }

  .map-bottom.panel-offset {
    transform: none;
  }

  .jf-fab {
    right: 14px;
    bottom: 138px;
  }

  .btn-group button {
    min-width: 100%;
  }
}
.navigation-container {
  --sm-bg-page: #f7f2eb;
  --sm-bg-card: rgba(255, 255, 255, 0.96);
  --sm-bg-card-strong: #ffffff;
  --sm-bg-overlay: rgba(247, 242, 235, 0.92);
  --sm-text: #2b1f14;
  --sm-text-secondary: #6f5a45;
  --sm-text-muted: #9d8a74;
  --sm-accent: #c07858;
  --sm-accent-dark: #9a5f45;
  --sm-accent-soft: rgba(192, 120, 88, 0.12);
  --sm-gold: #d4a574;
  --sm-green: #5a9e6f;
  --sm-border: #dccfc0;
  --sm-border-light: #ede4da;
  --sm-shadow-sm: 0 8px 24px rgba(43, 31, 20, 0.08);
  --sm-shadow-md: 0 16px 40px rgba(43, 31, 20, 0.12);
  --sm-shadow-lg: 0 24px 60px rgba(43, 31, 20, 0.16);
  --sm-radius: 18px;
  background:
    radial-gradient(circle at 12% 12%, rgba(212, 165, 116, 0.16), transparent 28%),
    radial-gradient(circle at 88% 18%, rgba(192, 120, 88, 0.12), transparent 30%),
    linear-gradient(180deg, #fbf7f2 0%, #f7f2eb 100%);
  color: var(--sm-text);
}

.topbar {
  height: 64px;
  padding: 0 20px;
  background: rgba(255, 252, 247, 0.88);
  border-bottom: 1px solid rgba(220, 207, 192, 0.9);
  backdrop-filter: blur(18px);
  box-shadow: 0 10px 32px rgba(43, 31, 20, 0.06);
}

.topbar-brand {
  gap: 10px;
  padding: 0 8px;
  border-radius: 14px;
  color: var(--sm-text);
}

.topbar-brand:hover {
  background: rgba(192, 120, 88, 0.08);
}

.brand-mark {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(212, 165, 116, 0.28), rgba(192, 120, 88, 0.2));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.brand-name {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.topbar-brand small {
  color: var(--sm-text-muted);
  letter-spacing: 2px;
}

.topbar-search {
  height: 40px;
  border-radius: 14px;
  border: 1px solid var(--sm-border);
  background: rgba(247, 242, 235, 0.92);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.topbar-search:hover {
  border-color: var(--sm-gold);
  background: rgba(250, 246, 241, 0.98);
}

.sb-placeholder,
.sb-icon,
.sb-hint {
  color: var(--sm-text-muted);
}

.sb-hint {
  border-radius: 8px;
  border: 1px solid var(--sm-border-light);
  background: var(--sm-bg-card-strong);
}

.topbar-nav {
  gap: 22px;
}

.tbn {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 12px;
  color: var(--sm-text-secondary);
  font-weight: 600;
}

.tbn:hover {
  background: rgba(192, 120, 88, 0.08);
  color: var(--sm-text);
}

.tbn.active {
  background: var(--sm-accent-soft);
  color: var(--sm-accent);
  box-shadow: inset 0 0 0 1px rgba(192, 120, 88, 0.14);
}

.topbar-right {
  gap: 10px;
}

.tbr-btn,
.tbr-user {
  min-height: 38px;
  border-radius: 14px;
  border: 1px solid var(--sm-border);
  background: rgba(255, 255, 255, 0.68);
  color: var(--sm-text-secondary);
}

.tbr-btn:hover,
.tbr-user:hover {
  border-color: var(--sm-gold);
  color: var(--sm-accent);
}

.tbr-avatar {
  background: rgba(212, 165, 116, 0.24);
  color: var(--sm-accent-dark);
  overflow: hidden;
}

.tbr-avatar img,
.profile-avatar img,
.profile-avatar-preview img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.tbr-avatar span,
.profile-avatar span,
.profile-avatar-preview span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.tbr-logout {
  border-radius: 10px;
  background: transparent;
  color: var(--sm-text-muted);
}

.app-body {
  background: transparent;
}

.map-location,
.map-tools,
.route-bar,
.map-bottom,
.start-journey-btn {
  z-index: 20;
}

.map-location {
  top: 18px;
  left: 18px;
  padding: 12px 16px;
  gap: 12px;
  border: 1px solid rgba(220, 207, 192, 0.82);
  border-radius: 16px;
  background: var(--sm-bg-overlay);
  backdrop-filter: blur(18px);
  box-shadow: var(--sm-shadow-sm);
}

.map-location.panel-offset,
.route-bar.panel-offset,
.map-bottom.panel-offset {
  transform: translateX(210px);
}

.loc-dot {
  background: var(--sm-green);
  box-shadow: 0 0 0 6px rgba(90, 158, 111, 0.12);
}

.loc-main {
  font-weight: 700;
  color: var(--sm-text);
}

.loc-sub {
  color: var(--sm-text-muted);
}

.loc-weather {
  border-left: 1px solid var(--sm-border-light);
  color: var(--sm-text-secondary);
}

.map-tools {
  top: 20px;
  right: 20px;
  gap: 8px;
}

.map-tool {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  border: 1px solid rgba(220, 207, 192, 0.86);
  background: var(--sm-bg-overlay);
  color: var(--sm-text-secondary);
  box-shadow: var(--sm-shadow-sm);
}

.map-tool:hover {
  color: var(--sm-accent);
  border-color: var(--sm-gold);
  transform: translateY(-1px);
}

.route-bar {
  min-width: min(760px, calc(100vw - 520px));
  bottom: 88px;
  padding: 12px 22px;
  border-radius: 18px;
  border: 1px solid rgba(220, 207, 192, 0.86);
  background: var(--sm-bg-overlay);
  backdrop-filter: blur(18px);
  box-shadow: var(--sm-shadow-md);
}

.rs-item .rs-n {
  color: var(--sm-text);
  font-size: 18px;
}

.rs-item .rs-l,
.rs-item .rs-n small {
  color: var(--sm-text-muted);
}

.rs-d,
.mapb-d {
  background: var(--sm-border-light);
}

.map-bottom {
  bottom: 24px;
  padding: 7px;
  gap: 4px;
  border-radius: 18px;
  border: 1px solid rgba(220, 207, 192, 0.86);
  background: var(--sm-bg-overlay);
  backdrop-filter: blur(18px);
  box-shadow: var(--sm-shadow-md);
}

.mapb-btn {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 12px;
  color: var(--sm-text-secondary);
  font-weight: 600;
}

.mapb-btn:hover {
  background: rgba(255, 255, 255, 0.92);
  color: var(--sm-text);
}

.mapb-btn.active {
  background: var(--sm-accent);
  color: #fff;
  box-shadow: 0 8px 18px rgba(192, 120, 88, 0.26);
}

.jf-fab,
.start-journey-btn {
  background: linear-gradient(135deg, var(--sm-accent), var(--sm-accent-dark));
  box-shadow: 0 16px 28px rgba(192, 120, 88, 0.32);
}

.start-journey-btn:hover {
  transform: translateX(-50%) translateY(-2px);
}

.jf-fab:hover {
  transform: translateY(-2px);
}

.panel-backdrop.show {
  background: rgba(43, 31, 20, 0.18);
  backdrop-filter: blur(2px);
}

.sidebar {
  width: 430px;
  padding-bottom: 24px;
  background: rgba(255, 252, 248, 0.95);
  border-right: 1px solid rgba(220, 207, 192, 0.88);
  box-shadow: 10px 0 40px rgba(43, 31, 20, 0.12);
  backdrop-filter: blur(22px);
}

.panel-hd {
  padding: 18px 18px 14px;
  border-bottom: 1px solid var(--sm-border-light);
}

.panel-hd h2,
.sidebar > h2 {
  margin: 0;
  color: var(--sm-text);
  font-size: 16px;
  font-weight: 700;
}

.sidebar > h2 {
  margin: 8px 18px 0;
  padding: 12px 14px 0;
  color: var(--sm-text-secondary);
  font-size: 13px;
}

.ph-close {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  border: 1px solid transparent;
  color: var(--sm-text-muted);
}

.ph-close:hover {
  background: rgba(192, 120, 88, 0.08);
  border-color: rgba(192, 120, 88, 0.14);
  color: var(--sm-text);
}

.user-bar,
.search-bar-container,
.transport-mode-selector,
.location-info,
.btn-group,
.style-panel,
.poi-list,
.smart-itinerary-panel,
.waypoint-section,
.food-list,
.service-list,
.status-panel,
.my-services-panel,
.my-bookings-panel,
.nav-footer {
  margin: 12px 18px 0;
  border: 1px solid rgba(220, 207, 192, 0.82);
  border-radius: 18px;
  background: var(--sm-bg-card);
  box-shadow: var(--sm-shadow-sm);
}

.user-bar,
.location-info,
.status-panel {
  padding: 14px 16px;
}

.user-bar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-name {
  color: var(--sm-text);
  font-weight: 700;
}

.logout-btn,
.weather-badge {
  border-radius: 999px;
  background: rgba(247, 242, 235, 0.9);
  color: var(--sm-text-secondary);
}

.search-bar-container {
  padding: 14px;
  position: relative;
}

.search-bar {
  min-height: 44px;
  border-radius: 14px;
  border: 1px solid var(--sm-border);
  background: rgba(247, 242, 235, 0.9);
}

.search-bar.search-bar-focus {
  border-color: var(--sm-gold);
  box-shadow: 0 0 0 4px rgba(212, 165, 116, 0.12);
}

.search-input,
.poi-search-input,
.food-cuisine-select,
.edit-select,
.edit-name-input {
  color: var(--sm-text);
}

.search-input::placeholder,
.poi-search-input::placeholder {
  color: var(--sm-text-muted);
}

.search-dropdown,
.poi-search-results {
  border: 1px solid rgba(220, 207, 192, 0.92);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: var(--sm-shadow-md);
}

.search-group + .search-group {
  border-top: 1px solid var(--sm-border-light);
}

.search-group-title,
.poi-list-title,
.food-list-title,
.service-list-title,
.my-services-title,
.waypoint-title,
.smart-itinerary-title {
  color: var(--sm-text);
  font-weight: 700;
}

.search-item,
.poi-item,
.food-item,
.service-item,
.waypoint-item,
.booking-card,
.my-service-card {
  border-radius: 14px;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.search-item:hover,
.poi-item:hover,
.food-item:hover,
.service-item:hover,
.waypoint-item:hover,
.booking-card:hover,
.my-service-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(43, 31, 20, 0.08);
}

.transport-mode-selector {
  padding: 16px;
}

.transport-label,
.label,
.style-count-label {
  color: var(--sm-text-secondary);
  font-weight: 700;
}

.transport-options,
.btn-group {
  gap: 10px;
}

.transport-btn,
.btn-group button,
.style-tag,
.style-count-btn,
.style-go-btn,
.style-secondary-btn,
.style-route-btn,
.wp-btn,
.replan-btn,
.food-sort-btn,
.food-set-end-btn,
.book-status,
.cancel-booking-btn,
.ai-diary-shortcut,
.diary-btn,
.campus-nav-btn,
.poi-popup-btn,
.poi-detail-btn,
.search-poi-btn,
.submit-book-btn,
.date-chip,
.slot-btn,
.dur-btn,
.edit-add-btn,
.edit-save-btn,
.edit-cancel-btn,
.flowchart-btn,
.update-progress-btn,
.ai-diary-journey-btn,
.exit-journey-btn,
.rain-alert-btn,
.conflict-ok-btn,
.campus-item,
.journey-drag-handle {
  border-radius: 14px;
}

.transport-btn {
  border: 1px solid var(--sm-border);
  background: rgba(247, 242, 235, 0.78);
  color: var(--sm-text-secondary);
  box-shadow: none;
}

.transport-btn.active {
  background: linear-gradient(135deg, var(--sm-accent), var(--sm-accent-dark));
  color: #fff;
  border-color: transparent;
  box-shadow: 0 12px 24px rgba(192, 120, 88, 0.22);
}

.travel-times-panel,
.style-panel,
.poi-list,
.smart-itinerary-panel,
.waypoint-section,
.food-list,
.service-list,
.my-services-panel,
.my-bookings-panel {
  padding: 16px;
}

.time-row {
  border-radius: 12px;
  background: rgba(247, 242, 235, 0.74);
  color: var(--sm-text-secondary);
}

.time-row.active {
  background: var(--sm-accent-soft);
  color: var(--sm-accent);
}

.btn-group {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 14px;
  background: var(--sm-bg-card);
}

.btn-group button {
  min-height: 42px;
  border: 1px solid var(--sm-border);
  background: rgba(247, 242, 235, 0.84);
  color: var(--sm-text-secondary);
  font-weight: 700;
}

.btn-group button:hover,
.style-tag:hover,
.style-count-btn:hover,
.food-sort-btn:hover,
.date-chip:hover,
.campus-item:hover {
  border-color: var(--sm-gold);
  color: var(--sm-accent);
  background: rgba(255, 255, 255, 0.98);
}

.style-tag-active,
.food-sort-btn.active,
.date-chip.active,
.slot-btn.selected,
.edit-save-btn,
.submit-book-btn,
.style-go-btn,
.style-route-btn,
.book-status.available,
.book-status.set-end,
.ai-diary-shortcut,
.diary-btn,
.campus-nav-btn,
.poi-popup-btn-end,
.poi-detail-btn-end {
  background: linear-gradient(135deg, var(--sm-accent), var(--sm-accent-dark));
  color: #fff;
  border-color: transparent;
}

.style-secondary-btn,
.food-dp-link,
.smart-dp-link {
  border: 1px solid var(--sm-border);
  background: rgba(247, 242, 235, 0.84);
  color: var(--sm-text-secondary);
}

.poi-item,
.food-item,
.service-item,
.booking-card,
.my-service-card,
.waypoint-item,
.smart-timeline-row {
  border: 1px solid rgba(220, 207, 192, 0.78);
  background: rgba(255, 255, 255, 0.9);
}

.poi-name,
.food-name,
.service-name,
.my-service-name,
.booking-name {
  color: var(--sm-text);
  font-weight: 700;
}

.poi-hotness,
.food-rating,
.service-hotness,
.style-dist,
.food-dist,
.food-price,
.booking-time,
.my-service-time,
.countdown {
  color: var(--sm-accent);
}

.personal-pref-tag,
.poi-style-tag,
.food-style-tag,
.search-item-tag {
  background: var(--sm-accent-soft);
  color: var(--sm-accent);
}

.status-panel {
  color: var(--sm-text-secondary);
  line-height: 1.7;
}

.nav-footer {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  padding: 14px;
  position: sticky;
  bottom: 16px;
}

.ai-diary-shortcut:disabled {
  opacity: 0.55;
  background: rgba(247, 242, 235, 0.8);
  color: var(--sm-text-muted);
  border: 1px solid var(--sm-border);
}

.journey-sidebar,
.modal-card,
.flowchart-modal,
.campus-nav-modal,
.poi-detail-card,
.pose-modal-card,
.poi-popup,
.weather-popup-right,
.booking-alert-card,
.conflict-modal-card,
.rain-alert-card {
  border: 1px solid rgba(220, 207, 192, 0.9);
  background: rgba(255, 252, 248, 0.97);
  box-shadow: var(--sm-shadow-lg);
  backdrop-filter: blur(22px);
}

.journey-drag-handle {
  background: rgba(247, 242, 235, 0.9);
  color: var(--sm-text-muted);
}

.weather-popup-right {
  color: var(--sm-text);
}

.weather-popup-alert {
  border-radius: 14px;
  background: rgba(192, 120, 88, 0.08);
}

.weather-popup-alert.weather-popup-safe {
  background: rgba(90, 158, 111, 0.1);
  color: #456f52;
}

.campus-item {
  border: 1px solid var(--sm-border);
  background: rgba(247, 242, 235, 0.82);
}

.campus-item-arrow {
  color: var(--sm-text-muted);
}

.poi-popup,
.weather-popup-right {
  color: var(--sm-text-secondary);
}

.poi-popup-name,
.poi-detail-name,
.pose-modal-title,
.campus-nav-header h3,
.flowchart-header h3,
.modal-header h3,
.journey-header h3 {
  color: var(--sm-text);
}

.navigation-container :deep(.maplibregl-ctrl-group) {
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 10px 24px rgba(43, 31, 20, 0.12);
  border: 1px solid rgba(220, 207, 192, 0.9);
}

.navigation-container :deep(.maplibregl-ctrl-group button) {
  background: rgba(255, 252, 247, 0.94);
}

.navigation-container :deep(.maplibregl-ctrl-group button:hover) {
  background: rgba(247, 242, 235, 1);
}

.page-screen {
  position: absolute;
  inset: 0;
  z-index: 24;
  background: linear-gradient(180deg, rgba(251, 247, 242, 0.78), rgba(247, 242, 235, 0.92));
  backdrop-filter: blur(8px);
}

.app-page {
  position: absolute;
  inset: 78px 18px 18px;
  z-index: 25;
  overflow: auto;
  border: 1px solid rgba(220, 207, 192, 0.9);
  border-radius: 28px;
  background: rgba(255, 252, 248, 0.82);
  backdrop-filter: blur(24px);
  box-shadow: var(--sm-shadow-lg);
}

.page-inner {
  padding: 26px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.page-header,
.section-head,
.page-stat-grid,
.page-two-col,
.planner-grid,
.planner-inline,
.planner-actions,
.page-list-card,
.timeline-row,
.discover-card-top,
.discover-meta,
.discover-actions,
.page-header-actions,
.timeline-actions,
.profile-hero-card,
.profile-actions-grid,
.journey-stage-grid {
  display: flex;
}

.page-header,
.section-head,
.page-list-card,
.timeline-row,
.profile-hero-card {
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.page-header h1,
.section-head h2,
.profile-copy h2 {
  margin: 0;
  color: var(--sm-text);
}

.page-header h1 {
  font-size: 28px;
}

.page-header p,
.section-head p,
.page-list-main span,
.timeline-content span,
.discover-card p,
.profile-copy p,
.profile-weather span,
.page-stat-card small,
.journey-stage-card small,
.page-empty,
.page-tip,
.page-alert {
  margin: 4px 0 0;
  color: var(--sm-text-secondary);
}

.page-header-actions,
.section-actions,
.planner-actions,
.timeline-actions,
.page-list-actions,
.discover-actions {
  gap: 10px;
  flex-wrap: wrap;
}

.page-action-btn,
.page-chip-btn,
.mini-action,
.planner-tag,
.profile-action-card {
  border: 1px solid var(--sm-border);
  background: rgba(247, 242, 235, 0.84);
  color: var(--sm-text-secondary);
  border-radius: 14px;
  transition: all 0.18s ease;
}

.page-action-btn,
.page-chip-btn,
.mini-action {
  min-height: 40px;
  padding: 0 16px;
  font-weight: 600;
}

.page-action-btn:hover,
.page-chip-btn:hover,
.mini-action:hover,
.planner-tag:hover,
.profile-action-card:hover {
  border-color: var(--sm-gold);
  background: rgba(255, 255, 255, 0.98);
  color: var(--sm-accent);
  transform: translateY(-1px);
}

.page-action-btn.primary,
.page-chip-btn.strong,
.mini-action.strong,
.planner-tag.active {
  background: linear-gradient(135deg, var(--sm-accent), var(--sm-accent-dark));
  color: #fff;
  border-color: transparent;
  box-shadow: 0 14px 26px rgba(192, 120, 88, 0.22);
}

.mini-action.link {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}

.mini-action.danger {
  color: #c85650;
  border-color: rgba(200, 86, 80, 0.2);
  background: rgba(217, 83, 79, 0.05);
}

.page-stat-grid {
  gap: 14px;
  flex-wrap: wrap;
}

.page-stat-card,
.page-card,
.discover-card,
.journey-stage-card,
.profile-action-card {
  border: 1px solid rgba(220, 207, 192, 0.82);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: var(--sm-shadow-sm);
}

.page-stat-card {
  flex: 1 1 220px;
  min-width: 220px;
  padding: 18px;
  border-radius: 18px;
}

.stat-k {
  display: block;
  color: var(--sm-text-muted);
  font-size: 12px;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.page-stat-card strong,
.page-list-main strong,
.timeline-content strong,
.discover-card h3,
.journey-stage-card strong {
  color: var(--sm-text);
}

.page-stat-card strong {
  display: block;
  margin-top: 8px;
  font-size: 22px;
}

.page-card {
  border-radius: 22px;
  padding: 22px;
}

.planner-grid,
.page-two-col {
  gap: 16px;
  flex-wrap: wrap;
}

.planner-block,
.page-two-col > section {
  flex: 1 1 360px;
}

.planner-label {
  display: block;
  margin-bottom: 10px;
  color: var(--sm-text-secondary);
  font-weight: 700;
}

.planner-tags {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.planner-tags.compact .planner-tag,
.planner-tag.static {
  cursor: default;
}

.planner-tag {
  min-height: 38px;
  padding: 0 14px;
}

.planner-stepper {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px;
  border-radius: 14px;
  border: 1px solid var(--sm-border);
  background: rgba(247, 242, 235, 0.82);
}

.planner-stepper button {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 0;
  background: rgba(255, 255, 255, 0.9);
  color: var(--sm-text-secondary);
}

.planner-stepper strong {
  min-width: 68px;
  text-align: center;
}

.page-empty,
.page-tip,
.page-alert {
  padding: 16px 18px;
  border-radius: 16px;
  border: 1px dashed var(--sm-border);
  background: rgba(247, 242, 235, 0.82);
}

.page-alert {
  border-style: solid;
  background: rgba(192, 120, 88, 0.08);
}

.page-list,
.timeline-list {
  display: grid;
  gap: 12px;
}

.page-list-card,
.timeline-row {
  padding: 16px 18px;
  border-radius: 18px;
  border: 1px solid rgba(220, 207, 192, 0.78);
  background: rgba(255, 255, 255, 0.94);
}

.page-list-main,
.timeline-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.timeline-time {
  min-width: 116px;
  font-weight: 700;
  color: var(--sm-accent);
}

.discover-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
}

.discover-card {
  padding: 18px;
  border-radius: 20px;
}

.discover-card-top,
.discover-meta,
.discover-actions {
  justify-content: space-between;
  align-items: center;
}

.discover-card h3 {
  margin: 12px 0 8px;
}

.discover-badge,
.discover-score {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--sm-accent-soft);
  color: var(--sm-accent);
  font-size: 12px;
  font-weight: 700;
}

.profile-hero-card {
  padding: 24px;
  border-radius: 22px;
}

.app-page-profile {
  inset: var(--topbar-h) 0 0;
  border: 0;
  border-radius: 0;
  background: #f7f2eb;
  box-shadow: none;
  backdrop-filter: none;
}

.profile-page-inner {
  width: min(1280px, calc(100vw - 96px));
  margin: 0 auto;
  padding: 34px 0 72px;
  gap: 22px;
}

.profile-page-header {
  justify-content: flex-start;
}

.profile-page-header h1 {
  font-family: "宋体", SimSun, serif;
  font-size: 30px;
}

.profile-page-header p {
  color: #8a7259;
  font-size: 15px;
}

.profile-hero-card {
  min-height: 132px;
  justify-content: flex-start;
  gap: 26px;
  padding: 28px 34px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.94);
}

.profile-avatar {
  width: 84px;
  height: 84px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #efd4a8;
  border: 3px solid #ddb174;
  color: var(--sm-accent-dark);
  font-size: 34px;
  font-weight: 700;
  overflow: hidden;
}

.profile-copy {
  flex: 1;
}

.profile-copy h2 {
  font-size: 28px;
}

.profile-copy p {
  font-size: 15px;
}

.profile-weather {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.profile-menu-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
}

.profile-menu-card {
  min-height: 150px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  border: 1px solid rgba(220, 207, 192, 0.9);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.94);
  color: var(--sm-text);
  text-align: left;
  cursor: pointer;
  box-shadow: var(--sm-shadow-sm);
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.profile-menu-card:hover {
  border-color: var(--sm-gold);
  transform: translateY(-2px);
  box-shadow: 0 16px 32px rgba(43, 31, 20, 0.1);
}

.profile-menu-icon {
  font-size: 28px;
}

.profile-menu-card strong {
  font-size: 20px;
}

.profile-menu-card small,
.profile-menu-card em {
  color: #8a7259;
  font-size: 14px;
  font-style: normal;
}

.profile-menu-card em {
  width: fit-content;
  margin-top: 3px;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(192, 120, 88, 0.1);
  color: var(--sm-accent);
  font-weight: 800;
}

/* === 通知模块 === */
.notification-section {
  position: relative;
  margin-top: 16px;
  padding: 18px;
}

.notification-section-dot,
.notif-card-dot {
  position: absolute;
  border-radius: 50%;
  background: #d93025;
  box-shadow: 0 0 0 3px rgba(217, 48, 37, 0.14);
}

.notification-section-dot {
  top: 12px;
  left: 12px;
  width: 10px;
  height: 10px;
}

.notification-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.notification-header h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding-left: 4px;
  color: var(--sm-text);
  font-size: 17px;
}

.notification-header h3 em {
  padding: 2px 9px;
  border-radius: 999px;
  background: rgba(217, 48, 37, 0.08);
  color: #c0392b;
  font-size: 12px;
  font-style: normal;
  font-weight: 900;
}

.notification-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.notif-read-all,
.notif-refresh-btn {
  min-height: 30px;
  border: 1px solid rgba(192, 120, 88, 0.24);
  border-radius: 999px;
  background: #fffaf4;
  color: #8B4513;
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
  padding: 0 10px;
}

.notif-read-all:hover,
.notif-refresh-btn:hover {
  border-color: rgba(192, 120, 88, 0.46);
  background: #fff;
}

.notif-empty {
  text-align: center;
  color: #9b8975;
  padding: 26px 0;
  font-size: 13px;
}

.notif-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 430px;
  overflow-y: auto;
  padding-right: 4px;
}

.notif-item {
  position: relative;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 76px;
  padding: 12px 14px;
  border: 1px solid rgba(220, 207, 192, 0.78);
  border-radius: 12px;
  background: rgba(255, 253, 249, 0.92);
  color: var(--sm-text);
  cursor: pointer;
  transition: border-color 0.16s, background 0.16s, transform 0.16s, box-shadow 0.16s;
}

.notif-item:hover {
  border-color: rgba(192, 120, 88, 0.44);
  background: #fff;
  transform: translateY(-1px);
  box-shadow: 0 12px 28px rgba(43, 31, 20, 0.08);
}

.notif-item.notif-unread {
  border-color: rgba(217, 48, 37, 0.26);
  background: rgba(255, 248, 240, 0.98);
}

.notif-card-dot {
  top: 9px;
  left: 9px;
  width: 8px;
  height: 8px;
}

.notif-icon {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 50%;
  background: rgba(192, 120, 88, 0.1);
  font-size: 20px;
}

.notif-body {
  min-width: 0;
}

.notif-text {
  overflow: hidden;
  font-size: 14px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notif-text strong {
  color: #5D3A1A;
}

.notif-diary-title {
  color: #8B7355;
  font-style: italic;
}

.notif-comment {
  max-width: 100%;
  margin-top: 5px;
  color: #806a54;
  font-size: 12px;
}

.notif-comment p {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notif-meta {
  margin-top: 5px;
}

.notif-time {
  color: #b0987f;
  font-size: 11px;
}

.notif-open-btn {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid rgba(192, 120, 88, 0.24);
  border-radius: 999px;
  background: #fffaf4;
  color: #8B4513;
  cursor: pointer;
  font-size: 12px;
  font-weight: 900;
}

.notif-open-btn:hover {
  border-color: rgba(192, 120, 88, 0.46);
  background: #fff;
}

.notification-detail-card {
  width: min(620px, calc(100vw - 32px));
  max-height: min(760px, calc(100dvh - 48px));
  overflow-y: auto;
  padding: 24px;
  border: 1px solid rgba(220, 207, 192, 0.9);
  border-radius: 18px;
  background: rgba(255, 252, 247, 0.98);
  box-shadow: 0 24px 60px rgba(43, 31, 20, 0.24);
}

.notification-detail-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 18px;
}

.notification-detail-head > div {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr);
  gap: 4px 12px;
  align-items: center;
}

.notification-detail-icon {
  grid-row: 1 / span 2;
  width: 46px;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(192, 120, 88, 0.1);
  font-size: 22px;
}

.notification-detail-head h3 {
  margin: 0;
  color: var(--sm-text);
  font-size: 20px;
}

.notification-detail-head p {
  margin: 0;
  color: #a38970;
  font-size: 12px;
}

.notification-detail-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.notification-detail-line,
.notification-detail-comment,
.notification-detail-reply {
  padding: 13px 14px;
  border: 1px solid rgba(220, 207, 192, 0.7);
  border-radius: 12px;
  background: #fffdf9;
}

.notification-detail-line {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
}

.notification-detail-line span,
.notification-detail-comment span,
.notification-detail-reply label {
  color: #9b7b5d;
  font-size: 12px;
  font-weight: 900;
}

.notification-detail-line strong {
  color: var(--sm-text);
}

.notification-detail-comment p {
  margin: 8px 0 0;
  color: #6f5840;
  line-height: 1.65;
}

.notification-detail-reply {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notification-detail-reply textarea {
  min-height: 86px;
  resize: vertical;
  padding: 10px 12px;
  border: 1px solid rgba(220, 207, 192, 0.88);
  border-radius: 10px;
  background: #fff;
  color: var(--sm-text);
  font: inherit;
  outline: none;
}

.notification-detail-reply textarea:focus {
  border-color: rgba(192, 120, 88, 0.5);
}

.notification-detail-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.profile-modal-card {
  width: min(760px, calc(100vw - 36px));
  max-height: min(760px, calc(100vh - 72px));
  overflow-y: auto;
  padding: 24px;
  border: 1px solid rgba(220, 207, 192, 0.9);
  border-radius: 18px;
  background: rgba(255, 252, 247, 0.98);
  box-shadow: 0 24px 60px rgba(43, 31, 20, 0.22);
}

.profile-preference-modal {
  width: min(1100px, calc(100vw - 32px));
  max-height: min(820px, calc(100vh - 40px));
  display: flex;
  flex-direction: column;
}

.profile-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.profile-modal-head h3 {
  margin: 0;
  color: var(--sm-text);
  font-size: 20px;
}

.profile-modal-list,
.profile-preference-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.profile-modal-row,
.profile-preference-row {
  display: grid;
  grid-template-columns: 38px 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid rgba(220, 207, 192, 0.76);
  border-radius: 12px;
  background: #fffdf9;
}

.profile-modal-icon,
.profile-preference-row > span {
  font-size: 22px;
}

.profile-modal-row strong,
.profile-preference-row strong {
  display: block;
  color: var(--sm-text);
}

.profile-modal-row small,
.profile-preference-row small,
.profile-modal-empty {
  color: #8a7259;
  font-size: 13px;
}

.profile-modal-empty {
  padding: 16px;
  border: 1px dashed rgba(220, 207, 192, 0.92);
  border-radius: 12px;
  background: #fffaf4;
}

.profile-modal-empty.compact {
  padding: 12px;
}

.profile-modal-action,
.profile-modal-primary {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid rgba(192, 120, 88, 0.28);
  border-radius: 10px;
  background: rgba(192, 120, 88, 0.1);
  color: var(--sm-accent);
  font-weight: 900;
  cursor: pointer;
}

.profile-modal-action.danger {
  border-color: rgba(200, 86, 80, 0.26);
  background: rgba(217, 83, 79, 0.07);
  color: #c85650;
}

.profile-modal-action.primary {
  border-color: rgba(192, 120, 88, 0.42);
  background: var(--sm-accent);
  color: #fff;
}

.profile-modal-action:disabled {
  opacity: 0.52;
  cursor: not-allowed;
}

.profile-settings-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.profile-settings-form label {
  display: grid;
  grid-template-columns: 86px 1fr;
  align-items: center;
  gap: 12px;
  color: var(--sm-text-secondary);
  font-weight: 800;
}

.profile-settings-avatar-row {
  display: grid;
  grid-template-columns: 86px 1fr;
  align-items: center;
  gap: 12px;
  color: var(--sm-text-secondary);
  font-weight: 800;
}

.profile-avatar-upload {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.profile-avatar-preview {
  width: 58px;
  height: 58px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 2px solid rgba(212, 165, 116, 0.7);
  border-radius: 50%;
  background: #efd4a8;
  color: var(--sm-accent-dark);
  font-size: 22px;
  font-weight: 900;
}

.profile-avatar-upload-btn {
  min-height: 38px;
  display: inline-flex !important;
  grid-template-columns: none !important;
  align-items: center;
  justify-content: center;
  gap: 0;
  padding: 0 14px;
  border: 1px solid rgba(192, 120, 88, 0.28);
  border-radius: 10px;
  background: rgba(192, 120, 88, 0.1);
  color: var(--sm-accent);
  font-weight: 900;
  cursor: pointer;
}

.profile-avatar-upload-btn input {
  display: none;
}

.profile-avatar-upload small {
  flex-basis: 100%;
  color: #8a7259;
  font-size: 12px;
  font-weight: 600;
}

.profile-settings-form input {
  min-height: 42px;
  padding: 0 12px;
  border: 1px solid #dfd0c2;
  border-radius: 12px;
  background: #fffaf4;
  color: var(--sm-text);
  outline: none;
}

.profile-settings-message {
  margin: 0;
  color: var(--sm-accent);
  font-size: 13px;
  font-weight: 800;
}

.profile-preference-picker,
.profile-preference-kind-tabs {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.profile-preference-picker {
  margin-bottom: 12px;
}

.profile-preference-tab,
.profile-preference-kind {
  border: 1px solid rgba(220, 207, 192, 0.9);
  border-radius: 12px;
  background: #fffaf4;
  color: #765f47;
  cursor: pointer;
  font-weight: 900;
  transition: all 0.16s ease;
}

.profile-preference-tab {
  min-width: 150px;
  min-height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 14px;
}

.profile-preference-tab small {
  min-width: 28px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(192, 120, 88, 0.1);
  color: var(--sm-accent);
  text-align: center;
}

.profile-preference-kind {
  min-height: 36px;
  padding: 0 14px;
}

.profile-preference-tab.active,
.profile-preference-kind.active {
  border-color: rgba(192, 120, 88, 0.45);
  background: rgba(192, 120, 88, 0.12);
  color: var(--sm-accent);
}

.profile-preference-content {
  min-height: 260px;
  margin-top: 14px;
  padding: 14px;
  overflow-y: auto;
  border: 1px solid rgba(220, 207, 192, 0.72);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
}

.profile-actions-grid,
.journey-stage-grid {
  gap: 14px;
  flex-wrap: wrap;
}

.profile-action-card,
.journey-stage-card {
  flex: 1 1 220px;
  min-width: 220px;
  padding: 18px;
  text-align: left;
}

.journey-stage-card.current {
  border-color: rgba(192, 120, 88, 0.32);
  box-shadow: 0 16px 30px rgba(192, 120, 88, 0.14);
}

.trip-card-panel {
  margin-bottom: 12px;
}

.trip-card {
  background: linear-gradient(135deg, var(--sm-accent), var(--sm-gold));
  border-radius: 18px;
  padding: 16px;
  color: #fff;
  position: relative;
  overflow: hidden;
  box-shadow: 0 18px 30px rgba(192, 120, 88, 0.2);
}

.trip-card::after {
  content: '🧭';
  position: absolute;
  right: -4px;
  bottom: -10px;
  font-size: 52px;
  opacity: 0.14;
}

.trip-card h3,
.trip-card p,
.sect-t,
.timeline .tl-n {
  color: inherit;
}

.trip-card h3 {
  margin: 0;
  font-size: 16px;
}

.trip-card p {
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.88;
}

.tp-params {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.tp-g {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
}

.tp-g button {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  cursor: pointer;
}

.tpv {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  font-size: 12px;
  font-weight: 700;
}

.trip-go {
  margin-top: 10px;
  width: 100%;
  min-height: 38px;
  border-radius: 12px;
  border: none;
  background: #fff;
  color: var(--sm-accent);
  font-weight: 700;
  cursor: pointer;
}

.trip-go:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

/* 行程面板 */
.itinerary-panel {
  margin-bottom: 12px;
  padding: 12px;
  border: 1px solid rgba(220, 207, 192, 0.9);
  border-radius: 18px;
  background: rgba(255,255,255,0.94);
  box-shadow: var(--sm-shadow-sm);
}
.itinerary-panel .panel-header {
  display: flex; align-items: center; justify-content: space-between;
  cursor: default; user-select: none;
  padding: 0 4px 8px;
  border-bottom: 1px solid #eee;
  margin-bottom: 8px;
  font-weight: 600; font-size: 14px;
}
.itinerary-list {
  display: flex; flex-direction: column; gap: 6px;
}
.itinerary-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 6px;
  background: #f9f7f5; border-radius: 10px;
  border: 1px solid #ede7e0;
  transition: all 0.15s;
  cursor: default;
}
.itinerary-item.dragging {
  opacity: 0.4; border-color: #A0522D;
}
.itinerary-item:hover {
  border-color: #d4c5b5;
}
.itinerary-drag-handle {
  display: flex; flex-direction: column; align-items: center;
  cursor: grab; color: #bbb; min-width: 20px;
  user-select: none;
}
.itinerary-drag-handle:active { cursor: grabbing; }
.itinerary-drag-icon { font-size: 16px; line-height: 1; }
.itinerary-order { font-size: 10px; line-height: 1.2; color: #aaa; }
.itinerary-icon-box {
  width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
  font-size: 18px; background: #f1ece6; border-radius: 8px; flex-shrink: 0;
}
.itinerary-info { flex: 1; min-width: 0; }
.itinerary-name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.itinerary-tags { display: flex; gap: 3px; flex-wrap: wrap; }
.itinerary-tags span { font-size: 10px; color: #999; background: #eeeae5; padding: 0 5px; border-radius: 3px; }
.itinerary-duration {
  display: flex; align-items: center; gap: 3px;
  flex-shrink: 0;
}
.itinerary-duration label { font-size: 11px; color: #888; }
.itinerary-duration select {
  font-size: 12px; padding: 2px 4px; border: 1px solid #d4c5b5; border-radius: 5px;
  background: #fff; cursor: pointer; color: #5D3A1A;
}
.itinerary-remove {
  border: none; background: none; cursor: pointer; color: #ccc;
  font-size: 16px; padding: 2px 4px; line-height: 1;
  transition: color 0.15s; flex-shrink: 0;
}
.itinerary-remove:hover { color: #e74c3c; }

.itinerary-start-btn {
  margin-top: 10px; width: 100%; padding: 10px;
  border: none; border-radius: 10px;
  background: linear-gradient(135deg, #795548, #A0522D);
  color: #fff; font-size: 15px; font-weight: 600;
  cursor: pointer; transition: opacity 0.2s; letter-spacing: 1px;
}
.itinerary-start-btn:hover { opacity: 0.9; }
.itinerary-start-btn:active { opacity: 0.8; }

.itinerary-empty-box {
  display: flex; flex-direction: column; align-items: center;
  padding: 28px 16px 20px; text-align: center;
}
.itinerary-empty-standalone {
  margin-bottom: 12px;
  padding: 26px 16px 20px;
  border: 1px dashed rgba(212, 165, 116, 0.4);
  border-radius: 18px;
  background: rgba(255,255,255,0.88);
  box-shadow: var(--sm-shadow-sm);
  text-align: center;
}
.itinerary-empty-icon { font-size: 38px; margin-bottom: 10px; }
.itinerary-empty-text { font-size: 15px; font-weight: 600; color: #8B7355; margin-bottom: 6px; }
.itinerary-empty-hint { font-size: 12px; color: #bbb; }

.visited-badge {
  display: inline-block; font-size: 11px; padding: 0 6px; border-radius: 4px;
  background: #c8e6c9; color: #2e7d32; margin-left: 4px;
}

.spot-card-actions {
  display: flex; gap: 6px; margin-top: 6px;
}

.trip-panel-section {
  margin-bottom: 12px;
}

.trip-route-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 14px;
  padding: 16px;
  border: 1px solid rgba(220, 207, 192, 0.9);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: var(--sm-shadow-sm);
}

.trip-route-head {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.trip-route-kicker {
  width: fit-content;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(192, 120, 88, 0.1);
  color: var(--sm-accent);
  font-size: 11px;
  font-weight: 700;
}

.trip-route-head strong {
  color: var(--sm-text);
  font-size: 20px;
  line-height: 1.25;
}

.trip-route-head small {
  color: var(--sm-text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.trip-route-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.trip-route-stats div {
  min-height: 62px;
  padding: 10px 12px;
  border: 1px solid rgba(220, 207, 192, 0.72);
  border-radius: 14px;
  background: rgba(250, 246, 239, 0.78);
}

.trip-route-stats span,
.trip-route-stats strong {
  display: block;
}

.trip-route-stats span {
  color: var(--sm-text-muted);
  font-size: 11px;
}

.trip-route-stats strong {
  margin-top: 5px;
  color: var(--sm-text);
  font-size: 15px;
}

.trip-map-route-timeline {
  padding: 4px 0 2px 20px;
}

.trip-map-route-timeline .tl-it:last-child {
  padding-bottom: 0;
}

.trip-map-route-timeline .tl-n {
  min-width: 0;
  flex-wrap: wrap;
  font-size: 13px;
  font-weight: 700;
}

.trip-route-refresh {
  min-height: 42px;
  border: 1px solid rgba(192, 120, 88, 0.28);
  border-radius: 13px;
  background: rgba(192, 120, 88, 0.1);
  color: var(--sm-accent);
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.18s ease;
}

.trip-route-refresh:hover {
  border-color: rgba(192, 120, 88, 0.44);
  background: rgba(192, 120, 88, 0.16);
  transform: translateY(-1px);
}

.sect-t {
  margin-bottom: 8px;
  color: var(--sm-text);
  font-size: 12px;
  font-weight: 700;
}

.timeline {
  position: relative;
  padding-left: 20px;
}

.timeline::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 6px;
  bottom: 6px;
  width: 2px;
  background: var(--sm-border);
  border-radius: 2px;
}

.tl-it {
  position: relative;
  padding: 4px 0 8px 10px;
}

.tl-it::before {
  content: '';
  position: absolute;
  left: -15px;
  top: 9px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--sm-border);
  border: 2px solid #fff;
}

.tl-it.active::before {
  background: var(--sm-accent);
  box-shadow: 0 0 0 3px rgba(192, 120, 88, 0.12);
}

.tl-it.done::before {
  background: var(--sm-gold);
}

.tl-it.done {
  opacity: 0.58;
}

.tl-t {
  font-size: 10px;
  color: var(--sm-text-muted);
}

.timeline .tl-n {
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--sm-text);
}

.tl-b {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 700;
}

.tl-b.visit,
.tl-b.spot {
  background: rgba(192, 120, 88, 0.1);
  color: var(--sm-accent);
}

.tl-b.travel {
  background: rgba(212, 165, 116, 0.14);
  color: #a97a58;
}

.tl-b.meal {
  background: rgba(90, 158, 111, 0.12);
  color: var(--sm-green);
}

.tl-b.photo {
  background: rgba(156, 39, 176, 0.1);
  color: #8b3fa6;
}

.trip-empty-card,
.trip-shortcut-card {
  border: 1px solid rgba(220, 207, 192, 0.82);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: var(--sm-shadow-sm);
}

.trip-empty-card {
  padding: 14px;
  border-radius: 14px;
  color: var(--sm-text-secondary);
  font-size: 12px;
}

.trip-shortcut-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.trip-shortcut-card:hover {
  border-color: var(--sm-gold);
  transform: translateY(-1px);
}

.trip-shortcut-icon {
  font-size: 18px;
}

.trip-shortcut-copy {
  flex: 1;
}

.trip-shortcut-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--sm-text);
}

.trip-shortcut-desc,
.trip-shortcut-arrow {
  font-size: 11px;
  color: var(--sm-text-muted);
}

.tbr-user {
  cursor: pointer;
}

@media (max-width: 1200px) {
  .map-location.panel-offset,
  .route-bar.panel-offset,
  .map-bottom.panel-offset {
    transform: translateX(110px);
  }

  .route-bar {
    min-width: min(640px, calc(100vw - 360px));
  }

  .app-page {
    inset: 78px 12px 12px;
  }
}

@media (max-width: 900px) {
  .topbar {
    padding: 0 12px;
  }

  .topbar-nav {
    display: none;
  }

  .btn-group,
  .nav-footer {
    grid-template-columns: 1fr;
  }

  .map-location.panel-offset,
  .route-bar.panel-offset,
  .map-bottom.panel-offset {
    transform: none;
  }

  .app-page {
    inset: 72px 8px 8px;
    border-radius: 20px;
  }

  .page-inner {
    padding: 16px;
  }

  .page-header,
  .section-head,
  .page-list-card,
  .timeline-row,
  .profile-hero-card {
    flex-direction: column;
    align-items: flex-start;
  }

  .page-stat-card,
  .profile-action-card,
  .journey-stage-card {
    min-width: 100%;
  }

  .timeline-time {
    min-width: 0;
  }
}

/* === Discover page redesign === */
.app-page-discover {
  inset: 0;
  border: 0;
  border-radius: 0;
  background: #f7f2eb;
  box-shadow: none;
  backdrop-filter: none;
}

.discover-page-shell {
  width: min(1600px, calc(100vw - 96px));
  margin: 0 auto;
  padding: 34px 0 64px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.discover-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
}

.discover-hero h1 {
  margin: 0;
  color: #2b1f14;
  font-size: 30px;
  font-weight: 900;
  letter-spacing: 0;
}

.discover-hero p {
  margin: 8px 0 0;
  color: #8a7259;
  font-size: 15px;
}

.discover-search-wrap {
  position: relative;
  width: min(760px, 100%);
  margin: 0 0 18px;
}

.discover-search-bar {
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  border: 1px solid #dfd0c2;
  border-radius: 12px;
  background: #fffaf4;
  box-shadow: 0 10px 24px rgba(43, 31, 20, 0.06);
  transition: border-color 0.16s, background 0.16s, box-shadow 0.16s;
}

.discover-search-bar.focus {
  border-color: #c07858;
  background: #fff;
  box-shadow: 0 14px 30px rgba(192, 120, 88, 0.12);
}

.discover-search-icon {
  flex: 0 0 auto;
  font-size: 17px;
}

.discover-search-input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #2b1f14;
  font-size: 15px;
  font-weight: 700;
}

.discover-search-input::placeholder {
  color: #a99278;
  font-weight: 600;
}

.discover-search-clear {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 50%;
  background: rgba(192, 120, 88, 0.1);
  color: #9a5f45;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.discover-search-loading {
  color: #9a5f45;
  font-size: 12px;
  font-weight: 800;
}

.discover-search-dropdown,
.discover-search-empty {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 8px);
  z-index: 30;
  border: 1px solid #dfd0c2;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 18px 38px rgba(43, 31, 20, 0.14);
}

.discover-search-dropdown {
  max-height: 380px;
  overflow-y: auto;
  padding: 10px;
}

.discover-search-group + .discover-search-group {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #eee4da;
}

.discover-search-title {
  margin: 0 0 6px;
  color: #8a7259;
  font-size: 12px;
  font-weight: 900;
}

.discover-search-item {
  width: 100%;
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #2b1f14;
  cursor: pointer;
  text-align: left;
}

.discover-search-item:hover {
  background: #f7f2eb;
}

.discover-search-item span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 800;
}

.discover-search-item small {
  flex: 0 0 auto;
  max-width: 180px;
  overflow: hidden;
  color: #9d876e;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.discover-search-empty {
  padding: 14px;
  color: #8a7259;
  font-size: 13px;
  font-weight: 700;
}

.discover-distance-anchor {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px 12px;
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(220, 207, 192, 0.78);
  border-radius: 12px;
  background: rgba(255, 252, 247, 0.88);
}

.discover-distance-anchor > div {
  min-width: 0;
}

.discover-distance-anchor span {
  display: block;
  color: #9b7b5d;
  font-size: 11px;
  font-weight: 800;
}

.discover-distance-anchor strong {
  display: block;
  overflow: hidden;
  color: var(--sm-text);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.discover-distance-anchor p {
  grid-column: 1 / -1;
  margin: 0;
  color: #8a7259;
  font-size: 12px;
}

.discover-refresh-btn,
.discover-filter-btn,
.discover-primary-mini,
.discover-secondary-mini,
.discover-submit-review {
  border: 1px solid #dfd0c2;
  border-radius: 9px;
  background: #fffaf4;
  color: #765f47;
  font-weight: 800;
  cursor: pointer;
  transition: border-color 0.16s, background 0.16s, color 0.16s, transform 0.16s;
}

.discover-refresh-btn {
  min-height: 42px;
  padding: 0 20px;
}

.discover-refresh-btn:hover,
.discover-filter-btn:hover,
.discover-secondary-mini:hover,
.discover-primary-mini:hover,
.discover-submit-review:hover:not(:disabled) {
  border-color: #d4a574;
  background: #fff;
  color: #9a5f45;
  transform: translateY(-1px);
}

.discover-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 8px;
  border: 1px solid #e6dbcf;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 8px 22px rgba(43, 31, 20, 0.05);
}

.discover-tab-btn {
  min-height: 48px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #6d563f;
  font-size: 15px;
  font-weight: 900;
  cursor: pointer;
  transition: background 0.16s, color 0.16s, box-shadow 0.16s;
}

.discover-tab-btn.active {
  background: #c07858;
  color: #fff;
  box-shadow: 0 12px 24px rgba(192, 120, 88, 0.22);
}

.discover-section {
  scroll-margin-top: 24px;
}

.discover-section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 16px;
}

.discover-section-head h2 {
  margin: 0;
  color: #2b1f14;
  font-size: 24px;
  font-weight: 900;
}

.discover-section-head p {
  margin: 6px 0 0;
  color: #846b52;
  font-size: 14px;
}

.discover-filter-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.discover-filter-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.discover-filter-btn {
  min-height: 40px;
  padding: 0 18px;
  font-size: 14px;
}

.discover-filter-btn.pill {
  border-radius: 999px;
}

.discover-filter-btn.slim {
  min-height: 34px;
  padding: 0 15px;
  font-size: 13px;
}

.discover-filter-btn.active {
  border-color: #c07858;
  background: #c07858;
  color: #fff;
}

.discover-empty {
  padding: 28px;
  border: 1px dashed #d8c7b7;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.62);
  color: #8a7259;
  text-align: center;
}

.discover-spot-grid,
.discover-service-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
}

.discover-food-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.discover-spot-card,
.discover-food-card,
.discover-service-card {
  border: 1px solid #e4d8cb;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 8px 20px rgba(43, 31, 20, 0.045);
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.18s, border-color 0.18s, box-shadow 0.18s;
}

.discover-spot-card:hover,
.discover-food-card:hover,
.discover-service-card:hover {
  transform: translateY(-3px);
  border-color: #d4a574;
  box-shadow: 0 16px 30px rgba(43, 31, 20, 0.08);
}

.spot-cover {
  height: 112px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 34px;
}

.cover-0 { background: linear-gradient(135deg, #bf7655, #d69768); }
.cover-1 { background: linear-gradient(135deg, #d4a574, #e8c692); }
.cover-2 { background: linear-gradient(135deg, #5fa66f, #87c45a); }
.cover-3 { background: linear-gradient(135deg, #a76547, #c07858); }

.spot-card-body,
.discover-service-card {
  padding: 16px;
}

.spot-title-row,
.food-title-row,
.service-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.spot-title-row h3,
.food-title-row h3,
.discover-service-card h3 {
  margin: 0;
  color: #2b1f14;
  font-size: 17px;
  font-weight: 900;
  line-height: 1.28;
}

.food-title-row h3 span {
  color: #e5a51b;
  font-size: 14px;
}

.discover-fav-btn {
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 50%;
  background: #f6eee6;
  color: #c9addb;
  font-size: 18px;
  cursor: pointer;
  transition: background 0.16s, color 0.16s, transform 0.16s;
}

.discover-fav-btn:hover,
.discover-fav-btn.active {
  background: #fff0f3;
  color: #c07858;
  transform: scale(1.06);
}

.spot-meta-line,
.food-meta-line,
.service-meta-line {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 9px;
  color: #8a7259;
  font-size: 13px;
}

.spot-hot-line {
  margin-top: 8px;
  color: #c07858;
  font-size: 13px;
  font-weight: 800;
}

.discover-food-card {
  display: grid;
  grid-template-columns: 74px 1fr;
  gap: 16px;
  padding: 16px;
  min-height: 138px;
}

.food-icon-box,
.service-icon-box,
.discover-detail-icon,
.discover-gallery-item {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: #f8f3ee;
}

.food-icon-box {
  width: 74px;
  height: 74px;
  font-size: 34px;
}

.food-card-main p,
.discover-service-card p {
  margin: 7px 0 0;
  color: #8a7259;
  font-size: 13px;
  line-height: 1.5;
}

.food-card-actions,
.service-card-actions,
.discover-detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
}

.discover-primary-mini,
.discover-secondary-mini {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  text-decoration: none;
  font-size: 13px;
}

.discover-primary-mini {
  border-color: #c07858;
  background: #c07858;
  color: #fff;
}

.discover-primary-mini.active {
  background: #9a5f45;
}

.discover-secondary-mini:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.service-icon-box {
  width: 48px;
  height: 48px;
  font-size: 24px;
}

.discover-detail-overlay {
  position: fixed; inset: 0; z-index: 13000;
  background: rgba(43, 31, 20, 0.42); backdrop-filter: blur(8px);
}

.discover-detail-modal {
  width: min(860px, 92vw);
  max-height: min(92dvh, 920px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #e6dbcf;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 24px 80px rgba(43, 31, 20, 0.24);
  pointer-events: auto;
}

.discover-detail-drag-handle {
  cursor: grab; user-select: none;
  text-align: center; padding: 4px 0 0;
  color: #ccc; font-size: 18px; letter-spacing: 4px;
  background: #fafaf8;
  border-top-left-radius: 14px; border-top-right-radius: 14px;
  transition: color 0.2s; flex: 0 0 auto;
}
.discover-detail-drag-handle:active { cursor: grabbing; }
.discover-detail-drag-handle:hover { color: #8B4513; }

.discover-detail-header {
  min-height: 66px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 12px 28px;
  border-bottom: 1px solid #ede2d7;
}

.discover-detail-header h2 {
  margin: 0;
  color: #2b1f14;
  font-size: 20px;
  font-weight: 900;
}

.discover-detail-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.discover-detail-reaction-btn {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 14px;
  border: 1px solid #e1d2c4;
  border-radius: 999px;
  background: #fffaf4;
  color: #6d563f;
  font-size: 14px;
  font-weight: 900;
  cursor: pointer;
  transition: border-color 0.16s, background 0.16s, color 0.16s, transform 0.16s;
}

.discover-detail-reaction-btn span {
  font-size: 18px;
  line-height: 1;
}

.discover-detail-reaction-btn strong,
.discover-detail-reaction-btn em {
  font-style: normal;
}

.discover-detail-reaction-btn:hover,
.discover-detail-reaction-btn.active {
  border-color: rgba(192, 120, 88, 0.42);
  background: #fff;
  color: #c07858;
  transform: translateY(-1px);
}

.discover-detail-icon-btn {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #ad9276;
  font-size: 24px;
  cursor: pointer;
}

.discover-detail-icon-btn.active {
  color: #c07858;
}

.discover-detail-body {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
  overflow-y: auto;
  padding: 26px 28px 48px;
  overscroll-behavior: contain;
}

.discover-detail-hero {
  display: grid;
  grid-template-columns: 104px 1fr;
  gap: 22px;
  align-items: center;
}

.discover-detail-icon {
  width: 104px;
  height: 104px;
  font-size: 42px;
}

.discover-detail-copy h3 {
  margin: 0;
  color: #2b1f14;
  font-size: 22px;
  font-weight: 900;
}

.discover-detail-copy h3 span {
  color: #e5a51b;
  font-size: 16px;
}

.discover-detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.discover-detail-tags span {
  padding: 4px 9px;
  border-radius: 6px;
  background: #f6e9df;
  color: #c07858;
  font-size: 12px;
  font-weight: 800;
}

.discover-detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  margin-top: 24px;
  color: #9a826a;
  font-size: 14px;
}

.discover-detail-desc {
  margin: 20px 0 0;
  color: #765f47;
  font-size: 15px;
  line-height: 1.8;
}

.discover-detail-gallery,
.discover-review-section {
  margin-top: 24px;
}

.discover-detail-gallery h4,
.discover-review-section h4 {
  margin: 0 0 12px;
  color: #2b1f14;
  font-size: 16px;
  font-weight: 900;
}

.discover-gallery-row {
  display: flex;
  gap: 10px;
}

.discover-gallery-item {
  width: 116px;
  height: 82px;
  font-size: 28px;
}

.discover-review-list {
  display: grid;
  gap: 10px;
}

.discover-review-item {
  display: grid;
  grid-template-columns: 34px 1fr;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid #eadfd3;
  border-radius: 9px;
  background: #fffdf9;
}

.review-avatar {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #f8f0e8;
  color: #9a5f45;
  font-weight: 900;
}

.review-line {
  display: flex;
  align-items: center;
  gap: 10px;
}

.review-line strong {
  color: #2b1f14;
}

.review-line span {
  color: #e5a51b;
}

.review-line small {
  margin-left: auto;
  color: #ad9276;
}

.review-main p {
  margin: 6px 0 0;
  color: #765f47;
  line-height: 1.55;
}

.discover-review-composer {
  display: grid;
  gap: 10px;
  margin-top: 16px;
}

.discover-rating-picker {
  display: flex;
  gap: 4px;
}

.discover-rating-picker button {
  border: 0;
  background: transparent;
  color: #d8c7b7;
  font-size: 24px;
  cursor: pointer;
}

.discover-rating-picker button.active {
  color: #e5a51b;
}

.discover-review-composer textarea {
  width: 100%;
  resize: vertical;
  border: 1px solid #e4d8cb;
  border-radius: 9px;
  padding: 12px;
  color: #2b1f14;
  line-height: 1.5;
  outline: none;
}

.discover-review-composer textarea:focus {
  border-color: #d4a574;
}

.discover-submit-review {
  justify-self: start;
  min-height: 38px;
  padding: 0 18px;
  border-color: #c07858;
  background: #c07858;
  color: #fff;
}

.discover-submit-review:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

@media (max-width: 1200px) {
  .app-page-discover {
    inset: 0;
  }

  .discover-page-shell {
    width: min(1120px, calc(100vw - 48px));
  }

  .discover-spot-grid,
  .discover-service-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .discover-food-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .app-page-discover {
    inset: 0;
    border-radius: 0;
  }

  .discover-page-shell {
    width: calc(100vw - 28px);
    padding-top: 22px;
  }

  .discover-hero,
  .discover-section-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .discover-tabs {
    grid-template-columns: 1fr;
  }

  .discover-spot-grid,
  .discover-food-grid,
  .discover-service-grid {
    grid-template-columns: 1fr;
  }

  .discover-detail-overlay {
    padding: 14px;
  }

  .discover-detail-hero,
  .discover-food-card {
    grid-template-columns: 1fr;
  }

  .discover-detail-icon,
  .food-icon-box {
    width: 84px;
    height: 84px;
  }
}

.topbar-right .tbr-user {
  padding: 4px 8px 4px 4px;
  gap: 8px;
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
}

.topbar-right .tbr-logout:hover {
  border-color: #d4a574;
  background: #fff;
  color: #9a5f45;
}

.discover-tabs {
  position: static;
  top: auto;
  z-index: auto;
}

.app-page-discover {
  overflow: hidden;
}

.discover-page-shell {
  height: 100%;
  padding: 0;
  gap: 0;
  overflow: hidden;
}

.discover-fixed-head {
  flex: 0 0 auto;
  padding: 34px 0 18px;
  background: linear-gradient(180deg, #f7f2eb 0%, rgba(247, 242, 235, 0.96) 100%);
  box-shadow: 0 14px 26px rgba(43, 31, 20, 0.04);
  z-index: 8;
}

.discover-fixed-head .discover-hero {
  margin-bottom: 24px;
}

.discover-scroll-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding: 24px 0 64px;
  scroll-behavior: smooth;
}

.discover-scroll-body .discover-section {
  scroll-margin-top: 0;
}

/* Trip panel cleanup: keep one booking panel and one full-width scenic navigation action. */
.sidebar .nav-footer {
  display: block;
  grid-template-columns: none;
  margin-top: auto;
  padding: 14px;
}

.sidebar .nav-footer .campus-nav-btn {
  width: 100%;
  min-height: 58px;
  border-radius: 14px;
  font-size: 16px;
}

@media (max-width: 1200px) {
  .discover-page-shell {
    padding: 0;
  }

  .profile-page-inner {
    width: min(1120px, calc(100vw - 48px));
  }

  .profile-menu-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .discover-page-shell {
    padding: 0;
  }

  .discover-fixed-head {
    padding-top: 22px;
  }

  .profile-page-inner {
    width: calc(100vw - 28px);
    padding-top: 22px;
  }

  .profile-page-header,
  .profile-hero-card {
    align-items: flex-start;
    flex-direction: column;
  }

  .profile-menu-grid {
    grid-template-columns: 1fr;
  }

  .profile-preference-tab {
    flex: 1 1 100%;
    min-width: 0;
  }

  .profile-modal-row,
  .profile-preference-row,
  .profile-settings-form label,
  .profile-settings-avatar-row {
    grid-template-columns: 1fr;
  }
}

/* 加入行程 Toast */
.journey-toast {
  position: fixed; bottom: 120px; left: 50%; transform: translateX(-50%);
  z-index: 99999;
  background: linear-gradient(135deg, #2e7d32, #43a047);
  color: #fff; font-size: 16px; font-weight: 600;
  padding: 14px 32px; border-radius: 12px;
  box-shadow: 0 6px 24px rgba(46, 125, 50, 0.35);
  pointer-events: none;
  white-space: nowrap;
}
.toast-fade-enter-active { transition: all 0.25s ease; }
.toast-fade-leave-active { transition: all 0.3s ease; }
.toast-fade-enter-from { opacity: 0; transform: translateX(-50%) translateY(16px); }
.toast-fade-leave-to { opacity: 0; transform: translateX(-50%) translateY(-8px); }
</style>

