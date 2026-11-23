/**
 * road_network.h - 真实路网 A* 路径规划
 *
 * 从 road_network/road_nodes.csv 和 road_edges.csv 加载北京路网，
 * 构建图邻接表，实现基于真实道路的 A* 路径搜索。
 */

#ifndef ROAD_NETWORK_H
#define ROAD_NETWORK_H

#ifdef __cplusplus
extern "C"
{
#endif

/* ---------- 常量 ---------- */
#define MAX_ROAD_NODES 350000
#define MAX_ROAD_EDGES 400000
#define MAX_ADJ_ENTRIES 800000 /* 双向图，最多约 2*边数 */
#define GRID_SPATIAL_SIZE 100  /* 空间索引网格大小 */

    /* ---------- 数据结构 ---------- */
    typedef struct
    {
        long long id; /* OSM 节点 ID */
        double lat;
        double lng;
        int adj_start; /* 邻接表起始索引（在 adj_entries 中） */
        int adj_count; /* 邻接边数 */
    } RoadNode;

    typedef struct
    {
        int to_idx;      /* 目标节点在 road_nodes 中的索引 */
        double distance; /* 米 */
    } AdjEntry;

    /* A* 搜索节点 */
    typedef struct
    {
        int node_idx;
        double g;       /* 起点到当前点的实际距离 */
        double h;       /* 启发式（到终点的估计距离） */
        double f;       /* g + h */
        int parent_idx; /* 前驱节点索引 */
        int in_open;
        int closed;
    } AStarSearchNode;

    /* ---------- 全局变量 ---------- */
    extern RoadNode road_nodes[MAX_ROAD_NODES];
    extern AdjEntry adj_entries[MAX_ADJ_ENTRIES];
    extern int road_node_count;
    extern int adj_entry_count;

    /* 空间索引：网格 -> 节点索引列表 */
    extern int spatial_grid[GRID_SPATIAL_SIZE][GRID_SPATIAL_SIZE];
    extern int spatial_nodes[MAX_ROAD_NODES]; /* 展平的网格节点列表 */

    /* ---------- 函数声明 ---------- */

    /**
     * 加载路网数据
     * @param nodes_csv  nodes CSV 文件路径
     * @param edges_csv  edges CSV 文件路径
     * @return 0=成功, -1=失败
     */
    int road_network_load(const char *nodes_csv, const char *edges_csv);

    /**
     * 查找最近的路上节点
     * @param lat 纬度
     * @param lng 经度
     * @return 节点索引（-1 表示未找到）
     */
    int road_network_find_nearest(double lat, double lng);

    /**
     * A* 路径搜索
     * @param start_idx 起点节点索引
     * @param end_idx   终点节点索引
     * @param out_lng   输出路径经度数组（需 free）
     * @param out_lat   输出路径纬度数组（需 free）
     * @param out_len   输出路径长度
     * @return 1=找到路径, 0=未找到
     */
    int road_network_astar(int start_idx, int end_idx,
                           double **out_lng, double **out_lat, int *out_len);

    /**
     * 获取路网统计信息
     */
    void road_network_stats(int *nodes, int *edges);

    /**
     * 查询坐标所在的网格单元索引（用于同区块判断）
     * @param lat 纬度
     * @param lng 经度
     * @param gx 输出：x 方向网格索引
     * @param gy 输出：y 方向网格索引
     */
    void road_network_get_grid_cell(double lat, double lng, int *gx, int *gy);

#ifdef __cplusplus
}
#endif

#endif /* ROAD_NETWORK_H */