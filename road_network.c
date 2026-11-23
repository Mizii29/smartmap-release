/**
 * road_network.c - 真实路网 A* 路径规划（纯 C 实现）
 *
 * 从 CSV 加载北京路网，构建邻接表图，实现基于真实道路的 A* 搜索。
 * 使用网格空间索引加速最近节点查找。
 */

#include "road_network.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <float.h>

/* ---------- 全局变量 ---------- */
RoadNode road_nodes[MAX_ROAD_NODES];
AdjEntry adj_entries[MAX_ADJ_ENTRIES];
int road_node_count = 0;
int adj_entry_count = 0;

/* 空间索引 */
int spatial_grid[GRID_SPATIAL_SIZE][GRID_SPATIAL_SIZE];
int spatial_nodes[MAX_ROAD_NODES];
static int spatial_offsets[GRID_SPATIAL_SIZE][GRID_SPATIAL_SIZE];

/* 坐标范围（自动计算） */
static double min_lat = DBL_MAX, max_lat = -DBL_MAX;
static double min_lng = DBL_MAX, max_lng = -DBL_MAX;

/* ---------- 工具函数 ---------- */
static double deg2rad(double d) { return d * 3.14159265358979323846 / 180.0; }

static double haversine_m(double lat1, double lng1, double lat2, double lng2)
{
    double dLat = deg2rad(lat2 - lat1);
    double dLng = deg2rad(lng2 - lng1);
    double a = sin(dLat / 2) * sin(dLat / 2) +
               cos(deg2rad(lat1)) * cos(deg2rad(lat2)) *
                   sin(dLng / 2) * sin(dLng / 2);
    return 6371000.0 * 2 * atan2(sqrt(a), sqrt(1 - a));
}

/* 经纬度 -> 网格坐标 */
static void latlng_to_grid_cell(double lat, double lng, int *gx, int *gy)
{
    double eps = 1e-8;
    *gx = (int)((lng - min_lng) / (max_lng - min_lng + eps) * (GRID_SPATIAL_SIZE - 1));
    *gy = (int)((lat - min_lat) / (max_lat - min_lat + eps) * (GRID_SPATIAL_SIZE - 1));
    if (*gx < 0)
        *gx = 0;
    if (*gx >= GRID_SPATIAL_SIZE)
        *gx = GRID_SPATIAL_SIZE - 1;
    if (*gy < 0)
        *gy = 0;
    if (*gy >= GRID_SPATIAL_SIZE)
        *gy = GRID_SPATIAL_SIZE - 1;
}

/* ---------- 加载路网 CSV ---------- */

static int load_nodes_csv(const char *path)
{
    FILE *fp = fopen(path, "r");
    if (!fp)
    {
        fprintf(stderr, "[RoadNet] Failed to open %s\n", path);
        return -1;
    }

    char line[512];
    fgets(line, sizeof(line), fp); /* 跳过标题行 */

    road_node_count = 0;
    while (fgets(line, sizeof(line), fp) && road_node_count < MAX_ROAD_NODES)
    {
        long long id;
        double lat, lng;
        if (sscanf(line, "%lld,%lf,%lf", &id, &lat, &lng) == 3)
        {
            road_nodes[road_node_count].id = id;
            road_nodes[road_node_count].lat = lat;
            road_nodes[road_node_count].lng = lng;
            road_nodes[road_node_count].adj_start = 0;
            road_nodes[road_node_count].adj_count = 0;

            if (lat < min_lat)
                min_lat = lat;
            if (lat > max_lat)
                max_lat = lat;
            if (lng < min_lng)
                min_lng = lng;
            if (lng > max_lng)
                max_lng = lng;

            road_node_count++;
        }
    }
    fclose(fp);
    printf("[RoadNet] Loaded %d nodes from %s\n", road_node_count, path);
    printf("[RoadNet] Bounds: lat [%.4f, %.4f], lng [%.4f, %.4f]\n",
           min_lat, max_lat, min_lng, max_lng);
    return 0;
}

