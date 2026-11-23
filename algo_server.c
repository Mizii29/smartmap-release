/*
 * algo_server.c - 算法服务（真实路网版）
 * 集成 road_network.h/c, astar.h/c, multi_route.h/c
 * API 接口完全兼容，输入输出格式不变
 */

#include <stdio.h>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <float.h>
#include <time.h>
#include <ctype.h>
#include <windows.h>
#include <io.h>
#include <fcntl.h>

#include "road_network.h"
#include "astar.h"
#include "multi_route.h"
#include "style_recommend.h"
#include "travel_time.h"

#pragma comment(lib, "ws2_32.lib")

#define PORT 8080
#define BUFFER_SIZE 65536
#define MAX_POIS 500
#define MAX_NAME_LEN 100
#define MAX_ID_LEN 50

/* 安全追加宏：snprintf + 溢出检测 */
#define JSON_APPEND(pos, buf, bufsize, ...)                                                \
    do                                                                                     \
    {                                                                                      \
        int _written = snprintf((buf) + (pos), (bufsize) - (pos), __VA_ARGS__);            \
        if (_written < 0 || (pos) + _written >= (bufsize))                                 \
        {                                                                                  \
            fprintf(stderr, "[WARN] JSON buffer overflow at pos=%d, truncating\n", (pos)); \
            fflush(stderr);                                                                \
            (pos) = (bufsize) - 1;                                                         \
        }                                                                                  \
        else                                                                               \
        {                                                                                  \
            (pos) += _written;                                                             \
        }                                                                                  \
    } while (0)

