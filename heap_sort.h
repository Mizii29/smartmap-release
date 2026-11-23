#ifndef HEAP_SORT_H
#define HEAP_SORT_H
#include "poi.h"

// is_distance: 1 表示按距离升序 (构建最大堆)，0 表示按热度降序 (构建最小堆)
void heap_sort(SortNode arr[], int n, int is_distance);

#endif