/* 二分查找节点索引 */
static int find_node_index(long long node_id)
{
    int lo = 0, hi = road_node_count - 1;
    while (lo <= hi)
    {
        int mid = (lo + hi) / 2;
        if (road_nodes[mid].id == node_id)
            return mid;
        if (road_nodes[mid].id < node_id)
            lo = mid + 1;
        else
            hi = mid - 1;
    }
    return -1;
}

/* 比较函数用于 qsort */
static int compare_node_by_id(const void *a, const void *b)
{
    long long id_a = ((RoadNode *)a)->id;
    long long id_b = ((RoadNode *)b)->id;
    if (id_a < id_b)
        return -1;
    if (id_a > id_b)
        return 1;
    return 0;
}

/* 原始边数据 */
typedef struct
{
    int from_idx;
    int to_idx;
    double distance;
    int one_way;
} TempEdge;

static int compare_edge_by_from(const void *a, const void *b)
{
    int from_a = ((TempEdge *)a)->from_idx;
    int from_b = ((TempEdge *)b)->from_idx;
    if (from_a < from_b)
        return -1;
    if (from_a > from_b)
        return 1;
    return 0;
}

static int load_edges_csv(const char *path)
{
    FILE *fp = fopen(path, "r");
    if (!fp)
    {
        fprintf(stderr, "[RoadNet] Failed to open %s\n", path);
        return -1;
    }

    /* 第一步：先对节点按 ID 排序（便于二分查找） */
    qsort(road_nodes, road_node_count, sizeof(RoadNode), compare_node_by_id);

    /* 第二步：读取所有边 */
    char line[512];
    fgets(line, sizeof(line), fp); /* 跳过标题行 */

    /* 动态分配 */
    TempEdge *temp_edges = (TempEdge *)malloc(MAX_ROAD_EDGES * sizeof(TempEdge));
    if (!temp_edges)
    {
        fprintf(stderr, "[RoadNet] Failed to allocate temp_edges\n");
        fclose(fp);
        return -1;
    }
    int temp_count = 0;

    while (fgets(line, sizeof(line), fp) && temp_count < MAX_ROAD_EDGES)
    {
        long long from_id, to_id;
        double dist;
        int one_way = 0;
        /* 解析 CSV: from_id,to_id,distance,"road_name","highway_type",max_speed,one_way */
        int parsed = sscanf(line, "%lld,%lld,%lf", &from_id, &to_id, &dist);
        if (parsed < 3)
            continue;

        /* 读取 one_way 字段（最后一个逗号后面的数字） */
        char *last_comma = strrchr(line, ',');
        if (last_comma)
        {
            one_way = atoi(last_comma + 1);
        }

        int from_idx = find_node_index(from_id);
        int to_idx = find_node_index(to_id);

        if (from_idx < 0 || to_idx < 0)
            continue;
        if (from_idx == to_idx)
            continue;

        temp_edges[temp_count].from_idx = from_idx;
        temp_edges[temp_count].to_idx = to_idx;
        temp_edges[temp_count].distance = dist;
        temp_edges[temp_count].one_way = one_way;
        temp_count++;
    }
    fclose(fp);
    printf("[RoadNet] Read %d valid edges\n", temp_count);

    /* 第三步：展开为双向邻接条目，然后排序 */
    /* 每个单行道出1条，每个双行道出2条 */
    int total_adj_estimate = 0;
    for (int i = 0; i < temp_count; i++)
    {
        total_adj_estimate += (temp_edges[i].one_way ? 1 : 2);
    }
    printf("[RoadNet] Total adjacency entries needed: %d\n", total_adj_estimate);

    /* 分配足够的空间存储所有邻接条目 */
    TempEdge *all_adj = (TempEdge *)malloc(total_adj_estimate * sizeof(TempEdge));
    if (!all_adj)
    {
        fprintf(stderr, "[RoadNet] Failed to allocate all_adj\n");
        free(temp_edges);
        return -1;
    }

    int adj_idx = 0;
    for (int i = 0; i < temp_count; i++)
    {
        /* 正向：from → to */
        all_adj[adj_idx].from_idx = temp_edges[i].from_idx;
        all_adj[adj_idx].to_idx = temp_edges[i].to_idx;
        all_adj[adj_idx].distance = temp_edges[i].distance;
        adj_idx++;

        /* 反向：to → from（除非单行道） */
        if (!temp_edges[i].one_way)
        {
            all_adj[adj_idx].from_idx = temp_edges[i].to_idx;
            all_adj[adj_idx].to_idx = temp_edges[i].from_idx;
            all_adj[adj_idx].distance = temp_edges[i].distance;
            adj_idx++;
        }
    }

    free(temp_edges);
    printf("[RoadNet] Generated %d directional adj entries\n", adj_idx);

    /* 第四步：按 from_idx 排序 */
    qsort(all_adj, adj_idx, sizeof(TempEdge), compare_edge_by_from);

    /* 第五步：构建邻接表 */
    adj_entry_count = 0;
    int prev_from = -1;

    for (int i = 0; i < adj_idx; i++)
    {
        if (adj_entry_count >= MAX_ADJ_ENTRIES)
        {
            printf("[RoadNet] Warning: MAX_ADJ_ENTRIES exceeded!\n");
            break;
        }

        int from = all_adj[i].from_idx;

        if (from != prev_from)
        {
            road_nodes[from].adj_start = adj_entry_count;
            road_nodes[from].adj_count = 0;
            prev_from = from;
        }

        adj_entries[adj_entry_count].to_idx = all_adj[i].to_idx;
        adj_entries[adj_entry_count].distance = all_adj[i].distance;
        road_nodes[from].adj_count++;
        adj_entry_count++;
    }

    free(all_adj);

    printf("[RoadNet] Built adjacency list: %d entries\n", adj_entry_count);
    return 0;
}

