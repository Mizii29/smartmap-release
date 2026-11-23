#ifndef HUFFMAN_H
#define HUFFMAN_H

int huffman_compress_text(
    const unsigned char *input,
    int input_len,
    char **out_base64,
    char **out_tree_data,
    int *original_size,
    int *compressed_size
);

int huffman_decompress_text(
    const char *base64,
    const char *tree_data,
    unsigned char **out_text,
    int *out_len
);

void huffman_free(void *ptr);

#endif