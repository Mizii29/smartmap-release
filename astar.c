/**
 * @file astar.c
 * @brief A* 单点最短路径规划算法
 *
 * 结合 Dijkstra 的可靠性与贪心搜索的效率，
 * 使用欧几里得距离作为启发函数 h(n)，保证找到最优路径。
 *
 * 核心流程：
 * 1. 将起点/终点映射到路网网格单元
 * 2. 在路网节点上运行 A* 搜索
 * 3. 将起点/终点连接到最近路网节点
 * 4. 返回完整路径坐标序列和总距离
 */

#include "astar.h"
#include "road_network.h"
#include <math.h>
#include <stdlib.h>
#include <string.h>

/** 地球半径（千米），用于 Haversine 距离计算 */
#define EARTH_RADIUS_KM 6371.0
/** 圆周率 */
#define PI 3.14159265358979323846

/**
 * @brief 角度转弧度
 */
static double to_radians(double degree) { return degree * PI / 180.0; }

/**
 * @brief 计算两个经纬度坐标之间的 Haversine 大圆距离
 * @param lat1 起点纬度
 * @param lon1 起点经度
 * @param lat2 终点纬度
 * @param lon2 终点经度
 * @return 两点间距离（千米）
 */
double calculate_distance(double lat1, double lon1, double lat2, double lon2)
{
    double dLat = to_radians(lat2 - lat1);
    double dLon = to_radians(lon2 - lon1);
    lat1 = to_radians(lat1);
    lat2 = to_radians(lat2);
    double a = sin(dLat / 2) * sin(dLat / 2) +
               sin(dLon / 2) * sin(dLon / 2) * cos(lat1) * cos(lat2);
    double c = 2 * atan2(sqrt(a), sqrt(1 - a));
    return EARTH_RADIUS_KM * c;
}

/**
 * @brief A* 单点路径规划主函数
 *
 * 从起点到终点计算最优路径，返回路径坐标序列和总距离。
 * 处理三种情况：
 * - 起点终点在同一网格：直接返回直线距离
 * - 找不到路网节点：返回直线距离作为降级方案
 * - 正常情况：调用路网 A* 搜索，拼接起点/终点到路网的连接段
 *
 * @param startLat  起点纬度
 * @param startLng  起点经度
 * @param endLat    终点纬度
 * @param endLng    终点经度
 * @param out_lng   输出：路径经度数组（调用者负责 free）
 * @param out_lat   输出：路径纬度数组（调用者负责 free）
 * @param out_len   输出：路径点数量
 * @return 路径总距离（千米）
 */
double compute_astar_path(double startLat, double startLng,
                          double endLat, double endLng,
                          double **out_lng, double **out_lat, int *out_len)
{
    *out_len = 0;
    *out_lng = NULL;
    *out_lat = NULL;

    /* 将起点/终点映射到路网网格单元 */
    int gx1, gy1, gx2, gy2;
    road_network_get_grid_cell(startLat, startLng, &gx1, &gy1);
    road_network_get_grid_cell(endLat, endLng, &gx2, &gy2);

    /* 情况1：起点终点在同一网格，直接返回直线距离 */
    if (gx1 == gx2 && gy1 == gy2)
    {
        double dist = calculate_distance(startLat, startLng, endLat, endLng);
        *out_lng = (double *)malloc(2 * sizeof(double));
        *out_lat = (double *)malloc(2 * sizeof(double));
        (*out_lng)[0] = startLng;
        (*out_lat)[0] = startLat;
        (*out_lng)[1] = endLng;
        (*out_lat)[1] = endLat;
        *out_len = 2;
        return dist;
    }

    /* 查找最近的路网节点 */
    int start_node = road_network_find_nearest(startLat, startLng);
    int end_node = road_network_find_nearest(endLat, endLng);

    /* 情况2：找不到路网节点，降级为直线距离 */
    if (start_node < 0 || end_node < 0)
    {
        double dist = calculate_distance(startLat, startLng, endLat, endLng);
        *out_lng = (double *)malloc(2 * sizeof(double));
        *out_lat = (double *)malloc(2 * sizeof(double));
        (*out_lng)[0] = startLng;
        (*out_lat)[0] = startLat;
        (*out_lng)[1] = endLng;
        (*out_lat)[1] = endLat;
        *out_len = 2;
        return dist;
    }

    /* 在路网上运行 A* 搜索 */
    double *road_lng = NULL, *road_lat = NULL;
    int road_len = 0;
    int found = road_network_astar(start_node, end_node, &road_lng, &road_lat, &road_len);

    /* 情况3：A* 未找到路径，降级为直线距离 */
    if (!found || road_len == 0)
    {
        double dist = calculate_distance(startLat, startLng, endLat, endLng);
        *out_lng = (double *)malloc(2 * sizeof(double));
        *out_lat = (double *)malloc(2 * sizeof(double));
        (*out_lng)[0] = startLng;
        (*out_lat)[0] = startLat;
        (*out_lng)[1] = endLng;
        (*out_lat)[1] = endLat;
        *out_len = 2;
        if (road_lng)
            free(road_lng);
        if (road_lat)
            free(road_lat);
        return dist;
    }

    /* 判断是否需要添加起点/终点到路网的连接段（距离 > 5 米时添加） */
    int need_start = (calculate_distance(startLat, startLng,
                                         road_nodes[start_node].lat, road_nodes[start_node].lng) > 0.005);
    int need_end = (calculate_distance(endLat, endLng,
                                       road_nodes[end_node].lat, road_nodes[end_node].lng) > 0.005);
    int total = (need_start ? 1 : 0) + road_len + (need_end ? 1 : 0);

    /* 分配输出数组并拼接完整路径 */
    *out_lng = (double *)malloc(total * sizeof(double));
    *out_lat = (double *)malloc(total * sizeof(double));
    int idx = 0;

    if (need_start)
    {
        (*out_lng)[idx] = startLng;
        (*out_lat)[idx] = startLat;
        idx++;
    }
    for (int i = 0; i < road_len; i++)
    {
        (*out_lng)[idx] = road_lng[i];
        (*out_lat)[idx] = road_lat[i];
        idx++;
    }
    if (need_end)
    {
        (*out_lng)[idx] = endLng;
        (*out_lat)[idx] = endLat;
        idx++;
    }
    *out_len = idx;

    /* 计算路径总距离 */
    double dist = 0;
    for (int i = 1; i < idx; i++)
        dist += calculate_distance((*out_lat)[i - 1], (*out_lng)[i - 1], (*out_lat)[i], (*out_lng)[i]);

    free(road_lng);
    free(road_lat);
    return dist;
}
