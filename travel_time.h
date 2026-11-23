/**
 * @file travel_time.h
 * @brief 通行时间估算算法
 *
 * 根据路径坐标序列、交通方式、拥挤度规则估算通行时间。
 * 核心逻辑：
 * - 四环内外不同基础速度（驾车：内50km/h，外65km/h）
 * - 拐点（方向变化）增加1分钟红绿灯时间
 * - 拥挤度因子 = base_congestion × time_rule_factor
 * - 步行/骑车仅受景区拥挤影响
 */

#ifndef TRAVEL_TIME_H
#define TRAVEL_TIME_H

/** 交通方式枚举 */
typedef enum
{
    TRANSPORT_DRIVING = 0,
    TRANSPORT_CYCLING = 1,
    TRANSPORT_WALKING = 2
} TransportMode;

/** 四环边界（北京） */
#define RING4_LAT_MIN 39.85
#define RING4_LAT_MAX 40.02
#define RING4_LNG_MIN 116.28
#define RING4_LNG_MAX 116.49

/** 各交通方式理想速度 (km/h) */
#define SPEED_DRIVING_INNER 50.0
#define SPEED_DRIVING_OUTER 65.0
#define SPEED_CYCLING 20.0
#define SPEED_WALKING 5.0

/** 拐点红绿灯时间 (分钟) */
#define TRAFFIC_LIGHT_MINUTES 1.0

/** 拐点检测角度阈值（度） */
#define TURN_ANGLE_THRESHOLD 30.0

/**
 * @brief 三种交通方式的时间估算结果
 */
typedef struct
{
    double driving_minutes;  /**< 驾车预计时间（分钟） */
    double cycling_minutes;  /**< 骑车预计时间（分钟） */
    double walking_minutes;  /**< 步行预计时间（分钟） */
    int turn_count;          /**< 拐点数量 */
    double total_distance;   /**< 总距离 (km) */
    double inner_distance;   /**< 四环内距离 (km) */
    double outer_distance;   /**< 四环外距离 (km) */
} TravelTimeResult;

/**
 * @brief 判断坐标点是否在四环内
 * @param lat 纬度
 * @param lng 经度
 * @return 1=四环内, 0=四环外
 */
int is_inside_ring4(double lat, double lng);

/**
 * @brief 计算三个点之间的转角（度）
 * @param lat1, lng1 第一个点
 * @param lat2, lng2 中间点（拐点）
 * @param lat3, lng3 第三个点
 * @return 转角度数 (0~180)
 */
double compute_turn_angle(double lat1, double lng1,
                          double lat2, double lng2,
                          double lat3, double lng3);

/**
 * @brief 估算三种交通方式的通行时间
 *
 * @param path_lng  路径经度数组
 * @param path_lat  路径纬度数组
 * @param path_len  路径点数量
 * @param congestion_factor  全局拥挤因子 (0,1]，1.0=畅通
 * @param result    输出：时间估算结果
 */
void compute_travel_time(const double *path_lng, const double *path_lat,
                         int path_len, double congestion_factor,
                         TravelTimeResult *result);

#endif /* TRAVEL_TIME_H */
