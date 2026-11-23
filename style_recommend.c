/*
 * style_recommend.c - 按风格推荐算法
 *
 * 算法设计：
 * 1. 筛选：从所有景点中筛选出匹配目标风格的景点
 * 2. 综合评分：score = W_hotness * normalized_hotness + W_proximity * normalized_proximity
 *    - 热度权重 W_hotness = 0.4：优先推荐高热度景点
 *    - 距离权重 W_proximity = 0.6：优先推荐距用户较近的景点（距离近更方便游览）
 *    - 归一化方式：hotness_norm = (h - h_min) / (h_max - h_min)
 *                  dist_norm = 1 - (d - d_min) / (d_max - d_min)（距离越近分越高）
 * 3. 路线优化：从 TopK 候选中，使用最近邻贪心算法安排游览顺序
 *    - 起点为用户位置
 *    - 每次选择距当前点最近的未访问景点
 *    - 使得路线尽可能是一条线而非来回折返
 */

#include "style_recommend.h"
#include "haversine.h"
#include <stdlib.h>
#include <string.h>
#include <math.h>

#define W_HOTNESS 0.4
#define W_PROXIMITY 0.6

static double normalize(double val, double min_val, double max_val)
{
    if (max_val <= min_val)
        return 1.0;
    return (val - min_val) / (max_val - min_val);
}

void style_recommend_score(StylePOI pois[], int n, double user_lat, double user_lng,
                           const char *style, int k, int out_ids[])
{
    StylePOI *filtered = (StylePOI *)malloc(n * sizeof(StylePOI));
    int fcount = 0;

    for (int i = 0; i < n; i++)
    {
        if (strcmp(pois[i].style, style) == 0)
        {
            filtered[fcount++] = pois[i];
        }
    }

    if (fcount == 0)
    {
        free(filtered);
        return;
    }

    double h_min = 1e9, h_max = -1e9;
    double d_min = 1e9, d_max = -1e9;

    for (int i = 0; i < fcount; i++)
    {
        double dist = calculate_distance(user_lat, user_lng, filtered[i].lat, filtered[i].lng);
        filtered[i].score = dist;
        if (filtered[i].hotness < h_min)
            h_min = filtered[i].hotness;
        if (filtered[i].hotness > h_max)
            h_max = filtered[i].hotness;
        if (dist < d_min)
            d_min = dist;
        if (dist > d_max)
            d_max = dist;
    }

    for (int i = 0; i < fcount; i++)
    {
        double dist = filtered[i].score;
        double h_norm = normalize(filtered[i].hotness, h_min, h_max);
        double d_norm = 1.0 - normalize(dist, d_min, d_max);
        filtered[i].score = W_HOTNESS * h_norm + W_PROXIMITY * d_norm;
    }

    for (int i = 0; i < fcount - 1; i++)
    {
        for (int j = i + 1; j < fcount; j++)
        {
            if (filtered[j].score > filtered[i].score)
            {
                StylePOI tmp = filtered[i];
                filtered[i] = filtered[j];
                filtered[j] = tmp;
            }
        }
    }

    int limit = fcount < k ? fcount : k;
    for (int i = 0; i < limit; i++)
    {
        out_ids[i] = filtered[i].id;
    }

    free(filtered);
}

void style_recommend_route(StylePOI pois[], int n, double user_lat, double user_lng,
                           const char *style, int k, StyleRouteResult *result)
{
    memset(result, 0, sizeof(StyleRouteResult));

    int top_ids[MAX_STYLE_POIS];
    style_recommend_score(pois, n, user_lat, user_lng, style, k > MAX_ROUTE_POIS ? k : MAX_ROUTE_POIS, top_ids);

    StylePOI *candidates = (StylePOI *)malloc(n * sizeof(StylePOI));
    int cand_count = 0;

    int limit = n < k ? n : k;
    for (int i = 0; i < limit; i++)
    {
        for (int j = 0; j < n; j++)
        {
            if (pois[j].id == top_ids[i])
            {
                candidates[cand_count++] = pois[j];
                break;
            }
        }
    }

    if (cand_count == 0)
    {
        free(candidates);
        return;
    }

    int route_count = cand_count < MAX_ROUTE_POIS ? cand_count : MAX_ROUTE_POIS;
    int visited[MAX_ROUTE_POIS] = {0};
    int route[MAX_ROUTE_POIS];
    double cur_lat = user_lat, cur_lng = user_lng;
    double total_dist = 0;

    for (int step = 0; step < route_count; step++)
    {
        int best = -1;
        double best_dist = 1e9;
        for (int i = 0; i < cand_count; i++)
        {
            if (visited[i])
                continue;
            double d = calculate_distance(cur_lat, cur_lng, candidates[i].lat, candidates[i].lng);
            if (d < best_dist)
            {
                best_dist = d;
                best = i;
            }
        }
        if (best < 0)
            break;
        visited[best] = 1;
        route[step] = best;
        total_dist += best_dist;
        cur_lat = candidates[best].lat;
        cur_lng = candidates[best].lng;
    }

    result->count = route_count;
    result->total_distance = total_dist;
    result->total_score = 0;
    for (int i = 0; i < route_count; i++)
    {
        result->ids[i] = candidates[route[i]].id;
        result->total_score += candidates[route[i]].score;
    }

    free(candidates);
}
