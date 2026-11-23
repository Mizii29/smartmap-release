/**
 * @file huffman.c
 * @brief Huffman 无损压缩算法
 *
 * 构建哈夫曼树，对游记文本进行无损压缩，减少存储空间。
 * 压缩格式为 "HUF1:<频率表>|<Base64 编码数据>"。
 *
 * 核心流程：
 * 1. 统计字符频率
 * 2. 构建最小堆，每次取出频率最小的两个节点合并
 * 3. 从哈夫曼树生成每个字符的变长编码
 * 4. 将编码位流打包为字节数组，Base64 编码输出
 *
 * 解压流程：
 * 1. 解析频率表，重建哈夫曼树
 * 2. 逐位遍历编码数据，从根节点走到叶子节点还原字符
 */

#include "huffman.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/**
 * @brief 哈夫曼树节点
 */
typedef struct HuffmanNode
{
    int value; /* 字符值（叶子节点）或 -1（内部节点） */
    int freq;  /* 字符频率或子树频率和 */
    struct HuffmanNode *left;
    struct HuffmanNode *right;
} HuffmanNode;

/** Base64 编码表 */
static const char BASE64_TABLE[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * @brief 字符串深拷贝辅助函数
 */
static char *dup_string(const char *src)
{
    size_t len = strlen(src);
    char *out = (char *)malloc(len + 1);
    if (!out)
        return NULL;
    memcpy(out, src, len + 1);
    return out;
}

/**
 * @brief 创建哈夫曼树节点
 */
static HuffmanNode *create_node(int value, int freq, HuffmanNode *left, HuffmanNode *right)
{
    HuffmanNode *node = (HuffmanNode *)malloc(sizeof(HuffmanNode));
    if (!node)
        return NULL;
    node->value = value;
    node->freq = freq;
    node->left = left;
    node->right = right;
    return node;
}

/**
 * @brief 递归释放哈夫曼树
 */
static void free_tree(HuffmanNode *node)
{
    if (!node)
        return;
    free_tree(node->left);
    free_tree(node->right);
    free(node);
}

/**
 * @brief 最小堆（优先队列），用于构建哈夫曼树
 */
typedef struct
{
    HuffmanNode *data[256];
    int size;
} MinHeap;

/**
 * @brief 交换堆中两个节点指针
 */
static void heap_swap(HuffmanNode **a, HuffmanNode **b)
{
    HuffmanNode *tmp = *a;
    *a = *b;
    *b = tmp;
}

/**
 * @brief 堆上浮操作：维护最小堆性质
 */
static void heap_sift_up(MinHeap *heap, int idx)
{
    while (idx > 0)
    {
        int parent = (idx - 1) / 2;
        if (heap->data[parent]->freq <= heap->data[idx]->freq)
            break;
        heap_swap(&heap->data[parent], &heap->data[idx]);
        idx = parent;
    }
}

/**
 * @brief 堆下沉操作：维护最小堆性质
 */
static void heap_sift_down(MinHeap *heap, int idx)
{
    while (1)
    {
        int left = 2 * idx + 1;
        int right = 2 * idx + 2;
        int smallest = idx;

        if (left < heap->size && heap->data[left]->freq < heap->data[smallest]->freq)
            smallest = left;
        if (right < heap->size && heap->data[right]->freq < heap->data[smallest]->freq)
            smallest = right;

        if (smallest == idx)
            break;

        heap_swap(&heap->data[idx], &heap->data[smallest]);
        idx = smallest;
    }
}

/**
 * @brief 向堆中插入节点
 */
static int heap_push(MinHeap *heap, HuffmanNode *node)
{
    if (!heap || !node || heap->size >= 256)
        return 0;
    heap->data[heap->size] = node;
    heap_sift_up(heap, heap->size);
    heap->size++;
    return 1;
}

/**
 * @brief 弹出堆顶（频率最小的节点）
 */
static HuffmanNode *heap_pop(MinHeap *heap)
{
    if (!heap || heap->size <= 0)
        return NULL;

    HuffmanNode *out = heap->data[0];
    heap->size--;
    if (heap->size > 0)
    {
        heap->data[0] = heap->data[heap->size];
        heap_sift_down(heap, 0);
    }
    return out;
}

/**
 * @brief 释放堆中所有树节点
 */
static void heap_free_all_trees(MinHeap *heap)
{
    if (!heap)
        return;
    for (int i = 0; i < heap->size; i++)
        free_tree(heap->data[i]);
    heap->size = 0;
}

/**
 * @brief 从字符频率表构建哈夫曼树
 *
 * 算法：
 * 1. 将所有出现过的字符作为叶子节点加入最小堆
 * 2. 每次取出频率最小的两个节点，合并为一个内部节点
 * 3. 将合并后的节点重新入堆
 * 4. 重复直到堆中只剩一个节点，即为哈夫曼树根节点
 */
static HuffmanNode *build_tree_from_freq(const int freq[256])
{
    MinHeap heap;
    heap.size = 0;

    /* 将所有出现过的字符作为叶子节点入堆 */
    for (int i = 0; i < 256; i++)
    {
        if (freq[i] > 0)
        {
            HuffmanNode *leaf = create_node(i, freq[i], NULL, NULL);
            if (!leaf || !heap_push(&heap, leaf))
            {
                if (leaf)
                    free(leaf);
                heap_free_all_trees(&heap);
                return NULL;
            }
        }
    }

    if (heap.size == 0)
        return NULL;

    /* 不断合并频率最小的两个节点，直到只剩一个 */
    while (heap.size > 1)
    {
        HuffmanNode *left = heap_pop(&heap);
        HuffmanNode *right = heap_pop(&heap);
        HuffmanNode *parent = create_node(-1, left->freq + right->freq, left, right);
        if (!parent)
        {
            free_tree(left);
            free_tree(right);
            heap_free_all_trees(&heap);
            return NULL;
        }
        if (!heap_push(&heap, parent))
        {
            free_tree(parent);
            heap_free_all_trees(&heap);
            return NULL;
        }
    }

    return heap_pop(&heap);
}

/**
 * @brief 从哈夫曼树生成每个字符的编码
 *
 * 左子树编码为 '0'，右子树编码为 '1'。
 * 递归遍历整棵树，到达叶子节点时记录完整编码路径。
 * 特殊情况：只有一个字符时，编码为 "0"。
 */
static void build_codes(
    HuffmanNode *node,
    char path[256],
    int depth,
    char codes[256][256],
    int code_lens[256])
{
    if (!node)
        return;

    if (!node->left && !node->right)
    {
        /* 叶子节点：记录编码 */
        if (depth == 0)
        {
            path[0] = '0';
            depth = 1;
        }

        memcpy(codes[node->value], path, depth);
        codes[node->value][depth] = '\0';
        code_lens[node->value] = depth;
        return;
    }

    /* 左子树编码为 '0' */
    path[depth] = '0';
    build_codes(node->left, path, depth + 1, codes, code_lens);

    /* 右子树编码为 '1' */
    path[depth] = '1';
    build_codes(node->right, path, depth + 1, codes, code_lens);
}

/**
 * @brief 将频率表序列化为逗号分隔的字符串，用于存储和传输
 */
static char *serialize_freq_table(const int freq[256])
{
    int capacity = 4096;
    char *buf = (char *)malloc(capacity);
    if (!buf)
        return NULL;

    int pos = 0;
    for (int i = 0; i < 256; i++)
    {
        pos += sprintf(buf + pos, "%d", freq[i]);
        if (i != 255)
            pos += sprintf(buf + pos, ",");
    }
    buf[pos] = '\0';
    return buf;
}

/**
 * @brief 从逗号分隔字符串解析频率表
 */
static int parse_freq_table(const char *meta, int freq[256])
{
    char *copy = dup_string(meta);
    if (!copy)
        return 0;

    int index = 0;
    char *token = strtok(copy, ",");
    while (token && index < 256)
    {
        freq[index++] = atoi(token);
        token = strtok(NULL, ",");
    }

    free(copy);
    return index == 256;
}

/**
 * @brief 获取 Base64 字符对应的索引值
 */
static int base64_char_index(char c)
{
    if (c >= 'A' && c <= 'Z')
        return c - 'A';
    if (c >= 'a' && c <= 'z')
        return c - 'a' + 26;
    if (c >= '0' && c <= '9')
        return c - '0' + 52;
    if (c == '+')
        return 62;
    if (c == '/')
        return 63;
    return -1;
}

/**
 * @brief Base64 编码：将字节数组编码为 Base64 字符串
 */
static char *base64_encode(const unsigned char *data, int input_len)
{
    if (input_len <= 0)
        return dup_string("");

    int output_len = 4 * ((input_len + 2) / 3);
    char *encoded = (char *)malloc(output_len + 1);
    if (!encoded)
        return NULL;

    int i = 0, j = 0;
    while (i < input_len)
    {
        unsigned int octet_a = i < input_len ? data[i++] : 0;
        unsigned int octet_b = i < input_len ? data[i++] : 0;
        unsigned int octet_c = i < input_len ? data[i++] : 0;

        unsigned int triple = (octet_a << 16) | (octet_b << 8) | octet_c;

        encoded[j++] = BASE64_TABLE[(triple >> 18) & 0x3F];
        encoded[j++] = BASE64_TABLE[(triple >> 12) & 0x3F];
        encoded[j++] = BASE64_TABLE[(triple >> 6) & 0x3F];
        encoded[j++] = BASE64_TABLE[triple & 0x3F];
    }

    /* 添加填充字符 '=' */
    int mod = input_len % 3;
    if (mod == 1)
    {
        encoded[output_len - 1] = '=';
        encoded[output_len - 2] = '=';
    }
    else if (mod == 2)
    {
        encoded[output_len - 1] = '=';
    }

    encoded[output_len] = '\0';
    return encoded;
}

/**
 * @brief Base64 解码：将 Base64 字符串解码为字节数组
 */
static unsigned char *base64_decode(const char *input, int *out_len)
{
    int len = (int)strlen(input);
    if (len == 0)
    {
        *out_len = 0;
        return (unsigned char *)malloc(1);
    }

    if (len % 4 != 0)
        return NULL;

    int padding = 0;
    if (len >= 1 && input[len - 1] == '=')
        padding++;
    if (len >= 2 && input[len - 2] == '=')
        padding++;

    int decoded_len = (len / 4) * 3 - padding;
    unsigned char *decoded = (unsigned char *)malloc(decoded_len > 0 ? decoded_len : 1);
    if (!decoded)
        return NULL;

    int i = 0, j = 0;
    while (i < len)
    {
        int sextet_a = input[i] == '=' ? 0 : base64_char_index(input[i]);
        int sextet_b = input[i + 1] == '=' ? 0 : base64_char_index(input[i + 1]);
        int sextet_c = input[i + 2] == '=' ? 0 : base64_char_index(input[i + 2]);
        int sextet_d = input[i + 3] == '=' ? 0 : base64_char_index(input[i + 3]);

        if (sextet_a < 0 || sextet_b < 0 || sextet_c < 0 || sextet_d < 0)
        {
            free(decoded);
            return NULL;
        }

        unsigned int triple = (sextet_a << 18) | (sextet_b << 12) | (sextet_c << 6) | sextet_d;

        if (j < decoded_len)
            decoded[j++] = (triple >> 16) & 0xFF;
        if (j < decoded_len)
            decoded[j++] = (triple >> 8) & 0xFF;
        if (j < decoded_len)
            decoded[j++] = triple & 0xFF;

        i += 4;
    }

    *out_len = decoded_len;
    return decoded;
}

/**
 * @brief 压缩文本数据
 *
 * 对输入的字节数组进行 Huffman 无损压缩。
 *
 * 压缩流程：
 * 1. 统计每个字符的出现频率
 * 2. 将频率表序列化为字符串（用于解压时重建哈夫曼树）
 * 3. 构建哈夫曼树，生成每个字符的变长编码
 * 4. 将编码位流打包为字节数组
 * 5. 对打包数据进行 Base64 编码，便于 JSON 传输
 *
 * @param input          输入数据
 * @param input_len      输入数据长度
 * @param out_base64     输出：Base64 编码的压缩数据（调用者负责 free）
 * @param out_tree_data  输出：频率表字符串（调用者负责 free）
 * @param original_size  输出：原始数据大小
 * @param compressed_size 输出：压缩后数据大小
 * @return 1 表示成功，0 表示失败
 */
int huffman_compress_text(
    const unsigned char *input,
    int input_len,
    char **out_base64,
    char **out_tree_data,
    int *original_size,
    int *compressed_size)
{
    if (!input || input_len < 0 || !out_base64 || !out_tree_data || !original_size || !compressed_size)
        return 0;

    /* 步骤1：统计字符频率 */
    int freq[256] = {0};
    for (int i = 0; i < input_len; i++)
    {
        freq[input[i]]++;
    }

    *original_size = input_len;
    *out_tree_data = serialize_freq_table(freq);
    if (!*out_tree_data)
        return 0;

    /* 步骤2：构建哈夫曼树 */
    HuffmanNode *root = build_tree_from_freq(freq);
    if (!root)
    {
        *compressed_size = 0;
        *out_base64 = dup_string("");
        return *out_base64 != NULL;
    }

    /* 步骤3：生成每个字符的 Huffman 编码 */
    char codes[256][256] = {{0}};
    int code_lens[256] = {0};
    char path[256] = {0};
    build_codes(root, path, 0, codes, code_lens);

    /* 计算总位数 */
    long long total_bits = 0;
    for (int i = 0; i < 256; i++)
    {
        if (freq[i] > 0 && code_lens[i] > 0)
        {
            total_bits += (long long)freq[i] * code_lens[i];
        }
    }

    /* 步骤4：将编码位流打包为字节数组 */
    int packed_len = (int)((total_bits + 7) / 8);
    unsigned char *packed = (unsigned char *)calloc(packed_len > 0 ? packed_len : 1, 1);
    if (!packed)
    {
        free_tree(root);
        free(*out_tree_data);
        return 0;
    }

    int bit_pos = 0;
    for (int i = 0; i < input_len; i++)
    {
        unsigned char b = input[i];
        for (int k = 0; k < code_lens[b]; k++)
        {
            if (codes[b][k] == '1')
            {
                packed[bit_pos / 8] |= (1 << (7 - (bit_pos % 8)));
            }
            bit_pos++;
        }
    }

    /* 步骤5：Base64 编码 */
    *compressed_size = packed_len;
    *out_base64 = base64_encode(packed, packed_len);

    free(packed);
    free_tree(root);

    if (!*out_base64)
    {
        free(*out_tree_data);
        return 0;
    }

    return 1;
}

/**
 * @brief 解压文本数据
 *
 * 从 Base64 编码的压缩数据和频率表中还原原始文本。
 *
 * 解压流程：
 * 1. 解析频率表，重建哈夫曼树
 * 2. Base64 解码得到压缩位流
 * 3. 逐位遍历位流，从哈夫曼树根节点走到叶子节点还原字符
 * 4. 特殊处理：只有一个字符的情况
 *
 * @param base64    Base64 编码的压缩数据
 * @param tree_data 频率表字符串
 * @param out_text  输出：解压后的文本（调用者负责 free）
 * @param out_len   输出：解压后文本长度
 * @return 1 表示成功，0 表示失败
 */
int huffman_decompress_text(
    const char *base64,
    const char *tree_data,
    unsigned char **out_text,
    int *out_len)
{
    if (!base64 || !tree_data || !out_text || !out_len)
        return 0;

    /* 步骤1：解析频率表 */
    int freq[256] = {0};
    if (!parse_freq_table(tree_data, freq))
        return 0;

    /* 计算期望的输出长度 */
    int expected_len = 0;
    for (int i = 0; i < 256; i++)
        expected_len += freq[i];

    *out_len = expected_len;
    *out_text = (unsigned char *)malloc(expected_len + 1);
    if (!*out_text)
        return 0;

    if (expected_len == 0)
    {
        (*out_text)[0] = '\0';
        return 1;
    }

    /* 步骤2：重建哈夫曼树 */
    HuffmanNode *root = build_tree_from_freq(freq);
    if (!root)
    {
        free(*out_text);
        return 0;
    }

    /* 特殊处理：只有一个字符的情况 */
    if (!root->left && !root->right)
    {
        for (int i = 0; i < expected_len; i++)
            (*out_text)[i] = (unsigned char)root->value;
        (*out_text)[expected_len] = '\0';
        free_tree(root);
        return 1;
    }

    /* 步骤3：Base64 解码得到压缩位流 */
    int packed_len = 0;
    unsigned char *packed = base64_decode(base64, &packed_len);
    if (!packed)
    {
        free_tree(root);
        free(*out_text);
        return 0;
    }

    /* 步骤4：逐位遍历，从根节点走到叶子节点还原字符 */
    int produced = 0;
    HuffmanNode *cur = root;

    for (int i = 0; i < packed_len && produced < expected_len; i++)
    {
        for (int bit = 7; bit >= 0 && produced < expected_len; bit--)
        {
            int value = (packed[i] >> bit) & 1;
            cur = value ? cur->right : cur->left;

            if (!cur)
            {
                free(packed);
                free_tree(root);
                free(*out_text);
                return 0;
            }

            /* 到达叶子节点，还原一个字符 */
            if (!cur->left && !cur->right)
            {
                (*out_text)[produced++] = (unsigned char)cur->value;
                cur = root;
            }
        }
    }

    (*out_text)[expected_len] = '\0';

    free(packed);
    free_tree(root);

    return produced == expected_len;
}

/**
 * @brief 释放 Huffman 相关动态内存的通用函数
 */
void huffman_free(void *ptr)
{
    free(ptr);
}