/* ---------- 构建空间索引 ---------- */
static int build_spatial_index(void)
{
    /* 初始化网格偏移 */
    memset(spatial_offsets, 0, sizeof(spatial_offsets));

    /* 先统计每个网格的节点数 */
    int cell_counts[GRID_SPATIAL_SIZE][GRID_SPATIAL_SIZE] = {0};
    for (int i = 0; i < road_node_count; i++)
    {
        int gx, gy;
        latlng_to_grid_cell(road_nodes[i].lat, road_nodes[i].lng, &gx, &gy);
        cell_counts[gy][gx]++;
    }

    /* 计算偏移量 */
    int offset = 0;
    for (int y = 0; y < GRID_SPATIAL_SIZE; y++)
    {
        for (int x = 0; x < GRID_SPATIAL_SIZE; x++)
        {
            spatial_offsets[y][x] = offset;
            offset += cell_counts[y][x];
            spatial_grid[y][x] = 0; /* 重置计数用于填充 */
        }
    }

    /* 填充节点索引 */
    for (int i = 0; i < road_node_count; i++)
    {
        int gx, gy;
        latlng_to_grid_cell(road_nodes[i].lat, road_nodes[i].lng, &gx, &gy);
        int pos = spatial_offsets[gy][gx] + spatial_grid[gy][gx];
        spatial_nodes[pos] = i;
        spatial_grid[gy][gx]++;
    }

    printf("[RoadNet] Spatial index built: %dx%d grid\n",
           GRID_SPATIAL_SIZE, GRID_SPATIAL_SIZE);
    return 0;
}

/* ---------- 公共 API ---------- */

int road_network_load(const char *nodes_csv, const char *edges_csv)
{
    printf("=========================================\n");
    printf("[RoadNet] Loading road network...\n");

    if (load_nodes_csv(nodes_csv) != 0)
        return -1;
    if (load_edges_csv(edges_csv) != 0)
        return -1;
    build_spatial_index();

    /* 输出顶点度分布 */
    int max_degree = 0, total_degree = 0;
    for (int i = 0; i < road_node_count; i++)
    {
        if (road_nodes[i].adj_count > max_degree)
            max_degree = road_nodes[i].adj_count;
        total_degree += road_nodes[i].adj_count;
    }
    printf("[RoadNet] Avg degree: %.1f, Max degree: %d\n",
           (double)total_degree / road_node_count, max_degree);

    printf("=========================================\n");
    return 0;
}

