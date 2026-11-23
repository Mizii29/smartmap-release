#ifndef MULTI_ROUTE_H
#define MULTI_ROUTE_H

#define MAX_WAYPOINTS 20

typedef struct
{
    int order[MAX_WAYPOINTS];
    int order_count;
    double total_distance;
    double *full_path_lng;
    double *full_path_lat;
    int full_path_len;
} MultiRouteResult;

void compute_multi_route(double lats[], double lngs[], int n, MultiRouteResult *result);

void free_multi_route_result(MultiRouteResult *result);

#endif
