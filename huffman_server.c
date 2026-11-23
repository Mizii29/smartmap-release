#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <io.h>
#include <fcntl.h>

#include "huffman.h"

#pragma comment(lib, "ws2_32.lib")

#define DEFAULT_PORT 8081
#define MAX_BODY_BYTES (1024 * 1024)
#define MAX_HEADER_BYTES 8192

static void send_bytes(SOCKET client, const char *status, const char *ctype, const unsigned char *body, int body_len)
{
    char header[512];
    int header_len = snprintf(
        header,
        sizeof(header),
        "HTTP/1.1 %s\r\n"
        "Content-Type: %s; charset=utf-8\r\n"
        "Content-Length: %d\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Access-Control-Allow-Headers: Content-Type\r\n"
        "Access-Control-Allow-Methods: POST, OPTIONS\r\n"
        "Connection: close\r\n"
        "\r\n",
        status,
        ctype,
        body_len);

    if (header_len < 0)
        return;
    send(client, header, header_len, 0);
    if (body_len > 0)
        send(client, (const char *)body, body_len, 0);
}

static void send_json(SOCKET client, const char *status, const char *json)
{
    send_bytes(client, status, "application/json", (const unsigned char *)json, (int)strlen(json));
}

static void send_error_json(SOCKET client, const char *status, const char *msg)
{
    char buf[512];
    int n = snprintf(buf, sizeof(buf), "{\"success\":false,\"error\":\"%s\"}", msg ? msg : "error");
    if (n < 0)
        return;
    send_bytes(client, status, "application/json", (const unsigned char *)buf, n);
}

static const char *find_header_case_insensitive(const char *headers, const char *key)
{
    size_t key_len = strlen(key);
    const char *p = headers;
    while (*p)
    {
        const char *line_end = strstr(p, "\r\n");
        size_t line_len = line_end ? (size_t)(line_end - p) : strlen(p);
        if (line_len >= key_len)
        {
            int match = 1;
            for (size_t i = 0; i < key_len; i++)
            {
                char a = p[i];
                char b = key[i];
                if (a >= 'A' && a <= 'Z')
                    a = (char)(a - 'A' + 'a');
                if (b >= 'A' && b <= 'Z')
                    b = (char)(b - 'A' + 'a');
                if (a != b)
                {
                    match = 0;
                    break;
                }
            }
            if (match)
                return p;
        }
        if (!line_end)
            break;
        p = line_end + 2;
    }
    return NULL;
}

static int parse_content_length(const char *headers, int *out_len)
{
    const char *p = find_header_case_insensitive(headers, "content-length:");
    if (!p)
        return 0;
    p += strlen("content-length:");
    while (*p == ' ' || *p == '\t')
        p++;
    long v = strtol(p, NULL, 10);
    if (v < 0 || v > INT_MAX)
        return 0;
    *out_len = (int)v;
    return 1;
}

static int content_type_is_json(const char *headers)
{
    const char *p = find_header_case_insensitive(headers, "content-type:");
    if (!p)
        return 0;
    const char *line_end = strstr(p, "\r\n");
    size_t len = line_end ? (size_t)(line_end - p) : strlen(p);
    const char *val = p + strlen("content-type:");
    while (val < p + (int)len && (*val == ' ' || *val == '\t'))
        val++;
    const char *needle = "application/json";
    size_t needle_len = strlen(needle);
    for (size_t i = 0; i + needle_len <= len; i++)
    {
        size_t base = (size_t)(val - p) + i;
        if (base + needle_len > len)
            break;
        int match = 1;
        for (size_t j = 0; j < needle_len; j++)
        {
            char a = p[base + j];
            char b = needle[j];
            if (a >= 'A' && a <= 'Z')
                a = (char)(a - 'A' + 'a');
            if (b >= 'A' && b <= 'Z')
                b = (char)(b - 'A' + 'a');
            if (a != b)
            {
                match = 0;
                break;
            }
        }
        if (match)
            return 1;
    }
    return 0;
}