int road_network_find_nearest(double lat, double lng)
{
    if (road_node_count == 0)
        return -1;

    int gx, gy;
    latlng_to_grid_cell(lat, lng, &gx, &gy);

    double best_dist = DBL_MAX;
    int best_idx = -1;

    /* 从当前网格开始，逐步扩大搜索范围 */
    for (int radius = 0; radius < GRID_SPATIAL_SIZE; radius++)
    {
        int x_start = (gx - radius >= 0) ? gx - radius : 0;
        int x_end = (gx + radius < GRID_SPATIAL_SIZE) ? gx + radius : GRID_SPATIAL_SIZE - 1;
        int y_start = (gy - radius >= 0) ? gy - radius : 0;
        int y_end = (gy + radius < GRID_SPATIAL_SIZE) ? gy + radius : GRID_SPATIAL_SIZE - 1;

        int any_in_range = 0;
        for (int y = y_start; y <= y_end; y++)
        {
            for (int x = x_start; x <= x_end; x++)
            {
                if (radius > 0 && x > gx - radius && x < gx + radius &&
                    y > gy - radius && y < gy + radius)
                    continue;
                if (spatial_grid[y][x] > 0)
                {
                    any_in_range = 1;
                    int count = spatial_grid[y][x];
                    int off = spatial_offsets[y][x];
                    for (int i = 0; i < count; i++)
                    {
                        int ni = spatial_nodes[off + i];
                        double d = haversine_m(lat, lng, road_nodes[ni].lat, road_nodes[ni].lng);
                        if (d < best_dist)
                        {
                            best_dist = d;
                            best_idx = ni;
                        }
                    }
                }
            }
        }

        if (any_in_range)
            break;
        best_dist = DBL_MAX;
    }

    return best_idx;
}

/* ---------- 优先队列（最小堆）用于 A* ---------- */
typedef struct
{
    int node_idx;
    double f;
} PQNode;

static PQNode pq[MAX_ROAD_NODES];
static int pq_size = 0;

static void pq_push(int node_idx, double f)
{
    int i = pq_size++;
    pq[i].node_idx = node_idx;
    pq[i].f = f;
    while (i > 0)
    {
        int p = (i - 1) / 2;
        if (pq[p].f <= pq[i].f)
            break;
        PQNode t = pq[p];
        pq[p] = pq[i];
        pq[i] = t;
        i = p;
    }
}

static int pq_pop(void)
{
    if (pq_size == 0)
        return -1;
    int top = pq[0].node_idx;
    pq[0] = pq[--pq_size];
    if (pq_size == 0)
        return top;
    int i = 0;
    while (1)
    {
        int smallest = i;
        int left = 2 * i + 1;
        int right = 2 * i + 2;
        if (left < pq_size && pq[left].f < pq[smallest].f)
            smallest = left;
        if (right < pq_size && pq[right].f < pq[smallest].f)
            smallest = right;
        if (smallest == i)
            break;
        PQNode t = pq[i];
        pq[i] = pq[smallest];
        pq[smallest] = t;
        i = smallest;
    }
    return top;
}

