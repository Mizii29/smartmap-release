#ifndef RECOMMEND_H
#define RECOMMEND_H
#include "poi.h"

void get_top_k(POI pois[], int n, double user_lat, double user_lng, int is_distance, int k, int out_ids[]);
int search_pois(POI pois[], int n, const char *keyword, int out_ids[]);

#endif