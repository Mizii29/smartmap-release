#ifndef POI_H
#define POI_H

typedef struct {
    int id;
    double lat;
    double lng;
    double hotness;
    char name[256];
} POI;

typedef struct {
    int id;
    double value; // 用于存储距离或热度，作为排序权重
} SortNode;

#endif