/* ---------- A* 路径搜索 ---------- */
int road_network_astar(int start_idx, int end_idx,
                       double **out_lng, double **out_lat, int *out_len)
{
    *out_len = 0;

    if (start_idx < 0 || start_idx >= road_node_count ||
        end_idx < 0 || end_idx >= road_node_count)
    {
        return 0;
    }

    if (start_idx == end_idx)
    {
        *out_lng = (double *)malloc(sizeof(double));
        *out_lat = (double *)malloc(sizeof(double));
        (*out_lng)[0] = road_nodes[start_idx].lng;
        (*out_lat)[0] = road_nodes[start_idx].lat;
        *out_len = 1;
        return 1;
    }

    /* 分配搜索节点 */
    AStarSearchNode *search_nodes = (AStarSearchNode *)calloc(road_node_count, sizeof(AStarSearchNode));
    if (!search_nodes)
        return 0;

    /* 初始化 */
    for (int i = 0; i < road_node_count; i++)
    {
        search_nodes[i].g = 1e18;
        search_nodes[i].f = 1e18;
        search_nodes[i].parent_idx = -1;
        search_nodes[i].in_open = 0;
        search_nodes[i].closed = 0;
    }

    double end_lat = road_nodes[end_idx].lat;
    double end_lng = road_nodes[end_idx].lng;

    /* 起点 */
    search_nodes[start_idx].g = 0;
    search_nodes[start_idx].h = haversine_m(
        road_nodes[start_idx].lat, road_nodes[start_idx].lng, end_lat, end_lng);
    search_nodes[start_idx].f = search_nodes[start_idx].h;
    search_nodes[start_idx].in_open = 1;

    pq_size = 0;
    pq_push(start_idx, search_nodes[start_idx].f);

    int found = 0;
    int iterations = 0;
    const int MAX_ITERATIONS = 1000000;

    while (pq_size > 0 && iterations < MAX_ITERATIONS)
    {
        int cur = pq_pop();
        iterations++;

        if (search_nodes[cur].closed)
            continue;

        if (cur == end_idx)
        {
            found = 1;
            break;
        }

        search_nodes[cur].closed = 1;
        search_nodes[cur].in_open = 0;

        int adj_start = road_nodes[cur].adj_start;
        int adj_count = road_nodes[cur].adj_count;

        for (int i = 0; i < adj_count; i++)
        {
            int ni = adj_entries[adj_start + i].to_idx;
            if (search_nodes[ni].closed)
                continue;

            double edge_dist = adj_entries[adj_start + i].distance;
            double new_g = search_nodes[cur].g + edge_dist;

            if (new_g < search_nodes[ni].g)
            {
                search_nodes[ni].g = new_g;
                search_nodes[ni].h = haversine_m(
                    road_nodes[ni].lat, road_nodes[ni].lng, end_lat, end_lng);
                search_nodes[ni].f = new_g + search_nodes[ni].h;
                search_nodes[ni].parent_idx = cur;

                if (!search_nodes[ni].in_open)
                {
                    search_nodes[ni].in_open = 1;
                    pq_push(ni, search_nodes[ni].f);
                }
            }
        }
    }

    if (!found)
    {
        printf("[A*] Search failed after %d iterations (pq_size=%d)\n", iterations, pq_size);
        free(search_nodes);
        return 0;
    }

    /* 回溯路径 */
    int path_capacity = 10000;
    int *path_indices = (int *)malloc(path_capacity * sizeof(int));
    int path_len = 0;
    int cur = end_idx;

    while (cur >= 0 && path_len < path_capacity)
    {
        path_indices[path_len++] = cur;
        cur = search_nodes[cur].parent_idx;
    }

    if (path_len >= path_capacity && cur >= 0)
    {
        /* 超出路径容量 */
        free(path_indices);
        free(search_nodes);
        return 0;
    }

    /* 输出路径坐标（从起点到终点） */
    *out_lng = (double *)malloc(path_len * sizeof(double));
    *out_lat = (double *)malloc(path_len * sizeof(double));
    for (int i = 0; i < path_len; i++)
    {
        int idx = path_indices[path_len - 1 - i];
        (*out_lng)[i] = road_nodes[idx].lng;
        (*out_lat)[i] = road_nodes[idx].lat;
    }
    *out_len = path_len;

    free(path_indices);
    free(search_nodes);

    printf("[A*] Graph A*: %d iterations, path=%d nodes (%.1f km)\n",
           iterations, path_len,
           haversine_m(road_nodes[start_idx].lat, road_nodes[start_idx].lng,
                       road_nodes[end_idx].lat, road_nodes[end_idx].lng) /
               1000.0);

    return 1;
}

void road_network_stats(int *nodes, int *edges)
{
    *nodes = road_node_count;
    *edges = adj_entry_count;
}

void road_network_get_grid_cell(double lat, double lng, int *gx, int *gy)
{
    latlng_to_grid_cell(lat, lng, gx, gy);
}