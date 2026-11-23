#ifndef BM_SEARCH_H
#define BM_SEARCH_H

/**
 * BM (Boyer-Moore) 字符串匹配算法
 * 使用坏字符规则 + 好后缀规则
 * 平均时间复杂度优于朴素匹配
 */

#define ALPHABET_SIZE 256

/**
 * 构建坏字符表
 * @param pattern 模式串
 * @param m 模式串长度
 * @param badchar 坏字符表（输出）
 */
void build_bad_char(const char *pattern, int m, int badchar[ALPHABET_SIZE]);

/**
 * 构建好后缀表
 * @param pattern 模式串
 * @param m 模式串长度
 * @param suffix 好后缀表（输出）
 * @param prefix 前缀表（输出）
 */
void build_good_suffix(const char *pattern, int m, int *suffix, int *prefix);

/**
 * BM 字符串匹配
 * @param haystack 主串
 * @param needle 模式串
 * @return 1 表示匹配成功，0 表示未找到
 */
int bm_search(const char *haystack, const char *needle);

#endif
