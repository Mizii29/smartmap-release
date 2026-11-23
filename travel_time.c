/**
 * @file travel_time.c
 * @brief 通行时间估算算法实现
 *
 * 根据路径坐标序列估算三种交通方式的通行时间。
 * - 四环内驾车50km/h，四环外65km/h
 * - 每个拐点增加1分钟红绿灯时间
 * - 拥挤度影响驾车速度，步行/骑车仅受景区拥挤影响
 */

#include "travel_time.h"
#include <math.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

/** 地球半径 (km) */
#define EARTH_R 6371.0

static double to_rad(double deg) { return deg * M_PI / 180.0; }

/**
 * Haversine 距离 (km)
 */
static double haversine(double lat1, double lng1, double lat2, double lng2)
{
    double dlat = to_rad(lat2 - lat1);
    double dlng = to_rad(lng2 - lng1);
    double a = sin(dlat / 2) * sin(dlat / 2) +
               cos(to_rad(lat1)) * cos(to_rad(lat2)) *
               sin(dlng / 2) * sin(dlng / 2);
    double c = 2 * atan2(sqrt(a), sqrt(1 - a));
    return EARTH_R * c;
}

int is_inside_ring4(double lat, double lng)
{
    return (lat >= RING4_LAT_MIN && lat <= RING4_LAT_MAX &&
            lng >= RING4_LNG_MIN && lng <= RING4_LNG_MAX);
}

double compute_turn_angle(double lat1, double lng1,
                          double lat2, double lng2,
                          double lat3, double lng3)
{
    /* 向量 v1 = p2 - p1, v2 = p3 - p2（经纬度近似为平面） */
    double dx1 = lng2 - lng1, dy1 = lat2 - lat1;
    double dx2 = lng3 - lng2, dy2 = lat3 - lat2;

    double dot = dx1 * dx2 + dy1 * dy2;
    double cross = dx1 * dy2 - dy1 * dx2;
    double angle = atan2(fabs(cross), fabs(dot)) * 180.0 / M_PI;

    /* 返回偏转角度 (0~180) */
    return angle;
}

void compute_travel_time(const double *path_lng, const double *path_lat,
                         int path_len, double congestion_factor,
                         TravelTimeResult *result)
{
    result->driving_minutes = 0;
    result->cycling_minutes = 0;
    result->walking_minutes = 0;
    result->turn_count = 0;
    result->total_distance = 0;
    result->inner_distance = 0;
    result->outer_distance = 0;

    if (path_len < 2 || !path_lng || !path_lat)
        return;

    /* 1. 逐段计算距离，区分四环内外 */
    for (int i = 0; i < path_len - 1; i++)
    {
        double seg_dist = haversine(path_lat[i], path_lng[i],
                                    path_lat[i + 1], path_lng[i + 1]);
        result->total_distance += seg_dist;

        /* 用段中点判断是否四环内 */
        double mid_lat = (path_lat[i] + path_lat[i + 1]) / 2;
        double mid_lng = (path_lng[i] + path_lng[i + 1]) / 2;

        if (is_inside_ring4(mid_lat, mid_lng))
        {
            result->inner_distance += seg_dist;
        }
        else
        {
            result->outer_distance += seg_dist;
        }
    }

    /* 2. 统计拐点数量（方向变化 > 阈值） */
    for (int i = 1; i < path_len - 1; i++)
    {
        double angle = compute_turn_angle(
            path_lat[i - 1], path_lng[i - 1],
            path_lat[i], path_lng[i],
            path_lat[i + 1], path_lng[i + 1]);

        if (angle > TURN_ANGLE_THRESHOLD)
        {
            result->turn_count++;
        }
    }

    /* 3. 红绿灯时间（分钟） */
    double traffic_light_time = result->turn_count * TRAFFIC_LIGHT_MINUTES;

    /* 4. 驾车时间 */
    {
        /* 四环内速度 = 50 * congestion_factor, 四环外 = 65 * congestion_factor */
        double inner_speed = SPEED_DRIVING_INNER * congestion_factor;
        double outer_speed = SPEED_DRIVING_OUTER * congestion_factor;
        /* 避免除零 */
        if (inner_speed < 1.0) inner_speed = 1.0;
        if (outer_speed < 1.0) outer_speed = 1.0;

        double driving_hours = (result->inner_distance / inner_speed) +
                               (result->outer_distance / outer_speed);
        result->driving_minutes = driving_hours * 60.0 + traffic_light_time;
    }

    /* 5. 骑车时间（仅景区拥挤影响，此处用 congestion_factor 但限制下限） */
    {
        double cycling_factor = congestion_factor;
        /* 非景区时骑车不受影响，但此函数无法区分，由调用方传入合适的因子 */
        double cycling_speed = SPEED_CYCLING * cycling_factor;
        if (cycling_speed < 3.0) cycling_speed = 3.0;

        double cycling_hours = result->total_distance / cycling_speed;
        result->cycling_minutes = cycling_hours * 60.0 + traffic_light_time * 0.5;
    }

    /* 6. 步行时间（仅景区拥挤影响） */
    {
        double walking_factor = congestion_factor;
        double walking_speed = SPEED_WALKING * walking_factor;
        if (walking_speed < 2.0) walking_speed = 2.0;

        double walking_hours = result->total_distance / walking_speed;
        result->walking_minutes = walking_hours * 60.0 + traffic_light_time * 0.3;
    }
}
