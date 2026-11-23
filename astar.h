#ifndef ASTAR_H
#define ASTAR_H

double calculate_distance(double lat1, double lon1, double lat2, double lon2);

double compute_astar_path(double startLat, double startLng,
                          double endLat, double endLng,
                          double **out_lng, double **out_lat, int *out_len);

#endif
