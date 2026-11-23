#include "bm_search.h"
#include <string.h>
#include <stdlib.h>

void build_bad_char(const char *pattern, int m, int badchar[ALPHABET_SIZE])
{
    for (int i = 0; i < ALPHABET_SIZE; i++)
    {
        badchar[i] = -1;
    }
    for (int i = 0; i < m; i++)
    {
        badchar[(unsigned char)pattern[i]] = i;
    }
}

void build_good_suffix(const char *pattern, int m, int *suffix, int *prefix)
{
    for (int i = 0; i < m; i++)
    {
        suffix[i] = -1;
        prefix[i] = 0;
    }

    for (int i = 0; i < m - 1; i++)
    {
        int j = i;
        int k = 0;
        while (j >= 0 && pattern[j] == pattern[m - 1 - k])
        {
            j--;
            k++;
            suffix[k] = j + 1;
        }
        if (j == -1)
        {
            prefix[k] = 1;
        }
    }
}

int bm_search(const char *haystack, const char *needle)
{
    if (!haystack || !needle)
        return 0;
    if (!*needle)
        return 1;

    int n = (int)strlen(haystack);
    int m = (int)strlen(needle);

    if (m > n)
        return 0;

    int badchar[ALPHABET_SIZE];
    int *suffix = (int *)malloc(m * sizeof(int));
    int *prefix = (int *)malloc(m * sizeof(int));

    build_bad_char(needle, m, badchar);
    build_good_suffix(needle, m, suffix, prefix);

    int i = 0;
    int found = 0;

    while (i <= n - m)
    {
        int j = m - 1;

        while (j >= 0 && needle[j] == haystack[i + j])
        {
            j--;
        }

        if (j < 0)
        {
            found = 1;
            break;
        }

        int bad_char_shift = j - badchar[(unsigned char)haystack[i + j]];
        int good_suffix_shift = 0;

        if (j < m - 1)
        {
            good_suffix_shift = m - 1 - suffix[m - 1 - j];
            if (suffix[m - 1 - j] == -1)
            {
                int k = m - 2 - j;
                while (k >= 0 && !prefix[k + 1])
                {
                    k--;
                }
                if (k >= 0)
                {
                    good_suffix_shift = m - 1 - (k + 1);
                }
                else
                {
                    good_suffix_shift = 0;
                }
            }
        }

        i += (bad_char_shift > good_suffix_shift) ? bad_char_shift : good_suffix_shift;
    }

    free(suffix);
    free(prefix);

    return found;
}