static char *json_extract_string(const char *json, int json_len, const char *key, int *out_len)
{
    if (!json || json_len <= 0 || !key || !out_len)
        return NULL;

    int key_len = (int)strlen(key);
    int pattern_len = key_len + 2;
    char *pattern = (char *)malloc(pattern_len + 1);
    if (!pattern)
        return NULL;
    pattern[0] = '"';
    memcpy(pattern + 1, key, key_len);
    pattern[pattern_len - 1] = '"';
    pattern[pattern_len] = '\0';

    const char *found = NULL;
    for (int i = 0; i + pattern_len <= json_len; i++)
    {
        if (memcmp(json + i, pattern, pattern_len) == 0)
        {
            found = json + i + pattern_len;
            break;
        }
    }
    free(pattern);
    if (!found)
        return NULL;

    const char *p = found;
    const char *end = json + json_len;
    while (p < end && (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n'))
        p++;
    if (p >= end || *p != ':')
        return NULL;
    p++;
    while (p < end && (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n'))
        p++;
    if (p >= end || *p != '"')
        return NULL;
    p++;

    char *out = (char *)malloc((size_t)json_len + 1);
    if (!out)
        return NULL;
    int w = 0;

    while (p < end)
    {
        unsigned char c = (unsigned char)*p++;
        if (c == '"')
            break;
        if (c == '\\')
        {
            if (p >= end)
            {
                free(out);
                return NULL;
            }
            unsigned char esc = (unsigned char)*p++;
            switch (esc)
            {
            case '"':
            case '\\':
            case '/':
                out[w++] = (char)esc;
                break;
            case 'b':
                out[w++] = '\b';
                break;
            case 'f':
                out[w++] = '\f';
                break;
            case 'n':
                out[w++] = '\n';
                break;
            case 'r':
                out[w++] = '\r';
                break;
            case 't':
                out[w++] = '\t';
                break;
            case 'u':
            {
                if (end - p < 4)
                {
                    free(out);
                    return NULL;
                }
                unsigned int code = 0;
                for (int i = 0; i < 4; i++)
                {
                    unsigned char h = (unsigned char)p[i];
                    code <<= 4;
                    if (h >= '0' && h <= '9')
                        code |= (h - '0');
                    else if (h >= 'a' && h <= 'f')
                        code |= (h - 'a' + 10);
                    else if (h >= 'A' && h <= 'F')
                        code |= (h - 'A' + 10);
                    else
                    {
                        free(out);
                        return NULL;
                    }
                }
                p += 4;
                if (code <= 0x7F)
                {
                    out[w++] = (char)code;
                }
                else if (code <= 0x7FF)
                {
                    out[w++] = (char)(0xC0 | ((code >> 6) & 0x1F));
                    out[w++] = (char)(0x80 | (code & 0x3F));
                }
                else
                {
                    out[w++] = (char)(0xE0 | ((code >> 12) & 0x0F));
                    out[w++] = (char)(0x80 | ((code >> 6) & 0x3F));
                    out[w++] = (char)(0x80 | (code & 0x3F));
                }
                break;
            }
            default:
                free(out);
                return NULL;
            }
        }
        else
        {
            out[w++] = (char)c;
        }
    }

    out[w] = '\0';
    *out_len = w;
    return out;
}

static char *json_escape_utf8(const unsigned char *data, int len)
{
    if (!data || len < 0)
        return NULL;

    size_t cap = (size_t)len * 6 + 1;
    char *out = (char *)malloc(cap);
    if (!out)
        return NULL;

    size_t w = 0;
    for (int i = 0; i < len; i++)
    {
        unsigned char c = data[i];
        if (c == '"')
        {
            out[w++] = '\\';
            out[w++] = '"';
        }
        else if (c == '\\')
        {
            out[w++] = '\\';
            out[w++] = '\\';
        }
        else if (c == '\b')
        {
            out[w++] = '\\';
            out[w++] = 'b';
        }
        else if (c == '\f')
        {
            out[w++] = '\\';
            out[w++] = 'f';
        }
        else if (c == '\n')
        {
            out[w++] = '\\';
            out[w++] = 'n';
        }
        else if (c == '\r')
        {
            out[w++] = '\\';
            out[w++] = 'r';
        }
        else if (c == '\t')
        {
            out[w++] = '\\';
            out[w++] = 't';
        }
        else if (c < 0x20)
        {
            int n = snprintf(out + w, cap - w, "\\u%04X", (unsigned int)c);
            if (n < 0)
            {
                free(out);
                return NULL;
            }
            w += (size_t)n;
        }
        else
        {
            out[w++] = (char)c;
        }
    }

    out[w] = '\0';
    return out;
}

static void handle_options(SOCKET client)
{
    send_bytes(client, "204 No Content", "text/plain", (const unsigned char *)"", 0);
}

static void handle_compress(SOCKET client, const unsigned char *body, int body_len, int is_json)
{
    if (body_len < 0 || body_len > MAX_BODY_BYTES)
    {
        send_error_json(client, "413 Payload Too Large", "Body too large");
        return;
    }

    const unsigned char *input = body;
    int input_len = body_len;

    if (is_json)
    {
        int extracted_len = 0;
        char *text = json_extract_string((const char *)body, body_len, "text", &extracted_len);
        if (!text)
        {
            send_error_json(client, "400 Bad Request", "Invalid JSON");
            return;
        }
        input = (const unsigned char *)text;
        input_len = extracted_len;

        char *base64 = NULL;
        char *tree_data = NULL;
        int original_size = 0;
        int compressed_size = 0;
        int ok = huffman_compress_text(input, input_len, &base64, &tree_data, &original_size, &compressed_size);
        free(text);
        if (!ok || !base64 || !tree_data)
        {
            if (base64)
                huffman_free(base64);
            if (tree_data)
                huffman_free(tree_data);
            send_error_json(client, "500 Internal Server Error", "Compress failed");
            return;
        }

        size_t json_cap = strlen(base64) + strlen(tree_data) + 256;
        char *json = (char *)malloc(json_cap);
        if (!json)
        {
            huffman_free(base64);
            huffman_free(tree_data);
            send_error_json(client, "500 Internal Server Error", "Out of memory");
            return;
        }

        snprintf(
            json,
            json_cap,
            "{\"success\":true,\"base64\":\"%s\",\"treeData\":\"%s\",\"originalSize\":%d,\"compressedSize\":%d}",
            base64,
            tree_data,
            original_size,
            compressed_size);

        send_json(client, "200 OK", json);
        free(json);
        huffman_free(base64);
        huffman_free(tree_data);
        return;
    }

    char *base64 = NULL;
    char *tree_data = NULL;
    int original_size = 0;
    int compressed_size = 0;
    if (!huffman_compress_text(input, input_len, &base64, &tree_data, &original_size, &compressed_size))
    {
        if (base64)
            huffman_free(base64);
        if (tree_data)
            huffman_free(tree_data);
        send_error_json(client, "500 Internal Server Error", "Compress failed");
        return;
    }

    if (!base64 || !tree_data)
    {
        if (base64)
            huffman_free(base64);
        if (tree_data)
            huffman_free(tree_data);
        send_error_json(client, "500 Internal Server Error", "Compress failed");
        return;
    }

    size_t json_cap = strlen(base64) + strlen(tree_data) + 256;
    char *json = (char *)malloc(json_cap);
    if (!json)
    {
        huffman_free(base64);
        huffman_free(tree_data);
        send_error_json(client, "500 Internal Server Error", "Out of memory");
        return;
    }

    snprintf(
        json,
        json_cap,
        "{\"success\":true,\"base64\":\"%s\",\"treeData\":\"%s\",\"originalSize\":%d,\"compressedSize\":%d}",
        base64,
        tree_data,
        original_size,
        compressed_size);

    send_json(client, "200 OK", json);
    free(json);
    huffman_free(base64);
    huffman_free(tree_data);
}

static void handle_decompress(SOCKET client, const unsigned char *body, int body_len)
{
    if (body_len < 0 || body_len > MAX_BODY_BYTES)
    {
        send_error_json(client, "413 Payload Too Large", "Body too large");
        return;
    }
    if (body_len <= 0 || body[0] != '{')
    {
        send_error_json(client, "400 Bad Request", "JSON required");
        return;
    }

    int base64_len = 0;
    int tree_len = 0;
    char *base64 = json_extract_string((const char *)body, body_len, "base64", &base64_len);
    char *tree = json_extract_string((const char *)body, body_len, "treeData", &tree_len);
    if (!base64 || !tree)
    {
        if (base64)
            free(base64);
        if (tree)
            free(tree);
        send_error_json(client, "400 Bad Request", "Invalid JSON");
        return;
    }

    unsigned char *out_text = NULL;
    int out_len = 0;
    int ok = huffman_decompress_text(base64, tree, &out_text, &out_len);
    free(base64);
    free(tree);

    if (!ok || !out_text)
    {
        if (out_text)
            huffman_free(out_text);
        send_error_json(client, "400 Bad Request", "Decompress failed");
        return;
    }

    char *escaped = json_escape_utf8(out_text, out_len);
    huffman_free(out_text);
    if (!escaped)
    {
        send_error_json(client, "500 Internal Server Error", "Out of memory");
        return;
    }

    size_t json_cap = strlen(escaped) + 128;
    char *json = (char *)malloc(json_cap);
    if (!json)
    {
        free(escaped);
        send_error_json(client, "500 Internal Server Error", "Out of memory");
        return;
    }

    snprintf(json, json_cap, "{\"success\":true,\"text\":\"%s\",\"size\":%d}", escaped, out_len);
    send_json(client, "200 OK", json);
    free(json);
    free(escaped);
}

static int get_port()
{
    const char *env = getenv("HUFFMAN_PORT");
    if (!env || !*env)
        return DEFAULT_PORT;
    long v = strtol(env, NULL, 10);
    if (v <= 0 || v > 65535)
        return DEFAULT_PORT;
    return (int)v;
}

int main()
{
    SetConsoleOutputCP(CP_UTF8);
    SetConsoleCP(CP_UTF8);
    _setmode(_fileno(stdout), _O_BINARY);
    _setmode(_fileno(stderr), _O_BINARY);

    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0)
    {
        fprintf(stderr, "WSAStartup failed: %d\n", WSAGetLastError());
        return 1;
    }

    SOCKET server_socket = socket(AF_INET, SOCK_STREAM, 0);
    if (server_socket == INVALID_SOCKET)
    {
        fprintf(stderr, "Socket failed: %d\n", WSAGetLastError());
        WSACleanup();
        return 1;
    }

    int opt = 1;
    setsockopt(server_socket, SOL_SOCKET, SO_REUSEADDR, (const char *)&opt, sizeof(opt));

    struct sockaddr_in server_addr;
    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    int port = get_port();
    server_addr.sin_port = htons((u_short)port);

    if (bind(server_socket, (struct sockaddr *)&server_addr, sizeof(server_addr)) == SOCKET_ERROR)
    {
        fprintf(stderr, "Bind failed on port %d: %d\n", port, WSAGetLastError());
        closesocket(server_socket);
        WSACleanup();
        return 1;
    }

    if (listen(server_socket, 16) == SOCKET_ERROR)
    {
        fprintf(stderr, "Listen failed: %d\n", WSAGetLastError());
        closesocket(server_socket);
        WSACleanup();
        return 1;
    }

    printf("=========================================\n");
    printf("[Huffman Service] Running\n");
    printf("Port: http://localhost:%d\n", port);
    printf("Routes:\n");
    printf("  POST /api/huffman/compress\n");
    printf("  POST /api/huffman/decompress\n");
    printf("Ctrl+C to quit\n");
    printf("=========================================\n");
    fflush(stdout);

    while (1)
    {
        struct sockaddr_in client_addr;
        int client_len = sizeof(client_addr);
        SOCKET client = accept(server_socket, (struct sockaddr *)&client_addr, &client_len);
        if (client == INVALID_SOCKET)
        {
            int err = WSAGetLastError();
            if (err == WSAEINTR)
                break;
            continue;
        }

        DWORD timeout = 2000;
        setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, (const char *)&timeout, sizeof(timeout));

        size_t buf_cap = MAX_HEADER_BYTES + MAX_BODY_BYTES + 1;
        unsigned char *buf = (unsigned char *)malloc(buf_cap);
        if (!buf)
        {
            closesocket(client);
            continue;
        }

        int total = 0;
        while (total < (int)buf_cap - 1)
        {
            int bytes = recv(client, (char *)buf + total, (int)buf_cap - 1 - total, 0);
            if (bytes <= 0)
                break;
            total += bytes;
            buf[total] = '\0';

            unsigned char *header_end = (unsigned char *)strstr((const char *)buf, "\r\n\r\n");
            if (!header_end)
                continue;

            int content_length = 0;
            int has_cl = parse_content_length((const char *)buf, &content_length);
            if (has_cl)
            {
                if (content_length > MAX_BODY_BYTES)
                    break;
                unsigned char *body_start = header_end + 4;
                int have = total - (int)(body_start - buf);
                if (have >= content_length)
                    break;
            }
            else
            {
                break;
            }
        }

        if (total <= 0)
        {
            free(buf);
            closesocket(client);
            continue;
        }

        char method[16] = {0};
        char url[512] = {0};
        sscanf((const char *)buf, "%15s %511s", method, url);

        unsigned char *header_end = (unsigned char *)strstr((const char *)buf, "\r\n\r\n");
        unsigned char *body_start = header_end ? (header_end + 4) : buf + total;
        int body_len = 0;
        int content_length = 0;
        if (parse_content_length((const char *)buf, &content_length))
        {
            body_len = content_length;
        }
        else
        {
            body_len = total - (int)(body_start - buf);
        }

        if (body_len < 0)
            body_len = 0;
        if (body_len > MAX_BODY_BYTES)
        {
            send_error_json(client, "413 Payload Too Large", "Body too large");
            free(buf);
            closesocket(client);
            continue;
        }

        if (strcmp(method, "OPTIONS") == 0)
        {
            handle_options(client);
        }
        else if (strcmp(method, "POST") == 0 && strcmp(url, "/api/huffman/compress") == 0)
        {
            int is_json = content_type_is_json((const char *)buf);
            handle_compress(client, body_start, body_len, is_json);
        }
        else if (strcmp(method, "POST") == 0 && strcmp(url, "/api/huffman/decompress") == 0)
        {
            handle_decompress(client, body_start, body_len);
        }
        else
        {
            send_error_json(client, "404 Not Found", "Route not found");
        }

        free(buf);
        closesocket(client);
    }

    closesocket(server_socket);
    WSACleanup();
    return 0;
}