/* 带时间戳的日志宏 */
#define LOG(fmt, ...)                                 \
    do                                                \
    {                                                 \
        time_t _t = time(NULL);                       \
        struct tm _tm;                                \
        localtime_s(&_tm, &_t);                       \
        char _ts[20];                                 \
        strftime(_ts, sizeof(_ts), "%H:%M:%S", &_tm); \
        printf("[%s] " fmt "\n", _ts, ##__VA_ARGS__); \
        fflush(stdout);                               \
    } while (0)

typedef struct
{
    int id;
    char sid[MAX_ID_LEN];
    char name[MAX_NAME_LEN];
    double lat;
    double lng;
    int hotness;
    char style[32];
} POI;

typedef struct
{
    int id;
    char type[32];
    double lat;
    double lng;
    double hotness;
} Service;

typedef struct
{
    int id;
    double value;
} SortNode;

static POI pois[MAX_POIS];
static int poi_count = 0;

static int load_pois(const char *filename)
{
    FILE *fp = fopen(filename, "rb");
    if (!fp)
    {
        fprintf(stderr, "[Load] Failed to open %s\n", filename);
        return -1;
    }
    char line[512];
    fgets(line, sizeof(line), fp);
    poi_count = 0;
    while (fgets(line, sizeof(line), fp) && poi_count < MAX_POIS)
    {
        char id[MAX_ID_LEN], name[MAX_NAME_LEN];
        double lat, lng;
        int hotness;
        if (sscanf(line, "\"%[^\"]\",\"%[^\"]\",\"%lf\",\"%lf\",\"%d\"",
                   id, name, &lat, &lng, &hotness) == 5)
        {
            pois[poi_count].id = poi_count + 1;
            strcpy(pois[poi_count].sid, id);
            strcpy(pois[poi_count].name, name);
            pois[poi_count].lat = lat;
            pois[poi_count].lng = lng;
            pois[poi_count].hotness = hotness;
            pois[poi_count].style[0] = '\0';
            poi_count++;
        }
        else if (sscanf(line, "%[^,],%[^,],%lf,%lf,%d",
                        id, name, &lat, &lng, &hotness) == 5)
        {
            pois[poi_count].id = poi_count + 1;
            strcpy(pois[poi_count].sid, id);
            strcpy(pois[poi_count].name, name);
            pois[poi_count].lat = lat;
            pois[poi_count].lng = lng;
            pois[poi_count].hotness = hotness;
            pois[poi_count].style[0] = '\0';
            poi_count++;
        }
    }
    fclose(fp);
    printf("[Load] Loaded %d POIs from %s\n", poi_count, filename);
    return 0;
}

static void heapify(SortNode arr[], int n, int i, int is_distance)
{
    int target = i;
    int left = 2 * i + 1;
    int right = 2 * i + 2;
    if (is_distance)
    {
        if (left < n && arr[left].value > arr[target].value)
            target = left;
        if (right < n && arr[right].value > arr[target].value)
            target = right;
    }
    else
    {
        if (left < n && arr[left].value < arr[target].value)
            target = left;
        if (right < n && arr[right].value < arr[target].value)
            target = right;
    }
    if (target != i)
    {
        SortNode temp = arr[i];
        arr[i] = arr[target];
        arr[target] = temp;
        heapify(arr, n, target, is_distance);
    }
}

static void heap_sort_local(SortNode arr[], int n, int is_distance)
{
    for (int i = n / 2 - 1; i >= 0; i--)
        heapify(arr, n, i, is_distance);
    for (int i = n - 1; i > 0; i--)
    {
        SortNode temp = arr[0];
        arr[0] = arr[i];
        arr[i] = temp;
        heapify(arr, i, 0, is_distance);
    }
}

void get_top_k(POI pois[], int n, double user_lat, double user_lng, int is_distance, int k, int out_ids[])
{
    SortNode *nodes = (SortNode *)malloc(n * sizeof(SortNode));
    for (int i = 0; i < n; i++)
    {
        nodes[i].id = pois[i].id;
        nodes[i].value = is_distance
                             ? calculate_distance(user_lat, user_lng, pois[i].lat, pois[i].lng)
                             : pois[i].hotness;
    }
    heap_sort_local(nodes, n, is_distance);
    int limit = (n < k) ? n : k;
    for (int i = 0; i < limit; i++)
        out_ids[i] = nodes[i].id;
    free(nodes);
}

static void send_response(SOCKET client, const char *status, const char *ctype, const char *body)
{
    char header[512];
    snprintf(header, sizeof(header), "HTTP/1.1 %s\r\nContent-Type: %s; charset=utf-8\r\nContent-Length: %d\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n",
             status, ctype, (int)strlen(body));
    send(client, header, (int)strlen(header), 0);
    send(client, body, (int)strlen(body), 0);
}

static void send_json(SOCKET client, const char *json) { send_response(client, "200 OK", "application/json", json); }

static void send_error(SOCKET client, const char *status, const char *msg)
{
    char json[256];
    snprintf(json, sizeof(json), "{\"success\": false, \"error\": \"%s\"}", msg);
    send_response(client, status, "application/json", json);
}

static char *get_query_value(char *query, const char *key, char *buf, int buf_len)
{
    buf[0] = '\0';
    if (!query)
        return buf;
    char search[64];
    snprintf(search, sizeof(search), "%s=", key);
    char *p = strstr(query, search);
    if (!p)
        return buf;
    p += strlen(search);
    int i = 0;
    while (*p && *p != '&' && i < buf_len - 1)
        buf[i++] = *p++;
    buf[i] = '\0';
    return buf;
}

static void url_decode(char *src)
{
    char *dst = src;
    while (*src)
    {
        if (*src == '%' && src[1] && src[2])
        {
            char hex[3] = {src[1], src[2], '\0'};
            *dst++ = (char)strtol(hex, NULL, 16);
            src += 3;
        }
        else if (*src == '+')
        {
            *dst++ = ' ';
            src++;
        }
        else
        {
            *dst++ = *src++;
        }
    }
    *dst = '\0';
}

static void handle_astar(SOCKET client, char *query)
{
    char buf[64];
    double startLng = atof(get_query_value(query, "startLng", buf, sizeof(buf)));
    double startLat = atof(get_query_value(query, "startLat", buf, sizeof(buf)));
    double endLng = atof(get_query_value(query, "endLng", buf, sizeof(buf)));
    double endLat = atof(get_query_value(query, "endLat", buf, sizeof(buf)));

    LOG("[A*] (%.4f,%.4f)->(%.4f,%.4f)", startLat, startLng, endLat, endLng);

    int gx1, gy1, gx2, gy2;
    road_network_get_grid_cell(startLat, startLng, &gx1, &gy1);
    road_network_get_grid_cell(endLat, endLng, &gx2, &gy2);
    int same_block = (gx1 == gx2 && gy1 == gy2);

    double *path_lng = NULL, *path_lat = NULL;
    int path_len = 0;
    double total_dist = compute_astar_path(startLat, startLng, endLat, endLng,
                                           &path_lng, &path_lat, &path_len);

    char *json = (char *)malloc(BUFFER_SIZE);
    int json_size = BUFFER_SIZE;
    int pos = 0;
    JSON_APPEND(pos, json, json_size, "{\"success\": true, \"path\": [");
    for (int i = 0; i < path_len; i++)
    {
        if (i > 0)
            JSON_APPEND(pos, json, json_size, ",");
        JSON_APPEND(pos, json, json_size, "[%.6f,%.6f]", path_lng[i], path_lat[i]);
    }
    JSON_APPEND(pos, json, json_size, "], \"distance\": %.2f}", total_dist);
    send_json(client, json);

    LOG("[A*] path_len=%d dist=%.2fkm same_block=%s (grid %d,%d -> %d,%d)",
        path_len, total_dist, same_block ? "YES" : "NO", gx1, gy1, gx2, gy2);

    free(path_lng);
    free(path_lat);
    free(json);
}

static void handle_compute(SOCKET client, char *body)
{
    double user_lat = 0, user_lng = 0;
    char sort_type[32] = {0};

    if (body && strlen(body) > 0)
    {
        sscanf(body, "%lf %lf %31s", &user_lat, &user_lng, sort_type);
    }

    int is_distance = (strcmp(sort_type, "distance") == 0) ? 1 : 0;

    typedef struct
    {
        int id;
        double lat;
        double lng;
        int hotness;
    } ReqPOI;
    ReqPOI req_pois[2000];
    int req_count = 0;

    if (body && strlen(body) > 0)
    {
        char *line_start = strchr(body, '\n');
        if (line_start)
        {
            line_start++;
            while (*line_start && req_count < 2000)
            {
                int pid;
                double plat, plng;
                int photness;
                if (sscanf(line_start, "%d %lf %lf %d", &pid, &plat, &plng, &photness) == 4)
                {
                    req_pois[req_count].id = pid;
                    req_pois[req_count].lat = plat;
                    req_pois[req_count].lng = plng;
                    req_pois[req_count].hotness = photness;
                    req_count++;
                }
                char *nl = strchr(line_start, '\n');
                if (!nl)
                    break;
                line_start = nl + 1;
            }
        }
    }

    if (req_count == 0)
    {
        if (poi_count == 0)
        {
            send_json(client, "{\"success\": true, \"data\": []}");
            return;
        }
        int top_ids[10];
        int k = (poi_count < 10) ? poi_count : 10;
        get_top_k(pois, poi_count, user_lat, user_lng, is_distance, k, top_ids);

        char *json = (char *)malloc(BUFFER_SIZE * 4);
        int json_size = BUFFER_SIZE * 4;
        int pos = 0;
        JSON_APPEND(pos, json, json_size, "{\"success\": true, \"data\": [");
        for (int i = 0; i < k; i++)
        {
            if (i > 0)
                JSON_APPEND(pos, json, json_size, ",");
            int idx = -1;
            for (int j = 0; j < poi_count; j++)
            {
                if (pois[j].id == top_ids[i])
                {
                    idx = j;
                    break;
                }
            }
            if (idx >= 0)
            {
                double dist = calculate_distance(user_lat, user_lng, pois[idx].lat, pois[idx].lng);
                JSON_APPEND(pos, json, json_size, "{\"id\":%d,\"name\":\"%s\",\"lat\":%.6f,\"lng\":%.6f,\"hotness\":%d,\"distance\":%.2f}",
                            pois[idx].id, pois[idx].name, pois[idx].lat, pois[idx].lng,
                            pois[idx].hotness, dist);
            }
        }
        JSON_APPEND(pos, json, json_size, "]}");
        send_json(client, json);
        LOG("[TopK] sort=%s n=%d k=%d (local)", sort_type, poi_count, k);
        free(json);
        return;
    }

    SortNode *nodes = (SortNode *)malloc(req_count * sizeof(SortNode));
    for (int i = 0; i < req_count; i++)
    {
        nodes[i].id = req_pois[i].id;
        nodes[i].value = is_distance
                             ? calculate_distance(user_lat, user_lng, req_pois[i].lat, req_pois[i].lng)
                             : req_pois[i].hotness;
    }
    heap_sort_local(nodes, req_count, is_distance);

    int k = (req_count < 10) ? req_count : 10;

    char *json = (char *)malloc(BUFFER_SIZE * 4);
    int json_size = BUFFER_SIZE * 4;
    int pos = 0;
    JSON_APPEND(pos, json, json_size, "{\"success\": true, \"data\": [");
    for (int i = 0; i < k; i++)
    {
        if (i > 0)
            JSON_APPEND(pos, json, json_size, ",");
        int rid = nodes[i].id;
        int ridx = -1;
        for (int j = 0; j < req_count; j++)
        {
            if (req_pois[j].id == rid)
            {
                ridx = j;
                break;
            }
        }
        if (ridx >= 0)
        {
            double dist = calculate_distance(user_lat, user_lng, req_pois[ridx].lat, req_pois[ridx].lng);
            JSON_APPEND(pos, json, json_size, "{\"id\":%d,\"lat\":%.6f,\"lng\":%.6f,\"hotness\":%d,\"distance\":%.2f}",
                        req_pois[ridx].id, req_pois[ridx].lat, req_pois[ridx].lng,
                        req_pois[ridx].hotness, dist);
        }
    }
    JSON_APPEND(pos, json, json_size, "]}");
    send_json(client, json);

    LOG("[TopK] sort=%s n=%d k=%d (gateway)", sort_type, req_count, k);
    free(nodes);
    free(json);
}

static void handle_multi_route(SOCKET client, char *query)
{
    if (!query || strlen(query) == 0)
    {
        send_error(client, "200 OK", "Missing query");
        return;
    }

    char points_str[4096] = {0};
    char *pv = strstr(query, "points=");
    if (!pv)
    {
        send_error(client, "200 OK", "Missing points parameter");
        return;
    }
    pv += 7;
    int pi = 0;
    while (*pv && *pv != '&' && pi < (int)sizeof(points_str) - 1)
        points_str[pi++] = *pv++;
    points_str[pi] = '\0';
    url_decode(points_str);

    double lats[MAX_WAYPOINTS];
    double lngs[MAX_WAYPOINTS];
    int n = 0;

    char *tok = strtok(points_str, ";");
    while (tok && n < MAX_WAYPOINTS)
    {
        double lng, lat;
        if (sscanf(tok, "%lf,%lf", &lng, &lat) == 2)
        {
            lats[n] = lat;
            lngs[n] = lng;
            n++;
        }
        tok = strtok(NULL, ";");
    }

    if (n < 2)
    {
        send_error(client, "200 OK", "Need at least 2 points");
        return;
    }

    LOG("[MultiRoute] %d points", n);

    MultiRouteResult result;
    compute_multi_route(lats, lngs, n, &result);

    char *json = (char *)malloc(BUFFER_SIZE * 4);
    int json_size = BUFFER_SIZE * 4;
    int pos = 0;
    JSON_APPEND(pos, json, json_size, "{\"success\": true, \"order\": [");
    for (int i = 0; i < result.order_count; i++)
    {
        if (i > 0)
            JSON_APPEND(pos, json, json_size, ",");
        JSON_APPEND(pos, json, json_size, "%d", result.order[i]);
    }
    JSON_APPEND(pos, json, json_size, "], \"distance\": %.2f, \"segments\": [", result.total_distance);

    for (int s = 0; s < n - 1; s++)
    {
        int from = result.order[s];
        int to = result.order[s + 1];
        double *seg_lng = NULL, *seg_lat = NULL;
        int seg_len = 0;
        double seg_dist = compute_astar_path(lats[from], lngs[from], lats[to], lngs[to],
                                             &seg_lng, &seg_lat, &seg_len);

        if (s > 0)
            JSON_APPEND(pos, json, json_size, ",");
        JSON_APPEND(pos, json, json_size, "{\"from\":%d,\"to\":%d,\"distance\":%.2f,\"path\":[", from, to, seg_dist);
        for (int i = 0; i < seg_len; i++)
        {
            if (i > 0)
                JSON_APPEND(pos, json, json_size, ",");
            JSON_APPEND(pos, json, json_size, "[%.6f,%.6f]", seg_lng[i], seg_lat[i]);
        }
        JSON_APPEND(pos, json, json_size, "]}");
        free(seg_lng);
        free(seg_lat);
    }

    JSON_APPEND(pos, json, json_size, "], \"fullPath\": [");
    for (int i = 0; i < result.full_path_len; i++)
    {
        if (i > 0)
            JSON_APPEND(pos, json, json_size, ",");
        JSON_APPEND(pos, json, json_size, "[%.6f,%.6f]", result.full_path_lng[i], result.full_path_lat[i]);
    }
    JSON_APPEND(pos, json, json_size, "]}");
    send_json(client, json);

    printf("[MultiRoute] n=%d dist=%.2fkm fullPath=%d pts order=[", n, result.total_distance, result.full_path_len);
    for (int i = 0; i < result.order_count; i++)
        printf("%s%d", i ? "," : "", result.order[i]);
    printf("]\n");
    fflush(stdout);
    free_multi_route_result(&result);
    free(json);
}

static void handle_services(SOCKET client, char *body)
{
    double user_lat = 0, user_lng = 0;

    if (body && strlen(body) > 0)
    {
        sscanf(body, "%lf %lf", &user_lat, &user_lng);
    }

    Service svcs[100];
    int svc_count = 0;

    if (body && strlen(body) > 0)
    {
        char *line_start = strchr(body, '\n');
        if (line_start)
        {
            line_start++;
            while (*line_start && svc_count < 100)
            {
                int sid;
                char stype[32] = {0};
                double slat, slng, shotness;
                if (sscanf(line_start, "%d %31s %lf %lf %lf", &sid, stype, &slat, &slng, &shotness) == 5)
                {
                    svcs[svc_count].id = sid;
                    strncpy(svcs[svc_count].type, stype, 31);
                    svcs[svc_count].type[31] = '\0';
                    svcs[svc_count].lat = slat;
                    svcs[svc_count].lng = slng;
                    svcs[svc_count].hotness = shotness;
                    svc_count++;
                }
                char *nl = strchr(line_start, '\n');
                if (!nl)
                    break;
                line_start = nl + 1;
            }
        }
    }

    if (svc_count == 0)
    {
        send_json(client, "{\"success\": true, \"services\": []}");
        return;
    }

    SortNode *nodes = (SortNode *)malloc(svc_count * sizeof(SortNode));
    for (int i = 0; i < svc_count; i++)
    {
        nodes[i].id = svcs[i].id;
        nodes[i].value = calculate_distance(user_lat, user_lng, svcs[i].lat, svcs[i].lng);
    }

    int k = (svc_count < 5) ? svc_count : 5;
    heap_sort_local(nodes, svc_count, 1);

    char *json = (char *)malloc(BUFFER_SIZE * 2);
    int json_size = BUFFER_SIZE * 2;
    int pos = 0;
    JSON_APPEND(pos, json, json_size, "{\"success\": true, \"services\": [");
    for (int i = 0; i < k; i++)
    {
        if (i > 0)
            JSON_APPEND(pos, json, json_size, ",");
        int sid = nodes[i].id;
        for (int j = 0; j < svc_count; j++)
        {
            if (svcs[j].id == sid)
            {
                JSON_APPEND(pos, json, json_size, "{\"id\":%d,\"type\":\"%s\",\"lat\":%.6f,\"lng\":%.6f,\"hotness\":%.1f,\"distance\":%.2f}",
                            svcs[j].id, svcs[j].type, svcs[j].lat, svcs[j].lng,
                            svcs[j].hotness, nodes[i].value);
                break;
            }
        }
    }
    JSON_APPEND(pos, json, json_size, "]}");
    send_json(client, json);

    LOG("[Services] user=(%.4f,%.4f) n=%d top=%d", user_lat, user_lng, svc_count, k);
    free(nodes);
    free(json);
}

/* ========== POST /api/styleRecommend - 按风格推荐 ========== */

static void handle_style_recommend(SOCKET client, char *body)
{
    if (!body || strlen(body) == 0)
    {
        send_error(client, "200 OK", "Missing body");
        return;
    }

    double user_lat = 0, user_lng = 0;
    char style[32] = {0};
    int k = 5;

    char *first_line_end = strchr(body, '\n');
    if (!first_line_end)
    {
        send_error(client, "200 OK", "Invalid format");
        return;
    }

    char first_line[256] = {0};
    int flen = (int)(first_line_end - body);
    if (flen >= (int)sizeof(first_line))
        flen = (int)sizeof(first_line) - 1;
    memcpy(first_line, body, flen);
    first_line[flen] = '\0';

    sscanf(first_line, "%lf %lf %31s %d", &user_lat, &user_lng, style, &k);
    url_decode(style);

    if (strlen(style) == 0)
    {
        send_error(client, "200 OK", "Missing style");
        return;
    }
    if (k < 1)
        k = 1;
    if (k > 8)
        k = 8;

    StylePOI *style_pois = (StylePOI *)malloc(3000 * sizeof(StylePOI));
    int sp_count = 0;

    char *line_start = first_line_end + 1;
    while (*line_start && sp_count < 3000)
    {
        int pid;
        double plat, plng;
        int photness;
        char pstyle[32] = {0};
        if (sscanf(line_start, "%d %lf %lf %d %31s", &pid, &plat, &plng, &photness, pstyle) == 5)
        {
            style_pois[sp_count].id = pid;
            style_pois[sp_count].lat = plat;
            style_pois[sp_count].lng = plng;
            style_pois[sp_count].hotness = photness;
            strncpy(style_pois[sp_count].style, pstyle, 31);
            style_pois[sp_count].style[31] = '\0';
            style_pois[sp_count].name[0] = '\0';
            style_pois[sp_count].score = 0;
            sp_count++;
        }
        char *nl = strchr(line_start, '\n');
        if (!nl)
            break;
        line_start = nl + 1;
    }

    if (sp_count == 0)
    {
        send_json(client, "{\"success\": true, \"data\": [], \"order\": []}");
        free(style_pois);
        return;
    }

    StyleRouteResult route_result;
    style_recommend_route(style_pois, sp_count, user_lat, user_lng, style, k, &route_result);

    char *json = (char *)malloc(BUFFER_SIZE * 4);
    int json_size = BUFFER_SIZE * 4;
    int pos = 0;
    JSON_APPEND(pos, json, json_size, "{\"success\": true, \"style\": \"%s\", \"count\": %d, \"totalDistance\": %.2f, \"order\": [", style, route_result.count, route_result.total_distance);

    for (int i = 0; i < route_result.count; i++)
    {
        if (i > 0)
            JSON_APPEND(pos, json, json_size, ",");
        int rid = route_result.ids[i];
        for (int j = 0; j < sp_count; j++)
        {
            if (style_pois[j].id == rid)
            {
                double dist = calculate_distance(user_lat, user_lng, style_pois[j].lat, style_pois[j].lng);
                JSON_APPEND(pos, json, json_size, "{\"id\":%d,\"lat\":%.6f,\"lng\":%.6f,\"hotness\":%.0f,\"distance\":%.2f,\"style\":\"%s\",\"score\":%.4f}",
                            style_pois[j].id, style_pois[j].lat, style_pois[j].lng,
                            style_pois[j].hotness, dist, style_pois[j].style, style_pois[j].score);
                break;
            }
        }
    }
    JSON_APPEND(pos, json, json_size, "]}");
    send_json(client, json);

    LOG("[StyleRecommend] style=%s k=%d candidates=%d route=%d dist=%.2f",
        style, k, sp_count, route_result.count, route_result.total_distance);

    free(style_pois);
    free(json);
}

/* ========== BM (Boyer-Moore) 全文检索 ========== */

#define BM_CHARSET_SIZE 256

static int utf8_char_len(unsigned char c)
{
    if (c <= 0x7F)
        return 1;
    if ((c & 0xE0) == 0xC0)
        return 2;
    if ((c & 0xF0) == 0xE0)
        return 3;
    if ((c & 0xF8) == 0xF0)
        return 4;
    return 0;
}

static int utf8_sequence_valid(const char *s, int len)
{
    unsigned char c0 = (unsigned char)s[0];
    if (len == 1)
        return c0 <= 0x7F;
    for (int i = 1; i < len; i++)
    {
        if (s[i] == '\0' || (((unsigned char)s[i] & 0xC0) != 0x80))
            return 0;
    }
    if (len == 2)
        return c0 >= 0xC2;
    if (len == 3)
    {
        unsigned char c1 = (unsigned char)s[1];
        if (c0 == 0xE0 && c1 < 0xA0)
            return 0;
        if (c0 == 0xED && c1 >= 0xA0)
            return 0;
        return 1;
    }
    if (len == 4)
    {
        unsigned char c1 = (unsigned char)s[1];
        if (c0 == 0xF0 && c1 < 0x90)
            return 0;
        if (c0 > 0xF4)
            return 0;
        if (c0 == 0xF4 && c1 > 0x8F)
            return 0;
        return 1;
    }
    return 0;
}

static int is_zero_width_utf8(const char *s)
{
    unsigned char a = (unsigned char)s[0];
    unsigned char b = (unsigned char)s[1];
    unsigned char c = (unsigned char)s[2];
    return (a == 0xE2 && b == 0x80 && (c == 0x8B || c == 0x8C || c == 0x8D)) ||
           (a == 0xEF && b == 0xBB && c == 0xBF);
}

static void sanitize_diary_search_text(char *text, int max_bytes)
{
    if (!text || max_bytes <= 1)
        return;

    char *out = (char *)malloc(max_bytes);
    if (!out)
        return;

    int pos = 0;
    char *src = text;
    while (*src && pos < max_bytes - 1)
    {
        unsigned char c = (unsigned char)*src;

        if (is_zero_width_utf8(src))
        {
            src += 3;
            continue;
        }

        if (c <= 0x7F)
        {
            src++;
            if (c < 0x20 || c == 0x7F || c == '|')
                c = ' ';
            if (isspace(c))
            {
                if (pos > 0 && out[pos - 1] != ' ')
                    out[pos++] = ' ';
                continue;
            }
            out[pos++] = (char)tolower(c);
            continue;
        }

        int len = utf8_char_len(c);
        if (len <= 1 || !utf8_sequence_valid(src, len))
        {
            src++;
            continue;
        }
        if (pos + len >= max_bytes)
            break;
        memcpy(out + pos, src, len);
        pos += len;
        src += len;
    }

    while (pos > 0 && out[pos - 1] == ' ')
        pos--;
    out[pos] = '\0';
    strncpy(text, out, max_bytes - 1);
    text[max_bytes - 1] = '\0';
    free(out);
}

static int diary_injection_score(const char *text)
{
    if (!text)
        return 0;
    int score = 0;
    if (strstr(text, "union select") || strstr(text, "drop table") ||
        strstr(text, "insert into") || strstr(text, "delete from") ||
        strstr(text, "update ") || strstr(text, " or 1=1") || strstr(text, " and 1=1"))
    {
        score += 3;
    }
    if (strstr(text, "--") || strstr(text, "/*") || strstr(text, "*/"))
        score += 2;
    if (strstr(text, "<script") || strstr(text, "javascript:") || strstr(text, "<iframe") || strstr(text, "<svg"))
        score += 3;
    if (strstr(text, "{{") || strstr(text, "}}") || strstr(text, "${") || strstr(text, "<%") || strstr(text, "%>"))
        score += 2;
    if (strstr(text, "prompt injection") || strstr(text, "ignore previous") || strstr(text, "jailbreak"))
        score += 2;

    int len = 0;
    int special = 0;
    for (const char *p = text; *p; p++)
    {
        unsigned char c = (unsigned char)*p;
        if (c <= 0x7F)
        {
            len++;
            if (strchr("<>{};'\"\\$`", c))
                special++;
        }
    }
    if (len > 0 && special * 100 / len > 35)
        score += 2;
    return score;
}

static void json_escape_copy(const char *src, char *dst, int dst_size)
{
    if (!dst || dst_size <= 0)
        return;
    int pos = 0;
    if (!src)
    {
        dst[0] = '\0';
        return;
    }
    while (*src && pos < dst_size - 1)
    {
        unsigned char c = (unsigned char)*src++;
        if ((c == '"' || c == '\\') && pos < dst_size - 2)
        {
            dst[pos++] = '\\';
            dst[pos++] = (char)c;
        }
        else if (c < 0x20 || c == 0x7F)
        {
            if (pos < dst_size - 1)
                dst[pos++] = ' ';
        }
        else
        {
            dst[pos++] = (char)c;
        }
    }
    dst[pos] = '\0';
}

static void bm_build_bad_char(const char *pattern, int pat_len, int bad_char[BM_CHARSET_SIZE])
{
    for (int i = 0; i < BM_CHARSET_SIZE; i++)
        bad_char[i] = pat_len;
    for (int i = 0; i < pat_len - 1; i++)
        bad_char[(unsigned char)pattern[i]] = pat_len - 1 - i;
}

static int bm_search(const char *text, int text_len, const char *pattern, int pat_len)
{
    if (pat_len == 0 || text_len < pat_len)
        return 0;

    int bad_char[BM_CHARSET_SIZE];
    bm_build_bad_char(pattern, pat_len, bad_char);

    int shift = 0;
    while (shift <= text_len - pat_len)
    {
        int j = pat_len - 1;
        while (j >= 0 && pattern[j] == text[shift + j])
            j--;
        if (j < 0)
            return 1;
        int bc = bad_char[(unsigned char)text[shift + j]];
        shift += (bc > 1) ? bc : 1;
    }
    return 0;
}

/* ========== POST /api/diarySearch - 日记 BM 全文检索 ========== */

static void handle_diary_search(SOCKET client, char *body)
{
    if (!body || strlen(body) == 0)
    {
        send_json(client, "{\"success\": true, \"results\": []}");
        return;
    }

    char keyword[256] = {0};
    char *kb = strstr(body, "keyword=");
    if (!kb)
    {
        send_json(client, "{\"success\": true, \"results\": []}");
        return;
    }
    kb += 8;
    char *ke = kb;
    while (*ke && *ke != '&' && *ke != '\r' && *ke != '\n')
        ke++;
    int klen = (int)(ke - kb);
    if (klen >= (int)sizeof(keyword))
        klen = (int)sizeof(keyword) - 1;
    memcpy(keyword, kb, klen);
    keyword[klen] = '\0';

    url_decode(keyword);
    sanitize_diary_search_text(keyword, sizeof(keyword));

    if (strlen(keyword) == 0)
    {
        send_json(client, "{\"success\": true, \"results\": []}");
        return;
    }
    if (diary_injection_score(keyword) >= 3)
    {
        send_error(client, "400 Bad Request", "Unsafe diary search keyword");
        return;
    }

    int pat_len = (int)strlen(keyword);

    typedef struct
    {
        int id;
        char title[256];
        char content[4096];
        char style[64];
        char scenic_spot[128];
        int match_count;
    } DiaryEntry;

    DiaryEntry entries[200];
    int entry_count = 0;

    char *line = strstr(body, "\n");
    if (!line)
    {
        send_json(client, "{\"success\": true, \"results\": []}");
        return;
    }
    line++;

    while (*line && entry_count < 200)
    {
        int eid;
        char etitle[256] = {0}, econtent[4096] = {0}, estyle[64] = {0}, espot[128] = {0};
        int fields = sscanf(line, "%d|%255[^|]|%4095[^|]|%63[^|]|%127[^\r\n]",
                            &eid, etitle, econtent, estyle, espot);
        if (fields >= 3)
        {
            entries[entry_count].id = eid;
            strncpy(entries[entry_count].title, etitle, 255);
            entries[entry_count].title[255] = '\0';
            strncpy(entries[entry_count].content, econtent, 4095);
            entries[entry_count].content[4095] = '\0';
            strncpy(entries[entry_count].style, fields >= 4 ? estyle : "默认", 63);
            entries[entry_count].style[63] = '\0';
            strncpy(entries[entry_count].scenic_spot, fields >= 5 ? espot : "默认", 127);
            entries[entry_count].scenic_spot[127] = '\0';
            sanitize_diary_search_text(entries[entry_count].title, sizeof(entries[entry_count].title));
            sanitize_diary_search_text(entries[entry_count].content, sizeof(entries[entry_count].content));
            sanitize_diary_search_text(entries[entry_count].style, sizeof(entries[entry_count].style));
            sanitize_diary_search_text(entries[entry_count].scenic_spot, sizeof(entries[entry_count].scenic_spot));
            entries[entry_count].match_count = 0;
            entry_count++;
        }
        char *nl = strchr(line, '\n');
        if (!nl)
            break;
        line = nl + 1;
    }

    int result_ids[200];
    int result_count = 0;

    for (int i = 0; i < entry_count; i++)
    {
        int found = 0;
        if (bm_search(entries[i].title, (int)strlen(entries[i].title), keyword, pat_len))
        {
            found = 1;
            entries[i].match_count += 2;
        }
        if (bm_search(entries[i].content, (int)strlen(entries[i].content), keyword, pat_len))
        {
            found = 1;
            entries[i].match_count += 1;
        }
        if (bm_search(entries[i].style, (int)strlen(entries[i].style), keyword, pat_len))
        {
            found = 1;
            entries[i].match_count += 3;
        }
        if (bm_search(entries[i].scenic_spot, (int)strlen(entries[i].scenic_spot), keyword, pat_len))
        {
            found = 1;
            entries[i].match_count += 3;
        }
        if (found)
            result_ids[result_count++] = i;
    }

    for (int i = 0; i < result_count - 1; i++)
    {
        for (int j = i + 1; j < result_count; j++)
        {
            if (entries[result_ids[j]].match_count > entries[result_ids[i]].match_count)
            {
                int tmp = result_ids[i];
                result_ids[i] = result_ids[j];
                result_ids[j] = tmp;
            }
        }
    }

    char *json = (char *)malloc(BUFFER_SIZE * 4);
    int json_size = BUFFER_SIZE * 4;
    int pos = 0;
    JSON_APPEND(pos, json, json_size, "{\"success\": true, \"total\": %d, \"results\": [", result_count);
    for (int i = 0; i < result_count && i < 50; i++)
    {
        DiaryEntry *e = &entries[result_ids[i]];
        char safe_title[512];
        char safe_style[128];
        char safe_spot[256];
        json_escape_copy(e->title, safe_title, sizeof(safe_title));
        json_escape_copy(e->style, safe_style, sizeof(safe_style));
        json_escape_copy(e->scenic_spot, safe_spot, sizeof(safe_spot));
        if (i > 0)
            JSON_APPEND(pos, json, json_size, ",");
        JSON_APPEND(pos, json, json_size, "{\"id\":%d,\"title\":\"%s\",\"style\":\"%s\",\"scenicSpot\":\"%s\",\"matchScore\":%d}",
                    e->id, safe_title, safe_style, safe_spot, e->match_count);
    }
    JSON_APPEND(pos, json, json_size, "]}");
    send_json(client, json);

    LOG("[DiarySearch] keyword='%s' entries=%d matches=%d", keyword, entry_count, result_count);
    free(json);
}

static volatile int g_running = 1;

BOOL WINAPI console_handler(DWORD signal)
{
    printf("\nShutting down...\n");
    fflush(stdout);
    g_running = 0;
    return TRUE;
}

/**
 * POST /api/travelTime
 * 请求体 JSON: { "path": [[lng,lat],...], "congestionFactor": 0.7 }
 * 返回: { "success": true, "driving": xx.x, "cycling": xx.x, "walking": xx.x, "turnCount": n, "distance": xx.xx, "innerDist": xx.xx, "outerDist": xx.xx }
 */
static void handle_travel_time(SOCKET client, char *body)
{
    if (!body || strlen(body) == 0)
    {
        send_error(client, "400 Bad Request", "Empty body");
        return;
    }

    /* 解析 path 数组 */
    double *lngs = NULL, *lats = NULL;
    int point_count = 0;
    double congestion_factor = 1.0;

    /* 简易 JSON 解析：提取 path 数组和 congestionFactor */
    /* 找 "path": [ */
    char *p = strstr(body, "\"path\"");
    if (!p)
    {
        send_error(client, "400 Bad Request", "Missing path");
        return;
    }

    /* 找 congestionFactor */
    char *cf = strstr(body, "\"congestionFactor\"");
    if (cf)
    {
        char *val = strchr(cf, ':');
        if (val)
        {
            val++;
            while (*val == ' ' || *val == '\t' || *val == '\n' || *val == '\r')
                val++;
            congestion_factor = atof(val);
            if (congestion_factor <= 0)
                congestion_factor = 1.0;
            if (congestion_factor > 1.0)
                congestion_factor = 1.0;
        }
    }

    /* 计算点数量：数 [ 的个数 */
    char *arr_start = strchr(p, '[');
    if (!arr_start)
    {
        send_error(client, "400 Bad Request", "Invalid path array");
        return;
    }
    // arr_start 指向外层 [，如 [[lng1,lat1],[lng2,lat2],...]]

    /* 先计数：通过嵌套深度正确统计内层数组个数 */
    int count = 0;
    int depth = 0;
    char *scan = arr_start;
    while (*scan)
    {
        if (*scan == '[')
        {
            depth++;
            if (depth == 2)
                count++; // 只统计内层 [
        }
        else if (*scan == ']')
        {
            depth--;
            if (depth == 0)
                break; // 外层 ]，计数结束
        }
        scan++;
    }

    if (count < 2)
    {
        send_error(client, "400 Bad Request", "Path too short");
        return;
    }

    lngs = (double *)malloc(count * sizeof(double));
    lats = (double *)malloc(count * sizeof(double));

    /* 解析每个 [lng,lat] */
    scan = arr_start;
    scan++; // 跳过外层 [
    int idx = 0;
    while (*scan && idx < count)
    {
        if (*scan == '[')
        {
            scan++;
            lngs[idx] = atof(scan);
            char *comma = strchr(scan, ',');
            if (comma)
            {
                comma++;
                lats[idx] = atof(comma);
            }
            idx++;
        }
        scan++;
    }
    point_count = idx;

    /* 调用算法 */
    TravelTimeResult result;
    compute_travel_time(lngs, lats, point_count, congestion_factor, &result);

    /* 构造响应 JSON */
    char json[1024];
    snprintf(json, sizeof(json),
             "{\"success\": true, \"driving\": %.1f, \"cycling\": %.1f, \"walking\": %.1f, "
             "\"turnCount\": %d, \"distance\": %.2f, \"innerDist\": %.2f, \"outerDist\": %.2f}",
             result.driving_minutes, result.cycling_minutes, result.walking_minutes,
             result.turn_count, result.total_distance, result.inner_distance, result.outer_distance);

    LOG("[TravelTime] pts=%d turns=%d dist=%.2fkm driving=%.1fmin cycling=%.1fmin walking=%.1fmin",
        point_count, result.turn_count, result.total_distance,
        result.driving_minutes, result.cycling_minutes, result.walking_minutes);

    send_json(client, json);

    free(lngs);
    free(lats);
}

int main()
{
    SetConsoleCtrlHandler(console_handler, TRUE);

    SetConsoleOutputCP(CP_UTF8);
    SetConsoleCP(CP_UTF8);
    _setmode(_fileno(stdout), _O_BINARY);
    _setmode(_fileno(stderr), _O_BINARY);

    if (load_pois("beijing_hot_pois.csv") != 0)
    {
        fprintf(stderr, "Fatal: Cannot load POI data. Exiting.\n");
        return 1;
    }

    if (road_network_load("road_network/road_nodes.csv", "road_network/road_edges.csv") != 0)
    {
        fprintf(stderr, "Warning: Cannot load road network. Pathfinding will use fallback.\n");
    }

    int rn_nodes = 0, rn_edges = 0;
    road_network_stats(&rn_nodes, &rn_edges);

    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0)
    {
        printf("WSAStartup failed: %d\n", WSAGetLastError());
        fflush(stdout);
        return 1;
    }

    SOCKET server_socket = socket(AF_INET, SOCK_STREAM, 0);
    if (server_socket == INVALID_SOCKET)
    {
        printf("Socket failed: %d\n", WSAGetLastError());
        fflush(stdout);
        WSACleanup();
        return 1;
    }

    int opt = 1;
    setsockopt(server_socket, SOL_SOCKET, SO_REUSEADDR, (const char *)&opt, sizeof(opt));

    struct sockaddr_in server_addr;
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    server_addr.sin_port = htons(PORT);

    if (bind(server_socket, (struct sockaddr *)&server_addr, sizeof(server_addr)) == SOCKET_ERROR)
    {
        printf("Bind failed on port %d: %d\n", PORT, WSAGetLastError());
        fflush(stdout);
        closesocket(server_socket);
        WSACleanup();
        return 1;
    }

    if (listen(server_socket, 10) == SOCKET_ERROR)
    {
        printf("Listen failed: %d\n", WSAGetLastError());
        fflush(stdout);
        closesocket(server_socket);
        WSACleanup();
        return 1;
    }

    printf("=========================================\n");
    printf("[C/C++ Algo Service] Running (Real Road Network A*)\n");
    printf("Port: http://localhost:%d\n", PORT);
    printf("Loaded POIs: %d\n", poi_count);
    printf("Road Network: %d nodes, %d adj entries\n", rn_nodes, rn_edges);
    printf("Routes:\n");
    printf("  GET  /api/astar        - A* pathfinding (road network)\n");
    printf("  POST /api/compute       - TopK recommend\n");
    printf("  POST /api/services      - Travel services search\n");
    printf("  GET  /api/multiRoute    - Multi-point route (NN+2-opt)\n");
    printf("  POST /api/diarySearch   - Diary BM full-text search\n");
    printf("  POST /api/styleRecommend - Style-based POI recommendation\n");
    printf("  POST /api/travelTime     - Travel time estimation (3 modes)\n");
    printf("Ctrl+C to quit\n");
    printf("=========================================\n");
    fflush(stdout);

    u_long mode = 1;
    ioctlsocket(server_socket, FIONBIO, &mode);

    while (g_running)
    {
        struct sockaddr_in client_addr;
        int client_len = sizeof(client_addr);
        SOCKET client = accept(server_socket, (struct sockaddr *)&client_addr, &client_len);

        if (client == INVALID_SOCKET)
        {
            DWORD err = WSAGetLastError();
            if (err == WSAEWOULDBLOCK)
            {
                Sleep(50);
                continue;
            }
            if (!g_running)
                break;
            continue;
        }

        char *buffer = (char *)malloc(BUFFER_SIZE);
        if (!buffer)
        {
            closesocket(client);
            continue;
        }
        memset(buffer, 0, BUFFER_SIZE);
        int total = 0, bytes;
        DWORD timeout = 3000;
        setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, (const char *)&timeout, sizeof(timeout));

        while (total < BUFFER_SIZE - 1)
        {
            bytes = recv(client, buffer + total, BUFFER_SIZE - 1 - total, 0);
            if (bytes <= 0)
                break;
            total += bytes;
            if (strstr(buffer, "\r\n\r\n"))
            {
                char *cl = strstr(buffer, "Content-Length: ");
                if (cl)
                {
                    int clen = atoi(cl + 16);
                    char *body_start = strstr(buffer, "\r\n\r\n") + 4;
                    if (total - (body_start - buffer) >= clen)
                        break;
                }
                else
                    break;
            }
        }
        buffer[total] = '\0';
        if (total == 0)
        {
            free(buffer);
            closesocket(client);
            continue;
        }

        char method[16] = {0}, path[512] = {0};
        sscanf(buffer, "%15s %511s", method, path);
        char *q = strchr(path, '?');
        if (q)
        {
            *q = '\0';
            q++;
        }

        if (strcmp(method, "GET") == 0 && strcmp(path, "/api/astar") == 0)
        {
            handle_astar(client, q);
        }
        else if (strcmp(method, "POST") == 0 && strcmp(path, "/api/compute") == 0)
        {
            char *body = strstr(buffer, "\r\n\r\n");
            if (body)
                body += 4;
            handle_compute(client, body);
        }
        else if (strcmp(method, "POST") == 0 && strcmp(path, "/api/services") == 0)
        {
            char *body = strstr(buffer, "\r\n\r\n");
            if (body)
                body += 4;
            handle_services(client, body);
        }
        else if (strcmp(method, "GET") == 0 && strcmp(path, "/api/multiRoute") == 0)
        {
            handle_multi_route(client, q);
        }
        else if (strcmp(method, "POST") == 0 && strcmp(path, "/api/diarySearch") == 0)
        {
            char *body = strstr(buffer, "\r\n\r\n");
            if (body)
                body += 4;
            handle_diary_search(client, body);
        }
        else if (strcmp(method, "POST") == 0 && strcmp(path, "/api/styleRecommend") == 0)
        {
            char *body = strstr(buffer, "\r\n\r\n");
            if (body)
                body += 4;
            handle_style_recommend(client, body);
        }
        else if (strcmp(method, "POST") == 0 && strcmp(path, "/api/travelTime") == 0)
        {
            char *body = strstr(buffer, "\r\n\r\n");
            if (body)
                body += 4;
            handle_travel_time(client, body);
        }
        else
        {
            send_error(client, "404 Not Found", "Route not found");
        }
        free(buffer);
        closesocket(client);
    }

    closesocket(server_socket);
    WSACleanup();
    printf("Service stopped.\n");
    fflush(stdout);
    return 0;
}
