/**
 * @file multi_route.c
 * @brief 最近邻 + 2-opt 启发式多点路径规划算法
 *
 * 用于多景点游览路线规划，分两阶段：
 * 1. 最近邻启发式：从起点出发，每次选择最近的未访问点，快速生成初始路径
 * 2. 2-opt 局部优化：对初始路径进行边交换优化，消除交叉路段，提升路径质量
 *
 * 输入：多个景点的经纬度坐标
 * 输出：最优访问顺序 + 完整路径坐标序列 + 总距离
 */

#include "multi_route.h"
#include "astar.h"
#include <stdlib.h>
#include <string.h>
#include <float.h>

/**
 * @brief 计算距离矩阵中的一个条目（调用 A* 获取实际路网距离）
 */
static double compute_dist_matrix_entry(double lat1, double lng1, double lat2, double lng2)
{
    double *seg_lng = NULL, *seg_lat = NULL;
    int seg_len = 0;
    double d = compute_astar_path(lat1, lng1, lat2, lng2, &seg_lng, &seg_lat, &seg_len);
    free(seg_lng);
    free(seg_lat);
    return d;
}

/**
 * @brief 多点路径规划主函数
 *
 * 输入 n 个景点的经纬度，输出最优访问顺序和完整路径。
 *
 * 算法流程：
 * 1. 构建距离矩阵：调用 A* 计算每对景点间的路网距离
 * 2. 最近邻启发式：从景点 0 出发，贪心选择最近未访问点
 * 3. 2-opt 优化：枚举所有边对 (i,j)，若反转 i~j 段能缩短总距离则执行反转
 * 4. 拼接完整路径：按优化后的顺序，逐段调用 A* 生成详细路径坐标
 *
 * @param lats     景点纬度数组
 * @param lngs     景点经度数组
 * @param n        景点数量
 * @param result   输出结果结构体（调用者负责 free_multi_route_result）
 */
void compute_multi_route(double lats[], double lngs[], int n, MultiRouteResult *result)
{
    memset(result, 0, sizeof(MultiRouteResult));
    result->order_count = n;

    /* 步骤1：构建对称距离矩阵 */
    double dist_matrix[MAX_WAYPOINTS][MAX_WAYPOINTS];
    for (int i = 0; i < n; i++)
        for (int j = 0; j < n; j++)
            dist_matrix[i][j] = 0;

    for (int i = 0; i < n; i++)
    {
        for (int j = i + 1; j < n; j++)
        {
            double d = compute_dist_matrix_entry(lats[i], lngs[i], lats[j], lngs[j]);
            dist_matrix[i][j] = d;
            dist_matrix[j][i] = d;
        }
    }

    /* 步骤2：最近邻启发式生成初始路径 */
    int order[MAX_WAYPOINTS];
    order[0] = 0;
    int visited[MAX_WAYPOINTS] = {0};
    visited[0] = 1;
    for (int i = 1; i < n; i++)
    {
        int last = order[i - 1];
        int best = -1;
        double best_d = DBL_MAX;
        for (int j = 0; j < n; j++)
        {
            if (!visited[j] && dist_matrix[last][j] < best_d)
            {
                best_d = dist_matrix[last][j];
                best = j;
            }
        }
        if (best >= 0)
        {
            order[i] = best;
            visited[best] = 1;
        }
    }

    /* 步骤3：2-opt 局部优化，消除交叉路段 */
    int improved = 1;
    while (improved)
    {
        improved = 0;
        for (int i = 1; i < n - 1; i++)
        {
            for (int j = i + 1; j < n; j++)
            {
                /* 计算反转前的边距离 */
                double d_before = 0;
                if (i > 0)
                    d_before += dist_matrix[order[i - 1]][order[i]];
                if (j < n - 1)
                    d_before += dist_matrix[order[j]][order[j + 1]];

                /* 计算反转后的边距离 */
                double d_after = 0;
                if (i > 0)
                    d_after += dist_matrix[order[i - 1]][order[j]];
                if (j < n - 1)
                    d_after += dist_matrix[order[i]][order[j + 1]];

                /* 若反转能缩短距离，则执行反转 */
                if (d_after < d_before - 0.001)
                {
                    int lo = i, hi = j;
                    while (lo < hi)
                    {
                        int tmp = order[lo];
                        order[lo] = order[hi];
                        order[hi] = tmp;
                        lo++;
                        hi--;
                    }
                    improved = 1;
                }
            }
        }
    }

    /* 保存优化后的访问顺序 */
    memcpy(result->order, order, n * sizeof(int));

    /* 计算总距离 */
    result->total_distance = 0;
    for (int i = 1; i < n; i++)
        result->total_distance += dist_matrix[order[i - 1]][order[i]];

    /* 步骤4：按优化顺序拼接完整路径坐标 */
    int all_cap = 4096;
    result->full_path_lng = (double *)malloc(all_cap * sizeof(double));
    result->full_path_lat = (double *)malloc(all_cap * sizeof(double));
    result->full_path_len = 0;

    for (int s = 0; s < n - 1; s++)
    {
        int from = order[s];
        int to = order[s + 1];
        double *seg_lng = NULL, *seg_lat = NULL;
        int seg_len = 0;
        compute_astar_path(lats[from], lngs[from], lats[to], lngs[to],
                           &seg_lng, &seg_lat, &seg_len);

        if (seg_len > 0)
        {
            /* 跳过重复的起点（第一段除外） */
            int start_idx = (s == 0) ? 0 : 1;
            int need = result->full_path_len + (seg_len - start_idx);
            if (need > all_cap)
            {
                all_cap = need + 4096;
                result->full_path_lng = (double *)realloc(result->full_path_lng, all_cap * sizeof(double));
                result->full_path_lat = (double *)realloc(result->full_path_lat, all_cap * sizeof(double));
            }
            for (int i = start_idx; i < seg_len; i++)
            {
                result->full_path_lng[result->full_path_len] = seg_lng[i];
                result->full_path_lat[result->full_path_len] = seg_lat[i];
                result->full_path_len++;
            }
        }
        free(seg_lng);
        free(seg_lat);
    }
}

/**
 * @brief 释放多点路径结果中的动态内存
 */
void free_multi_route_result(MultiRouteResult *result)
{
    if (result->full_path_lng)
    {
        free(result->full_path_lng);
        result->full_path_lng = NULL;
    }
    if (result->full_path_lat)
    {
        free(result->full_path_lat);
        result->full_path_lat = NULL;
    }
    result->full_path_len = 0;
}
