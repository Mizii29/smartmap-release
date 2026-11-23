#include "recommend.h"
#include "haversine.h"
#include "heap_sort.h"
#include "bm_search.h"
#include <stdlib.h>

void get_top_k(POI pois[], int n, double user_lat, double user_lng, int is_distance, int k, int out_ids[])
{
    SortNode *nodes = (SortNode *)malloc(n * sizeof(SortNode));

    for (int i = 0; i < n; i++)
    {
        nodes[i].id = pois[i].id;
        if (is_distance)
        {
            nodes[i].value = calculate_distance(user_lat, user_lng, pois[i].lat, pois[i].lng);
        }
        else
        {
            nodes[i].value = pois[i].hotness;
        }
    }

    heap_sort(nodes, n, is_distance);

    int limit = (n < k) ? n : k;
    for (int i = 0; i < limit; i++)
    {
        out_ids[i] = nodes[i].id;
    }

    free(nodes);
}

int search_pois(POI pois[], int n, const char *keyword, int out_ids[])
{
    int count = 0;
    for (int i = 0; i < n; i++)
    {
        if (bm_search(pois[i].name, keyword))
        {
            out_ids[count++] = pois[i].id;
        }
    }
    return count;
}