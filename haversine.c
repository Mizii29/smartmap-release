#include "haversine.h"
#include <math.h>

#define EARTH_RADIUS 6371.0 // 地球平均半径，单位公里
#define PI 3.14159265358979323846

static double to_radians(double degree) {
    return degree * PI / 180.0;
}

double calculate_distance(double lat1, double lon1, double lat2, double lon2) {
    double dLat = to_radians(lat2 - lat1);
    double dLon = to_radians(lon2 - lon1);

    lat1 = to_radians(lat1);
    lat2 = to_radians(lat2);

    double a = sin(dLat / 2) * sin(dLat / 2) +
        sin(dLon / 2) * sin(dLon / 2) * cos(lat1) * cos(lat2);
    double c = 2 * atan2(sqrt(a), sqrt(1 - a));

    return EARTH_RADIUS * c;
}