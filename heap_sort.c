#include "heap_sort.h"

static void heapify(SortNode arr[], int n, int i, int is_distance) {
    int target = i;
    int left = 2 * i + 1;
    int right = 2 * i + 2;

    if (is_distance) {
        // 距离越小越靠前：构建最大堆，排序后变成升序
        if (left < n && arr[left].value > arr[target].value) target = left;
        if (right < n && arr[right].value > arr[target].value) target = right;
    }
    else {
        // 热度越大越靠前：构建最小堆，排序后变成降序
        if (left < n && arr[left].value < arr[target].value) target = left;
        if (right < n && arr[right].value < arr[target].value) target = right;
    }

    if (target != i) {
        SortNode temp = arr[i];
        arr[i] = arr[target];
        arr[target] = temp;
        heapify(arr, n, target, is_distance);
    }
}

void heap_sort(SortNode arr[], int n, int is_distance) {
    // 1. 构建堆
    for (int i = n / 2 - 1; i >= 0; i--) {
        heapify(arr, n, i, is_distance);
    }
    // 2. 逐个提取元素到数组末尾
    for (int i = n - 1; i > 0; i--) {
        SortNode temp = arr[0];
        arr[0] = arr[i];
        arr[i] = temp;
        heapify(arr, i, 0, is_distance);
    }
}