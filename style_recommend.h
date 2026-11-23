#ifndef STYLE_RECOMMEND_H
#define STYLE_RECOMMEND_H

#define MAX_STYLE_LEN 32
#define MAX_STYLE_POIS 600
#define MAX_ROUTE_POIS 8

typedef struct
{
    int id;
    char name[256];
    double lat;
    double lng;
    double hotness;
    char style[MAX_STYLE_LEN];
    double score;
} StylePOI;

typedef struct
{
    int ids[MAX_ROUTE_POIS];
    int count;
    double total_distance;
    double total_score;
} StyleRouteResult;

void style_recommend_score(StylePOI pois[], int n, double user_lat, double user_lng,
                           const char *style, int k, int out_ids[]);

void style_recommend_route(StylePOI pois[], int n, double user_lat, double user_lng,
                           const char *style, int k, StyleRouteResult *result);

#endif
